/**
 * Stockage des salles multi — mémoire (dev local) + Upstash Redis (prod Vercel).
 */

/** lobby | generating (IA) | playing | finished | error (génération échouée) */
export type RoomStatus =
  | 'lobby'
  | 'generating'
  | 'playing'
  | 'finished'
  | 'error'

/**
 * waiting = chrono pas encore lancé (hôte doit démarrer) ;
 * answering = les joueurs répondent ;
 * reveal = feedback, l’hôte passe à la suivante
 */
export type RoundPhase = 'waiting' | 'answering' | 'reveal'

export interface RoomPlayer {
  id: string
  name: string
  score: number
  joinedAt: number
}

export interface RoomQuestion {
  id: string
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  explanation?: string
  sourceType?: string
  imageUrl?: string
}

/** Réponse d’un joueur sur une manche (null = pas répondu / faux auto) */
export type RoundAnswers = Record<string, number | null>

export interface RoomState {
  code: string
  hostId: string
  status: RoomStatus
  theme: string
  scope: 'fr' | 'international'
  /** Chrono par question (hôte) — si false, on avance seulement quand tout le monde a répondu */
  timerEnabled: boolean
  /** Paliers (easy→hard, 10/10) ou difficulté libre */
  playMode: 'progression' | 'free'
  /** Difficulté des questions générées pour la manche */
  difficulty: 'easy' | 'medium' | 'hard'
  /** IA : auto (Groq→Gemini), groq ou gemini */
  aiProvider: 'auto' | 'groq' | 'gemini'
  /** Toujours standard en multi (images désactivées) */
  quizMode?: 'standard' | 'image'
  /** Message si status === 'error' */
  errorMessage?: string
  players: RoomPlayer[]
  questions: RoomQuestion[]
  questionIndex: number
  /** waiting | answering | reveal */
  roundPhase: RoundPhase
  /** Timestamp ms du début effectif du chrono (0 si waiting). */
  roundStartedAt: number
  roundDurationMs: number
  /** playerId → index réponse (absent = pas encore) */
  currentAnswers: Record<string, number>
  createdAt: number
  updatedAt: number
}

export const ROUND_MS = 10_000
export const MULTI_QUESTION_COUNT = 10
/** TTL Redis salle (inactivité) — rafraîchi à chaque save */
export const ROOM_TTL_SEC = 60 * 90

const memory = new Map<string, RoomState>()

function redisConfigured(): boolean {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN),
  )
}

async function redisCommand<T>(...args: (string | number)[]): Promise<T | null> {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  const res = await fetch(`${url}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Redis ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = (await res.json()) as { result?: T }
  return data.result ?? null
}

export { redisCommand, redisConfigured }

function roomKey(code: string): string {
  return `quizz:room:${code.toUpperCase()}`
}

function normalizeRoomStatus(raw: string | undefined): RoomStatus {
  if (
    raw === 'lobby' ||
    raw === 'generating' ||
    raw === 'playing' ||
    raw === 'finished' ||
    raw === 'error'
  ) {
    return raw
  }
  return 'lobby'
}

export async function getRoom(code: string): Promise<RoomState | null> {
  const c = code.trim().toUpperCase()
  let room: RoomState | null = null
  if (redisConfigured()) {
    const raw = await redisCommand<string | null>('GET', roomKey(c))
    if (!raw) return null
    room = JSON.parse(raw) as RoomState
  } else {
    room = memory.get(c) ?? null
  }
  if (!room) return null
  // Compat salles anciennes
  room.status = normalizeRoomStatus(room.status)
  if (typeof room.timerEnabled !== 'boolean') {
    room.timerEnabled = true
  }
  if (
    room.difficulty !== 'easy' &&
    room.difficulty !== 'medium' &&
    room.difficulty !== 'hard'
  ) {
    room.difficulty = 'easy'
  }
  if (room.playMode !== 'progression' && room.playMode !== 'free') {
    room.playMode = 'free'
  }
  if (
    room.roundPhase !== 'waiting' &&
    room.roundPhase !== 'answering' &&
    room.roundPhase !== 'reveal'
  ) {
    room.roundPhase = 'answering'
  }
  room.quizMode = 'standard'
  return room
}

export async function saveRoom(room: RoomState): Promise<void> {
  room.updatedAt = Date.now()
  room.quizMode = 'standard'
  if (redisConfigured()) {
    await redisCommand(
      'SET',
      roomKey(room.code),
      JSON.stringify(room),
      'EX',
      ROOM_TTL_SEC,
    )
    return
  }
  memory.set(room.code, room)
}

export async function deleteRoom(code: string): Promise<void> {
  const c = code.trim().toUpperCase()
  if (redisConfigured()) {
    await redisCommand('DEL', roomKey(c))
    return
  }
  memory.delete(c)
}

export function newPlayerId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

/**
 * Prépare une manche : sans chrono → answering immédiat ;
 * avec chrono → waiting (l’hôte lance avec hostBeginRound).
 */
export function prepareRound(room: RoomState, now = Date.now()): void {
  room.currentAnswers = {}
  if (room.timerEnabled === false) {
    room.roundPhase = 'answering'
    room.roundStartedAt = now
    return
  }
  room.roundPhase = 'waiting'
  room.roundStartedAt = 0
}

/** Hôte : démarre le chrono de la manche en cours. */
export function hostBeginRound(room: RoomState, now = Date.now()): RoomState {
  if (room.status !== 'playing') return room
  if (room.roundPhase !== 'waiting') return room
  room.roundPhase = 'answering'
  room.roundStartedAt = now
  return room
}

/** Vue client : masque les bonnes réponses tant que la manche n’est pas close */
export function publicRoomView(
  room: RoomState,
  opts?: { revealAnswers?: boolean },
): Omit<RoomState, 'questions'> & {
  questions: Array<{
    id: string
    question: string
    answers: [string, string, string, string]
    correctIndex?: 0 | 1 | 2 | 3
    explanation?: string
    sourceType?: string
    imageUrl?: string
  }>
  roundEndsAt: number
  answeredCount: number
  allAnswered: boolean
  storage: 'redis' | 'memory'
} {
  const revealAll = Boolean(opts?.revealAnswers) || room.status === 'finished'
  const revealingCurrent =
    room.status === 'playing' && room.roundPhase === 'reveal'
  const answeredCount = Object.keys(room.currentAnswers).length
  const allAnswered =
    room.players.length > 0 && answeredCount >= room.players.length

  const timerOff =
    room.timerEnabled === false ||
    room.roundPhase === 'reveal' ||
    room.roundPhase === 'waiting'
  const roundEndsAt = timerOff
    ? Number.MAX_SAFE_INTEGER
    : room.roundStartedAt + room.roundDurationMs

  return {
    ...room,
    quizMode: 'standard',
    questions: room.questions.map((q, i) => {
      const show =
        revealAll ||
        (room.status === 'playing' && i < room.questionIndex) ||
        (revealingCurrent && i === room.questionIndex)
      return {
        id: q.id,
        question: q.question,
        answers: q.answers,
        imageUrl: undefined,
        ...(show
          ? {
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              sourceType: q.sourceType,
            }
          : {}),
      }
    }),
    roundEndsAt,
    answeredCount,
    allAnswered,
    storage: redisConfigured() ? 'redis' : 'memory',
  }
}

/**
 * Si chrono écoulé ou tout le monde a répondu → score + phase reveal.
 * Ne s’applique qu’en phase answering (pas pendant waiting).
 */
export function maybeCloseRound(
  room: RoomState,
  now = Date.now(),
): { room: RoomState; changed: boolean } {
  if (room.status !== 'playing') return { room, changed: false }
  if (room.roundPhase !== 'answering') return { room, changed: false }
  if (room.questions.length === 0) return { room, changed: false }

  const q = room.questions[room.questionIndex]
  if (!q) {
    room.status = 'finished'
    return { room, changed: true }
  }

  const timerOn = room.timerEnabled !== false
  const timeUp =
    timerOn &&
    room.roundStartedAt > 0 &&
    now >= room.roundStartedAt + room.roundDurationMs
  const allAnswered =
    room.players.length > 0 &&
    room.players.every((p) => p.id in room.currentAnswers)

  if (!timeUp && !allAnswered) return { room, changed: false }

  for (const p of room.players) {
    const ans = room.currentAnswers[p.id]
    const correct = typeof ans === 'number' && ans === q.correctIndex
    if (correct) {
      p.score += 1
    }
  }

  room.roundPhase = 'reveal'
  return { room, changed: true }
}

/** Hôte : quitte le feedback et passe à la question suivante (ou fin). */
export function hostNextQuestion(room: RoomState, now = Date.now()): RoomState {
  if (room.status !== 'playing') return room
  if (room.roundPhase !== 'reveal') return room

  const next = room.questionIndex + 1
  if (next >= room.questions.length) {
    room.status = 'finished'
    room.questionIndex = next
    room.currentAnswers = {}
    room.roundPhase = 'answering'
    return room
  }

  room.questionIndex = next
  prepareRound(room, now)
  return room
}

/**
 * Ferme la manche si besoin, sans écraser un `next` concurrent.
 */
export async function syncRoomRound(code: string): Promise<RoomState | null> {
  const room = await getRoom(code)
  if (!room) return null

  const idx = room.questionIndex
  const phase = room.roundPhase
  const { room: closed, changed } = maybeCloseRound(room)

  if (!changed) return closed

  const latest = await getRoom(code)
  if (
    !latest ||
    latest.questionIndex !== idx ||
    latest.roundPhase !== phase ||
    latest.status !== 'playing'
  ) {
    return latest ?? closed
  }

  await saveRoom(closed)
  return closed
}

/** @deprecated */
export function maybeAdvanceRoom(room: RoomState, now = Date.now()): RoomState {
  return maybeCloseRound(room, now).room
}
