/**
 * Télémétrie calibrage difficulté — tous les joueurs.
 * Stockage Redis (prod) / mémoire (dev). Indépendant du cache questions.
 */

import { redisCommand, redisConfigured } from './rooms.js'

const REDIS_KEY = 'quizz:calib:hands'
const MAX_ENTRIES = 5000

export type CalibDifficulty = 'easy' | 'medium' | 'hard'

export interface CalibHandEvent {
  at: number
  mode: 'solo' | 'multi'
  theme: string
  scope: 'fr' | 'international'
  difficulty: CalibDifficulty
  correct: number
  answered: number
  playMode?: 'progression' | 'free' | 'manual'
  /** Multi uniquement */
  roomCode?: string
}

const memory: CalibHandEvent[] = []

export async function clearCalibHands(): Promise<void> {
  memory.length = 0
  if (!redisConfigured()) return
  try {
    await redisCommand('DEL', REDIS_KEY)
  } catch {
    /* ignore */
  }
}

function normalizeEvent(raw: Partial<CalibHandEvent>): CalibHandEvent | null {
  const difficulty = raw.difficulty
  if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') {
    return null
  }
  const answered = Math.max(0, Math.min(50, Math.floor(Number(raw.answered) || 0)))
  const correct = Math.max(0, Math.min(answered, Math.floor(Number(raw.correct) || 0)))
  if (answered < 1) return null
  const theme = String(raw.theme ?? '').trim().slice(0, 80)
  if (theme.length < 1) return null
  const scope = raw.scope === 'international' ? 'international' : 'fr'
  const mode = raw.mode === 'multi' ? 'multi' : 'solo'
  return {
    at: Number(raw.at) || Date.now(),
    mode,
    theme,
    scope,
    difficulty,
    correct,
    answered,
    playMode:
      raw.playMode === 'progression' ||
      raw.playMode === 'free' ||
      raw.playMode === 'manual'
        ? raw.playMode
        : undefined,
    roomCode: raw.roomCode
      ? String(raw.roomCode).trim().toUpperCase().slice(0, 8)
      : undefined,
  }
}

export async function recordCalibHand(
  input: Partial<CalibHandEvent>,
): Promise<boolean> {
  const event = normalizeEvent(input)
  if (!event) return false

  memory.unshift(event)
  if (memory.length > MAX_ENTRIES) memory.length = MAX_ENTRIES

  if (!redisConfigured()) return true
  try {
    await redisCommand('LPUSH', REDIS_KEY, JSON.stringify(event))
    await redisCommand('LTRIM', REDIS_KEY, 0, MAX_ENTRIES - 1)
  } catch {
    /* mémoire OK */
  }
  return true
}

export async function recordCalibHands(
  inputs: Partial<CalibHandEvent>[],
): Promise<number> {
  let n = 0
  for (const input of inputs) {
    if (await recordCalibHand(input)) n += 1
  }
  return n
}

export async function listCalibHands(limit = 2000): Promise<CalibHandEvent[]> {
  const cap = Math.max(1, Math.min(MAX_ENTRIES, Math.floor(limit)))
  if (redisConfigured()) {
    try {
      const raw = await redisCommand<string[] | null>(
        'LRANGE',
        REDIS_KEY,
        0,
        cap - 1,
      )
      if (Array.isArray(raw)) {
        const out: CalibHandEvent[] = []
        for (const row of raw) {
          try {
            const parsed = normalizeEvent(JSON.parse(row) as Partial<CalibHandEvent>)
            if (parsed) out.push(parsed)
          } catch {
            /* skip */
          }
        }
        return out
      }
    } catch {
      /* fallback mémoire */
    }
  }
  return memory.slice(0, cap)
}

export function summarizeCalibHands(events: CalibHandEvent[]) {
  const byDiff: Record<
    CalibDifficulty,
    { hands: number; correct: number; answered: number }
  > = {
    easy: { hands: 0, correct: 0, answered: 0 },
    medium: { hands: 0, correct: 0, answered: 0 },
    hard: { hands: 0, correct: 0, answered: 0 },
  }
  for (const e of events) {
    const b = byDiff[e.difficulty]
    b.hands += 1
    b.correct += e.correct
    b.answered += e.answered
  }
  return (['easy', 'medium', 'hard'] as CalibDifficulty[]).map((d) => {
    const b = byDiff[d]
    const rate =
      b.answered > 0 ? Math.round((1000 * b.correct) / b.answered) / 10 : null
    return {
      difficulty: d,
      hands: b.hands,
      correct: b.correct,
      answered: b.answered,
      successRatePct: rate,
    }
  })
}

/** Appelé quand une salle multi passe en finished (fire-and-forget). */
export function recordCalibHandsFromRoom(room: {
  code: string
  theme: string
  scope: 'fr' | 'international'
  difficulty: string
  playMode?: string
  questions: unknown[]
  players: Array<{ score: number; bonusApplique?: number }>
}): void {
  const difficulty: CalibDifficulty =
    room.difficulty === 'medium' || room.difficulty === 'hard'
      ? room.difficulty
      : 'easy'
  const answered = Math.max(1, room.questions.length || 10)
  const playMode =
    room.playMode === 'progression' || room.playMode === 'free'
      ? room.playMode
      : undefined
  void recordCalibHands(
    room.players.map((p) => ({
      mode: 'multi' as const,
      theme: room.theme,
      scope: room.scope,
      difficulty,
      correct: Math.max(0, (p.score ?? 0) - (p.bonusApplique ?? 0)),
      answered,
      playMode,
      roomCode: room.code,
    })),
  )
}
