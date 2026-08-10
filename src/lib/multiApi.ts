import type { Difficulty, QuizScope, AiProvider, QuizContentMode } from '../types'

export interface MultiPlayer {
  id: string
  name: string
  score: number
  joinedAt: number
}

export interface MultiQuestion {
  id: string
  question: string
  answers: [string, string, string, string]
  correctIndex?: 0 | 1 | 2 | 3
  explanation?: string
  sourceType?: string
  imageUrl?: string
}

export interface MultiRoom {
  code: string
  hostId: string
  status: 'lobby' | 'generating' | 'playing' | 'finished' | 'error'
  theme: string
  scope: QuizScope
  timerEnabled?: boolean
  playMode?: 'progression' | 'free'
  difficulty?: Difficulty
  aiProvider?: AiProvider
  quizMode?: QuizContentMode
  /** Présent si status === 'error' */
  errorMessage?: string
  players: MultiPlayer[]
  questions: MultiQuestion[]
  questionIndex: number
  roundPhase?: 'waiting' | 'answering' | 'reveal'
  roundStartedAt: number
  roundDurationMs: number
  currentAnswers: Record<string, number>
  roundEndsAt: number
  answeredCount: number
  allAnswered: boolean
  updatedAt?: number
  storage?: 'redis' | 'memory'
}

/** Garde l’état le plus récent (évite qu’un poll stale annule un « question suivante ») */
export function preferNewerRoom(
  prev: MultiRoom | null,
  next: MultiRoom,
): MultiRoom {
  if (!prev) return next
  if (prev.code !== next.code) return next

  const prevT = prev.updatedAt ?? 0
  const nextT = next.updatedAt ?? 0
  if (nextT > 0 && prevT > 0 && nextT < prevT) return prev

  if (next.questionIndex < prev.questionIndex) return prev

  // Même question : ne pas revenir en reveal si on est déjà repassé en answering
  // (cas rare sans updatedAt fiable)
  if (
    next.questionIndex === prev.questionIndex &&
    prev.roundPhase === 'answering' &&
    next.roundPhase === 'reveal' &&
    prevT >= nextT
  ) {
    return prev
  }

  return next
}

async function postRoom(body: Record<string, unknown>) {
  const res = await fetch('/api/room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(
      typeof data.error === 'string' ? data.error : `Erreur (${res.status})`,
    ) as Error & { room?: MultiRoom }
    if (data.room) err.room = data.room as MultiRoom
    throw err
  }
  return data as {
    room?: MultiRoom
    playerId?: string
    message?: string
    closed?: boolean
  }
}

export async function createRoom(input: {
  playerName: string
  theme: string
  scope: QuizScope
  timerEnabled?: boolean
  difficulty?: Difficulty
  playMode?: 'progression' | 'free'
  aiProvider?: AiProvider
  quizMode?: QuizContentMode
}) {
  const data = await postRoom({ action: 'create', ...input })
  return { room: data.room!, playerId: data.playerId, message: data.message }
}

export async function joinRoom(input: { code: string; playerName: string }) {
  const data = await postRoom({ action: 'join', ...input })
  return { room: data.room!, playerId: data.playerId, message: data.message }
}

export async function startRoom(input: { code: string; playerId: string }) {
  const data = await postRoom({ action: 'start', ...input })
  return { room: data.room!, playerId: data.playerId, message: data.message }
}

export async function beginRoomRound(input: {
  code: string
  playerId: string
}) {
  const data = await postRoom({ action: 'begin', ...input })
  return { room: data.room! }
}

export async function nextRoomQuestion(input: {
  code: string
  playerId: string
}) {
  const data = await postRoom({ action: 'next', ...input })
  return { room: data.room! }
}

export async function setRoomTheme(input: {
  code: string
  playerId: string
  theme: string
  scope: QuizScope
  aiProvider?: AiProvider
  quizMode?: QuizContentMode
}) {
  const data = await postRoom({ action: 'setTheme', ...input })
  return { room: data.room! }
}

export async function setRoomTimer(input: {
  code: string
  playerId: string
  timerEnabled: boolean
}) {
  const data = await postRoom({ action: 'setTimer', ...input })
  return { room: data.room! }
}

export async function setRoomDifficulty(input: {
  code: string
  playerId: string
  difficulty: Difficulty
}) {
  const data = await postRoom({ action: 'setDifficulty', ...input })
  return { room: data.room! }
}

export async function setRoomPlayMode(input: {
  code: string
  playerId: string
  playMode: 'progression' | 'free'
}) {
  const data = await postRoom({ action: 'setPlayMode', ...input })
  return { room: data.room! }
}

export async function closeRoom(input: { code: string; playerId: string }) {
  return postRoom({ action: 'close', ...input })
}

export async function leaveRoom(input: { code: string; playerId: string }) {
  return postRoom({ action: 'leave', ...input })
}

export async function kickRoomPlayer(input: {
  code: string
  playerId: string
  targetPlayerId: string
}) {
  const data = await postRoom({ action: 'kick', ...input })
  return { room: data.room! }
}

export async function answerRoom(input: {
  code: string
  playerId: string
  answerIndex: number
}) {
  const data = await postRoom({ action: 'answer', ...input })
  return { room: data.room!, playerId: data.playerId, message: data.message }
}

export async function pollRoom(code: string) {
  const data = await postRoom({ action: 'state', code })
  return { room: data.room! }
}
