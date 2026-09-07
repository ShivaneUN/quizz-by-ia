/**
 * Chat — général (tout le site) + salle (membres uniquement).
 */

import { getRoom, listActiveRooms, redisCommand, redisConfigured } from './rooms.js'
import { lookupProfileIdByPseudoFast } from './profileStorage.js'

export type ChatChannel = 'global' | 'room'

export interface ChatMessage {
  id: string
  channel: ChatChannel
  roomCode?: string
  playerId: string
  playerName: string
  text: string
  at: number
}

const MAX_MESSAGES = 80
const MAX_TEXT = 200
const GLOBAL_KEY = 'quizz:chat:global'
const CLEARED_AT_KEY = 'quizz:chat:clearedAt'
const memoryGlobal: ChatMessage[] = []
const memoryRooms = new Map<string, ChatMessage[]>()
let memoryClearedAt = 0

function roomChatKey(code: string): string {
  return `quizz:chat:room:${code.toUpperCase()}`
}

function newMsgId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeText(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
  if (text.length < 1) return null
  return text
}

function pushMemory(list: ChatMessage[], msg: ChatMessage): void {
  list.push(msg)
  if (list.length > MAX_MESSAGES) {
    list.splice(0, list.length - MAX_MESSAGES)
  }
}

async function appendRedis(key: string, msg: ChatMessage): Promise<void> {
  if (!redisConfigured()) return
  try {
    await redisCommand('RPUSH', key, JSON.stringify(msg))
    await redisCommand('LTRIM', key, -MAX_MESSAGES, -1)
    await redisCommand('EXPIRE', key, 60 * 60 * 2)
  } catch {
    /* ignore */
  }
}

async function readRedis(key: string): Promise<ChatMessage[] | null> {
  if (!redisConfigured()) return null
  try {
    const raw = await redisCommand<string[] | null>('LRANGE', key, 0, -1)
    if (!Array.isArray(raw)) return []
    const out: ChatMessage[] = []
    for (const row of raw) {
      try {
        const m = JSON.parse(row) as ChatMessage
        if (m?.id && m.text && m.playerName) out.push(m)
      } catch {
        /* skip */
      }
    }
    return out
  } catch {
    return null
  }
}

export async function getChatClearedAt(): Promise<number> {
  if (redisConfigured()) {
    try {
      const raw = await redisCommand<string | number | null>('GET', CLEARED_AT_KEY)
      const n = Number(raw)
      if (Number.isFinite(n) && n > 0) {
        memoryClearedAt = Math.max(memoryClearedAt, n)
        return memoryClearedAt
      }
    } catch {
      /* ignore */
    }
  }
  return memoryClearedAt
}

/** Vide le chat pour tout le monde (général + salles en mémoire / Redis). */
export async function clearChatForEveryone(): Promise<number> {
  const at = Date.now()
  memoryClearedAt = at
  memoryGlobal.length = 0
  memoryRooms.clear()

  if (redisConfigured()) {
    try {
      await redisCommand('DEL', GLOBAL_KEY)
      await redisCommand('SET', CLEARED_AT_KEY, String(at))
      await redisCommand('EXPIRE', CLEARED_AT_KEY, 60 * 60 * 24 * 30)
      const keys = await redisCommand<string[] | null>('KEYS', 'quizz:chat:room:*')
      if (Array.isArray(keys)) {
        for (const k of keys) {
          if (typeof k === 'string' && k.startsWith('quizz:chat:room:')) {
            await redisCommand('DEL', k)
          }
        }
      }
    } catch {
      /* mémoire déjà vide */
    }
  }

  return at
}

export async function listChatMessages(input: {
  channel: ChatChannel
  roomCode?: string
  afterId?: string
}): Promise<{ messages: ChatMessage[]; clearedAt: number }> {
  const clearedAt = await getChatClearedAt()
  let all: ChatMessage[] = []

  if (input.channel === 'global') {
    const fromRedis = await readRedis(GLOBAL_KEY)
    all = fromRedis ?? [...memoryGlobal]
  } else {
    const code = String(input.roomCode ?? '')
      .trim()
      .toUpperCase()
    if (!code) return { messages: [], clearedAt }
    const fromRedis = await readRedis(roomChatKey(code))
    all = fromRedis ?? [...(memoryRooms.get(code) ?? [])]
  }

  // Après un clear serveur, ignorer l’historique antérieur
  all = all.filter((m) => m.at > clearedAt)

  if (!input.afterId) return { messages: all, clearedAt }
  const idx = all.findIndex((m) => m.id === input.afterId)
  if (idx < 0) return { messages: all, clearedAt }
  return { messages: all.slice(idx + 1), clearedAt }
}

export async function sendChatMessage(input: {
  channel: ChatChannel
  roomCode?: string
  playerId: string
  playerName: string
  text: string
}): Promise<{ ok: true; message: ChatMessage } | { ok: false; error: string }> {
  const text = sanitizeText(input.text)
  if (!text) return { ok: false, error: 'Message vide' }

  const playerId = String(input.playerId ?? '').trim()
  const playerName = String(input.playerName ?? '').trim().slice(0, 24)
  if (!playerId || playerName.length < 2) {
    return { ok: false, error: 'Pseudo requis (2 caractères min.)' }
  }

  const channel = input.channel === 'room' ? 'room' : 'global'
  const code = String(input.roomCode ?? '')
    .trim()
    .toUpperCase()

  if (channel === 'room') {
    if (!code) return { ok: false, error: 'Salle requise' }
    const room = await getRoom(code)
    if (!room) return { ok: false, error: 'Salle introuvable' }
    if (!room.players.some((p) => p.id === playerId)) {
      return { ok: false, error: 'Réservé aux joueurs de la salle' }
    }
  }

  const message: ChatMessage = {
    id: newMsgId(),
    channel,
    roomCode: channel === 'room' ? code : undefined,
    playerId,
    playerName,
    text,
    at: Date.now(),
  }

  if (channel === 'global') {
    pushMemory(memoryGlobal, message)
    await appendRedis(GLOBAL_KEY, message)
  } else {
    const list = memoryRooms.get(code) ?? []
    pushMemory(list, message)
    memoryRooms.set(code, list)
    await appendRedis(roomChatKey(code), message)
  }

  void touchSitePresence(playerId, playerName)

  return { ok: true, message }
}

const PRESENCE_KEY = 'quizz:presence:site'
const PRESENCE_NAMES_KEY = 'quizz:presence:names'
/** Considéré en ligne si ping < 45s */
const ONLINE_WINDOW_MS = 45_000
const memoryPresence = new Map<string, { at: number; name: string; profile: boolean }>()

function sanitizePresenceName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
}

function parsePresenceRec(raw: unknown): PresenceRec | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if ('name' in o) {
      const name = sanitizePresenceName(o.name)
      if (name.length < 2) return null
      return { name, profile: o.profile === true }
    }
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('{')) {
      try {
        return parsePresenceRec(JSON.parse(trimmed) as unknown)
      } catch {
        /* plain name */
      }
    }
    const name = sanitizePresenceName(trimmed)
    if (name.length < 2) return null
    return { name, profile: false }
  }
  return null
}

function presenceHashFromRaw(raw: unknown): Record<string, PresenceRec> {
  const out: Record<string, PresenceRec> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const rec = parsePresenceRec(v)
      if (rec) out[k] = rec
    }
    return out
  }
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const rec = parsePresenceRec(raw[i + 1])
      if (rec) out[String(raw[i])] = rec
    }
  }
  return out
}

function idsFromZrange(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((v) => String(v ?? '').trim())
    .filter((id) => id.length > 0)
}

async function namesFromRecentChat(): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  const apply = (list: ChatMessage[]) => {
    for (const m of list) {
      const pid = String(m.playerId ?? '').trim()
      const n = sanitizePresenceName(m.playerName)
      if (pid && n.length >= 2) map[pid] = n
    }
  }
  apply(memoryGlobal)
  for (const list of memoryRooms.values()) apply(list)
  const fromRedis = await readRedis(GLOBAL_KEY)
  if (fromRedis) apply(fromRedis)
  return map
}

async function namesFromActiveRooms(): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  try {
    const rooms = await listActiveRooms()
    for (const summary of rooms.slice(0, 20)) {
      const room = await getRoom(summary.code)
      if (!room) continue
      for (const p of room.players) {
        const n = sanitizePresenceName(p.name)
        if (p.id && n.length >= 2) map[p.id] = n
      }
    }
  } catch {
    /* ignore */
  }
  return map
}

type PresenceRec = { name: string; profile: boolean }

export type OnlinePerson = { name: string; self: boolean; profile: boolean }

export type SitePresence = {
  online: number
  names: string[]
  people: OnlinePerson[]
}

function buildPeople(
  ids: string[],
  byId: Record<string, PresenceRec>,
  selfId: string,
): OnlinePerson[] {
  const people: OnlinePerson[] = []
  for (const pid of ids) {
    const rec = byId[pid]
    const name = rec?.name
    if (!name) continue
    people.push({
      name,
      self: pid === selfId,
      profile: rec.profile === true,
    })
  }
  people.sort((a, b) => {
    if (a.profile !== b.profile) return a.profile ? -1 : 1
    if (a.self !== b.self) return a.self ? -1 : 1
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  })
  return people
}

async function markRegisteredProfiles(
  byId: Record<string, PresenceRec>,
): Promise<void> {
  const names = [
    ...new Set(
      Object.values(byId)
        .filter((r) => !r.profile)
        .map((r) => r.name),
    ),
  ]
  await Promise.all(
    names.map(async (name) => {
      const owned = await lookupProfileIdByPseudoFast(name)
      if (!owned) return
      for (const rec of Object.values(byId)) {
        if (rec.name === name) rec.profile = true
      }
    }),
  )
}

function presenceResult(
  ids: string[],
  byId: Record<string, PresenceRec>,
  selfId: string,
): SitePresence {
  const people = buildPeople(ids, byId, selfId)
  return {
    online: ids.length,
    names: people.map((p) => p.name),
    people,
  }
}

/**
 * Heartbeat présence site-wide. Retourne le nombre de joueurs et leurs pseudos.
 */
export async function touchSitePresence(
  playerId: string,
  playerName?: string,
  hasProfile = false,
): Promise<SitePresence> {
  const id = String(playerId ?? '').trim().slice(0, 64)
  if (!id) return { online: 0, names: [], people: [] }
  const now = Date.now()
  const name = sanitizePresenceName(playerName)

  const fillMissing = async (ids: string[], byId: Record<string, PresenceRec>) => {
    const missing = ids.filter((pid) => !byId[pid]?.name)
    if (missing.length === 0) return
    const fromChat = await namesFromRecentChat()
    const fromRooms = missing.some((pid) => !fromChat[pid])
      ? await namesFromActiveRooms()
      : {}
    for (const pid of missing) {
      const found = fromChat[pid] || fromRooms[pid]
      if (!found) continue
      byId[pid] = { name: found, profile: byId[pid]?.profile === true }
    }
  }

  if (redisConfigured()) {
    try {
      await redisCommand('ZADD', PRESENCE_KEY, now, id)
      if (name.length >= 2) {
        await redisCommand(
          'HSET',
          PRESENCE_NAMES_KEY,
          id,
          JSON.stringify({ name, profile: hasProfile === true }),
        )
      }
      await redisCommand(
        'ZREMRANGEBYSCORE',
        PRESENCE_KEY,
        0,
        now - ONLINE_WINDOW_MS,
      )
      await redisCommand('EXPIRE', PRESENCE_KEY, 120)
      await redisCommand('EXPIRE', PRESENCE_NAMES_KEY, 60 * 60 * 24 * 7)
      const ids = idsFromZrange(
        await redisCommand<unknown>('ZRANGE', PRESENCE_KEY, 0, -1),
      )
      const byId = presenceHashFromRaw(
        await redisCommand<unknown>('HGETALL', PRESENCE_NAMES_KEY),
      )
      await fillMissing(ids, byId)
      await markRegisteredProfiles(byId)
      return presenceResult(ids, byId, id)
    } catch {
      /* fallback mémoire */
    }
  }

  memoryPresence.set(id, { at: now, name, profile: hasProfile === true })
  const cutoff = now - ONLINE_WINDOW_MS
  const ids: string[] = []
  const byId: Record<string, PresenceRec> = {}
  for (const [pid, row] of memoryPresence) {
    if (row.at < cutoff) {
      memoryPresence.delete(pid)
      continue
    }
    ids.push(pid)
    if (row.name.length >= 2) {
      byId[pid] = { name: row.name, profile: row.profile === true }
    }
  }
  await fillMissing(ids, byId)
  await markRegisteredProfiles(byId)
  return presenceResult(ids, byId, id)
}
