/**
 * Chat — général (tout le site) + salle (membres uniquement).
 */

import { getRoom, redisCommand, redisConfigured } from './rooms.js'

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

  return { ok: true, message }
}

const PRESENCE_KEY = 'quizz:presence:site'
/** Considéré en ligne si ping < 45s */
const ONLINE_WINDOW_MS = 45_000
const memoryPresence = new Map<string, number>()

function pruneMemoryPresence(now: number): number {
  const cutoff = now - ONLINE_WINDOW_MS
  for (const [id, at] of memoryPresence) {
    if (at < cutoff) memoryPresence.delete(id)
  }
  return memoryPresence.size
}

/**
 * Heartbeat présence site-wide. Retourne le nombre de joueurs en ligne.
 */
export async function touchSitePresence(playerId: string): Promise<number> {
  const id = String(playerId ?? '').trim().slice(0, 64)
  if (!id) return 0
  const now = Date.now()

  if (redisConfigured()) {
    try {
      await redisCommand('ZADD', PRESENCE_KEY, now, id)
      await redisCommand(
        'ZREMRANGEBYSCORE',
        PRESENCE_KEY,
        0,
        now - ONLINE_WINDOW_MS,
      )
      await redisCommand('EXPIRE', PRESENCE_KEY, 120)
      const n = await redisCommand<number>('ZCARD', PRESENCE_KEY)
      if (typeof n === 'number' && n >= 0) return n
    } catch {
      /* fallback mémoire */
    }
  }

  memoryPresence.set(id, now)
  return pruneMemoryPresence(now)
}
