/**
 * Salles morpion — Redis (prod) + mémoire (dev), préfixe dédié.
 * Ne touche pas aux salles quiz (`quizz:room:`).
 */

import {
  makeRoomCode,
  newPlayerId,
  redisCommand,
  redisConfigured,
} from './rooms.js'
import {
  emptyBoard,
  opponentOf,
  pickAiMove,
  winnerOf,
  type MorpionCell,
  type MorpionMark,
  type MorpionOutcome,
} from './morpionAi.js'

export type MorpionStatus = 'en_attente' | 'en_cours' | 'termine'
export type MorpionPlayerKind = 'humain' | 'ia'

export const AI_PLAYER_ID = '__ia__'
export const MORPION_TTL_SEC = 60 * 5
export const MORPION_LOCK_TTL_SEC = 5
/** Humain sans poll → considéré parti (comme la présence chat). */
export const MORPION_STALE_MS = 45_000
const INDEX_LIMIT = 40
const LOCK_RETRIES = 12
const LOCK_WAIT_MS = 40

export interface MorpionPlayer {
  id: string
  name: string
  kind: MorpionPlayerKind
  symbol: MorpionMark
  lastSeenAt: number
}

export interface MorpionRoom {
  code: string
  hostId: string
  status: MorpionStatus
  board: MorpionCell[]
  turn: MorpionMark
  winner: MorpionOutcome
  players: MorpionPlayer[]
  createdAt: number
  updatedAt: number
}

export interface MorpionPublic extends MorpionRoom {
  joinable: boolean
  vsAi: boolean
  humanCount: number
  serverNow: number
  storage: 'redis' | 'memory'
}

export interface MorpionSummary {
  code: string
  hostName: string
  status: MorpionStatus
  vsAi: boolean
  humanCount: number
  joinable: boolean
  turn: MorpionMark
  updatedAt: number
  opponentLabel: string
}

const memoryRooms = new Map<string, MorpionRoom>()
const memoryJoinable = new Set<string>()
const memoryActive = new Set<string>()
const memoryLocks = new Map<string, { token: string; expiresAt: number }>()

function roomKey(code: string): string {
  return `quizz:morpion:room:${code.toUpperCase()}`
}

function lockKey(code: string): string {
  return `quizz:morpion:lock:${code.toUpperCase()}`
}

function joinableKey(): string {
  return 'quizz:morpion:index:joinable'
}

function activeKey(): string {
  return 'quizz:morpion:index:active'
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function humanPlayers(room: MorpionRoom): MorpionPlayer[] {
  return room.players.filter((p) => p.kind === 'humain')
}

export function aiPlayer(room: MorpionRoom): MorpionPlayer | undefined {
  return room.players.find((p) => p.kind === 'ia')
}

export function isJoinable(room: MorpionRoom): boolean {
  return (
    room.status !== 'termine' &&
    humanPlayers(room).length === 1 &&
    Boolean(aiPlayer(room))
  )
}

function vsAi(room: MorpionRoom): boolean {
  return Boolean(aiPlayer(room))
}

function normalizeBoard(raw: unknown): MorpionCell[] {
  const board = emptyBoard()
  if (!Array.isArray(raw)) return board
  for (let i = 0; i < 9; i++) {
    const v = raw[i]
    board[i] = v === 'X' || v === 'O' ? v : null
  }
  return board
}

function normalizeRoom(raw: MorpionRoom): MorpionRoom {
  const board = normalizeBoard(raw.board)
  const status: MorpionStatus =
    raw.status === 'en_cours' || raw.status === 'termine' || raw.status === 'en_attente'
      ? raw.status
      : 'en_attente'
  const turn: MorpionMark = raw.turn === 'O' ? 'O' : 'X'
  const winner: MorpionOutcome =
    raw.winner === 'X' || raw.winner === 'O' || raw.winner === 'draw'
      ? raw.winner
      : null
  return {
    ...raw,
    code: String(raw.code ?? '').toUpperCase(),
    board,
    status,
    turn,
    winner,
    players: Array.isArray(raw.players) ? raw.players : [],
  }
}

function refreshStatus(room: MorpionRoom): void {
  const outcome = winnerOf(room.board)
  if (outcome) {
    room.status = 'termine'
    room.winner = outcome
    return
  }
  room.winner = null
  const marks = room.board.filter(Boolean).length
  room.status = marks === 0 ? 'en_attente' : 'en_cours'
}

function applyAiIfNeeded(room: MorpionRoom): void {
  if (room.status === 'termine') return
  const ai = aiPlayer(room)
  if (!ai) return
  if (room.turn !== ai.symbol) return
  const cell = pickAiMove(room.board, ai.symbol)
  if (cell == null) return
  room.board[cell] = ai.symbol
  const outcome = winnerOf(room.board)
  if (outcome) {
    room.status = 'termine'
    room.winner = outcome
    return
  }
  room.turn = opponentOf(ai.symbol)
  room.status = 'en_cours'
}

async function tryLock(code: string, token: string): Promise<boolean> {
  const c = code.toUpperCase()
  if (redisConfigured()) {
    const result = await redisCommand<string | null>(
      'SET',
      lockKey(c),
      token,
      'NX',
      'EX',
      MORPION_LOCK_TTL_SEC,
    )
    return result === 'OK'
  }
  const now = Date.now()
  const cur = memoryLocks.get(c)
  if (cur && cur.expiresAt > now) return false
  memoryLocks.set(c, {
    token,
    expiresAt: now + MORPION_LOCK_TTL_SEC * 1000,
  })
  return true
}

async function releaseLock(code: string, token: string): Promise<void> {
  const c = code.toUpperCase()
  if (redisConfigured()) {
    try {
      const cur = await redisCommand<string | null>('GET', lockKey(c))
      if (cur === token) await redisCommand('DEL', lockKey(c))
    } catch {
      /* best effort */
    }
    return
  }
  const cur = memoryLocks.get(c)
  if (cur?.token === token) memoryLocks.delete(c)
}

async function withRoomLock<T>(
  code: string,
  fn: () => Promise<T>,
): Promise<T> {
  const c = code.trim().toUpperCase()
  const token = newPlayerId()
  for (let i = 0; i < LOCK_RETRIES; i++) {
    if (await tryLock(c, token)) {
      try {
        return await fn()
      } finally {
        await releaseLock(c, token)
      }
    }
    await sleep(LOCK_WAIT_MS)
  }
  throw new Error('Salle occupée, réessaie')
}

async function readIndex(key: string): Promise<string[]> {
  if (redisConfigured()) {
    const raw = await redisCommand<unknown>('ZREVRANGE', key, 0, INDEX_LIMIT - 1)
    if (!Array.isArray(raw)) return []
    return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
  }
  const set = key === joinableKey() ? memoryJoinable : memoryActive
  return [...set]
}

async function indexSave(room: MorpionRoom): Promise<void> {
  const code = room.code
  const score = room.updatedAt
  if (redisConfigured()) {
    await redisCommand('ZADD', activeKey(), score, code)
    await redisCommand('EXPIRE', activeKey(), MORPION_TTL_SEC * 2)
    if (isJoinable(room)) {
      await redisCommand('ZADD', joinableKey(), score, code)
    } else {
      await redisCommand('ZREM', joinableKey(), code)
    }
    await redisCommand('EXPIRE', joinableKey(), MORPION_TTL_SEC * 2)
    await redisCommand(
      'ZREMRANGEBYRANK',
      activeKey(),
      0,
      -(INDEX_LIMIT + 1),
    )
    await redisCommand(
      'ZREMRANGEBYRANK',
      joinableKey(),
      0,
      -(INDEX_LIMIT + 1),
    )
    return
  }
  memoryActive.add(code)
  if (isJoinable(room)) memoryJoinable.add(code)
  else memoryJoinable.delete(code)
}

async function indexRemove(code: string): Promise<void> {
  const c = code.toUpperCase()
  if (redisConfigured()) {
    await redisCommand('ZREM', activeKey(), c)
    await redisCommand('ZREM', joinableKey(), c)
    return
  }
  memoryActive.delete(c)
  memoryJoinable.delete(c)
}

export async function getMorpion(code: string): Promise<MorpionRoom | null> {
  const c = code.trim().toUpperCase()
  if (!c) return null
  let room: MorpionRoom | null = null
  if (redisConfigured()) {
    const raw = await redisCommand<string | null>('GET', roomKey(c))
    if (!raw) return null
    room = normalizeRoom(JSON.parse(raw) as MorpionRoom)
  } else {
    const mem = memoryRooms.get(c)
    room = mem ? normalizeRoom(mem) : null
  }
  return room
}

export async function saveMorpion(room: MorpionRoom): Promise<void> {
  room.updatedAt = Date.now()
  if (redisConfigured()) {
    await redisCommand(
      'SET',
      roomKey(room.code),
      JSON.stringify(room),
      'EX',
      MORPION_TTL_SEC,
    )
    await indexSave(room)
    return
  }
  memoryRooms.set(room.code, room)
  await indexSave(room)
}

export async function deleteMorpion(code: string): Promise<void> {
  const c = code.trim().toUpperCase()
  if (redisConfigured()) {
    await redisCommand('DEL', roomKey(c))
    await indexRemove(c)
    return
  }
  memoryRooms.delete(c)
  await indexRemove(c)
}

export async function touchMorpion(code: string): Promise<void> {
  const c = code.trim().toUpperCase()
  if (!redisConfigured()) return
  await redisCommand('EXPIRE', roomKey(c), MORPION_TTL_SEC)
}

export function publicMorpion(room: MorpionRoom): MorpionPublic {
  return {
    ...room,
    joinable: isJoinable(room),
    vsAi: vsAi(room),
    humanCount: humanPlayers(room).length,
    serverNow: Date.now(),
    storage: redisConfigured() ? 'redis' : 'memory',
  }
}

export function summarizeMorpion(room: MorpionRoom): MorpionSummary {
  const humans = humanPlayers(room)
  const host = room.players.find((p) => p.id === room.hostId)
  const other = humans.find((p) => p.id !== room.hostId)
  return {
    code: room.code,
    hostName: host?.name ?? 'Hôte',
    status: room.status,
    vsAi: vsAi(room),
    humanCount: humans.length,
    joinable: isJoinable(room),
    turn: room.turn,
    updatedAt: room.updatedAt,
    opponentLabel: vsAi(room) ? 'IA' : (other?.name ?? 'Joueur'),
  }
}

function newAiPlayer(now: number, symbol: MorpionMark): MorpionPlayer {
  return {
    id: AI_PLAYER_ID,
    name: 'IA',
    kind: 'ia',
    symbol,
    lastSeenAt: now,
  }
}

function replaceWithAi(player: MorpionPlayer, now: number): void {
  player.id = AI_PLAYER_ID
  player.name = 'IA'
  player.kind = 'ia'
  player.lastSeenAt = now
}

/** Retire un humain. `deleted` = plus personne → détruire la salle. */
function removeHuman(
  room: MorpionRoom,
  playerId: string,
  now: number,
): 'deleted' | 'changed' | 'ok' {
  const idx = room.players.findIndex(
    (p) => p.id === playerId && p.kind === 'humain',
  )
  if (idx === -1) return 'ok'
  const humans = humanPlayers(room)
  if (humans.length <= 1) return 'deleted'

  const leaving = room.players[idx]!
  const wasHost = room.hostId === playerId
  replaceWithAi(leaving, now)
  const remaining = humanPlayers(room)[0]
  if (wasHost && remaining) room.hostId = remaining.id
  refreshStatus(room)
  applyAiIfNeeded(room)
  return 'changed'
}

function pruneStaleHumans(
  room: MorpionRoom,
  now: number,
): 'deleted' | 'changed' | 'ok' {
  const staleIds = humanPlayers(room)
    .filter((p) => now - p.lastSeenAt > MORPION_STALE_MS)
    .map((p) => p.id)
  let changed = false
  for (const id of staleIds) {
    const result = removeHuman(room, id, now)
    if (result === 'deleted') return 'deleted'
    if (result === 'changed') changed = true
  }
  return changed ? 'changed' : 'ok'
}

export async function syncMorpion(
  code: string,
  playerId?: string,
): Promise<MorpionRoom | null> {
  return withRoomLock(code, async () => {
    const room = await getMorpion(code)
    if (!room) {
      await indexRemove(code.trim().toUpperCase())
      return null
    }
    const now = Date.now()
    let changed = false
    if (playerId) {
      const p = room.players.find(
        (pl) => pl.id === playerId && pl.kind === 'humain',
      )
      if (p && now - p.lastSeenAt > 8_000) {
        p.lastSeenAt = now
        changed = true
      }
    }
    const prune = pruneStaleHumans(room, now)
    if (prune === 'deleted') {
      await deleteMorpion(room.code)
      return null
    }
    if (prune === 'changed' || changed) {
      refreshStatus(room)
      await saveMorpion(room)
      return room
    }
    await touchMorpion(room.code)
    return room
  })
}

export async function createMorpion(playerName: string): Promise<{
  room: MorpionRoom
  playerId: string
}> {
  const name = playerName.trim().slice(0, 24)
  if (name.length < 2) throw new Error('Pseudo obligatoire (2 caractères min.)')

  let code = makeRoomCode()
  for (let i = 0; i < 8; i++) {
    if (!(await getMorpion(code))) break
    code = makeRoomCode()
  }

  return withRoomLock(code, async () => {
    const existing = await getMorpion(code)
    if (existing) throw new Error('Code déjà pris, réessaie')
    const now = Date.now()
    const playerId = newPlayerId()
    const room: MorpionRoom = {
      code,
      hostId: playerId,
      status: 'en_attente',
      board: emptyBoard(),
      turn: 'X',
      winner: null,
      players: [
        {
          id: playerId,
          name,
          kind: 'humain',
          symbol: 'X',
          lastSeenAt: now,
        },
        newAiPlayer(now, 'O'),
      ],
      createdAt: now,
      updatedAt: now,
    }
    await saveMorpion(room)
    return { room, playerId }
  })
}

export async function joinMorpion(
  code: string,
  playerName: string,
): Promise<{ room: MorpionRoom; playerId: string }> {
  const name = playerName.trim().slice(0, 24)
  if (name.length < 2) throw new Error('Pseudo obligatoire (2 caractères min.)')
  const c = code.trim().toUpperCase()
  if (!c) throw new Error('code requis')

  return withRoomLock(c, async () => {
    const room = await getMorpion(c)
    if (!room) throw new Error('Salle introuvable')
    if (pruneStaleHumans(room, Date.now()) === 'deleted') {
      await deleteMorpion(c)
      throw new Error('Salle introuvable')
    }

    const existing = room.players.find(
      (p) =>
        p.kind === 'humain' && p.name.toLowerCase() === name.toLowerCase(),
    )
    if (existing) {
      existing.lastSeenAt = Date.now()
      await saveMorpion(room)
      return { room, playerId: existing.id }
    }

    if (!isJoinable(room)) {
      throw new Error('Salle complète ou terminée')
    }
    const ai = aiPlayer(room)
    if (!ai) throw new Error('Salle complète ou terminée')

    const playerId = newPlayerId()
    const now = Date.now()
    ai.id = playerId
    ai.name = name
    ai.kind = 'humain'
    ai.lastSeenAt = now
    refreshStatus(room)
    await saveMorpion(room)
    return { room, playerId }
  })
}

export async function moveMorpion(
  code: string,
  playerId: string,
  cell: number,
): Promise<MorpionRoom> {
  const c = code.trim().toUpperCase()
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    throw new Error('Case invalide')
  }
  return withRoomLock(c, async () => {
    const room = await getMorpion(c)
    if (!room) throw new Error('Salle introuvable')
    const now = Date.now()
    if (pruneStaleHumans(room, now) === 'deleted') {
      await deleteMorpion(c)
      throw new Error('Salle introuvable')
    }
    refreshStatus(room)
    if (room.status === 'termine') return room

    const player = room.players.find(
      (p) => p.id === playerId && p.kind === 'humain',
    )
    if (!player) throw new Error('Joueur inconnu')
    player.lastSeenAt = now
    if (player.symbol !== room.turn) {
      throw new Error('Pas ton tour')
    }
    if (room.board[cell] != null) {
      throw new Error('Case déjà prise')
    }

    room.board[cell] = player.symbol
    const outcome = winnerOf(room.board)
    if (outcome) {
      room.status = 'termine'
      room.winner = outcome
      await saveMorpion(room)
      return room
    }
    room.turn = opponentOf(player.symbol)
    room.status = 'en_cours'
    applyAiIfNeeded(room)
    await saveMorpion(room)
    return room
  })
}

export async function replayMorpion(
  code: string,
  playerId: string,
): Promise<MorpionRoom> {
  const c = code.trim().toUpperCase()
  return withRoomLock(c, async () => {
    const room = await getMorpion(c)
    if (!room) throw new Error('Salle introuvable')
    const now = Date.now()
    if (pruneStaleHumans(room, now) === 'deleted') {
      await deleteMorpion(c)
      throw new Error('Salle introuvable')
    }
    const player = room.players.find(
      (p) => p.id === playerId && p.kind === 'humain',
    )
    if (!player) throw new Error('Joueur inconnu')
    player.lastSeenAt = now
    if (room.status !== 'termine') {
      await saveMorpion(room)
      return room
    }
    room.board = emptyBoard()
    room.turn = 'X'
    room.winner = null
    refreshStatus(room)
    applyAiIfNeeded(room)
    await saveMorpion(room)
    return room
  })
}

export async function leaveMorpion(
  code: string,
  playerId: string,
): Promise<{ left: boolean; closed: boolean; room: MorpionRoom | null }> {
  const c = code.trim().toUpperCase()
  return withRoomLock(c, async () => {
    const room = await getMorpion(c)
    if (!room) return { left: true, closed: true, room: null }
    const now = Date.now()
    const result = removeHuman(room, playerId, now)
    if (result === 'deleted') {
      await deleteMorpion(c)
      return { left: true, closed: true, room: null }
    }
    await saveMorpion(room)
    return { left: true, closed: false, room }
  })
}

export async function listMorpionRooms(): Promise<{
  joinable: MorpionSummary[]
  active: MorpionSummary[]
}> {
  const joinableCodes = await readIndex(joinableKey())
  const activeCodes = await readIndex(activeKey())
  const seen = new Set<string>()
  const joinable: MorpionSummary[] = []
  const active: MorpionSummary[] = []

  async function load(code: string): Promise<MorpionRoom | null> {
    try {
      return await getMorpion(code)
    } catch {
      return null
    }
  }

  for (const code of joinableCodes) {
    let room = await load(code)
    if (!room) {
      await indexRemove(code)
      continue
    }
    const current = room
    const host = current.players.find((p) => p.id === current.hostId)
    const now = Date.now()
    if (host && now - host.lastSeenAt > MORPION_STALE_MS) {
      room = await syncMorpion(code)
      if (!room) continue
    }
    if (isJoinable(room)) {
      joinable.push(summarizeMorpion(room))
      seen.add(room.code)
    } else {
      await indexSave(room)
    }
  }

  for (const code of activeCodes) {
    if (seen.has(code)) continue
    const room = await load(code)
    if (!room) {
      await indexRemove(code)
      continue
    }
    if (isJoinable(room)) {
      joinable.push(summarizeMorpion(room))
      continue
    }
    if (room.status === 'termine') continue
    if (humanPlayers(room).length >= 2) {
      active.push(summarizeMorpion(room))
    }
  }

  joinable.sort((a, b) => b.updatedAt - a.updatedAt)
  active.sort((a, b) => b.updatedAt - a.updatedAt)
  return { joinable, active }
}
