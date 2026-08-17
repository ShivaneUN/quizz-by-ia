/**
 * Feedback joueur sur les questions (👍 / 👎 / à vérifier).
 * Redis prod + mémoire local — indépendant du cache questions.
 */

import { redisCommand, redisConfigured } from './rooms.js'

const REDIS_KEY = 'quizz:calib:feedback'
const MAX_ENTRIES = 3000

export type FeedbackKind = 'up' | 'down' | 'verify'

export interface QuestionFeedbackEvent {
  at: number
  kind: FeedbackKind
  questionId: string
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  /** Bonne réponse en clair (pour lecture CSV) */
  correctAnswer: string
  explanation?: string
  sourceType?: string
  theme?: string
  difficulty?: string
  mode?: 'solo' | 'multi'
  playerCorrect?: boolean
  selectedIndex?: number
}

const memory: QuestionFeedbackEvent[] = []

export async function clearQuestionFeedback(): Promise<void> {
  memory.length = 0
  if (!redisConfigured()) return
  try {
    await redisCommand('DEL', REDIS_KEY)
  } catch {
    /* ignore */
  }
}

function asAnswers(raw: unknown): [string, string, string, string] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  return raw.map((x) => String(x).slice(0, 200)) as [
    string,
    string,
    string,
    string,
  ]
}

function normalize(
  raw: Partial<QuestionFeedbackEvent>,
): QuestionFeedbackEvent | null {
  const kind = raw.kind
  if (kind !== 'up' && kind !== 'down' && kind !== 'verify') return null
  const question = String(raw.question ?? '').trim().slice(0, 400)
  if (question.length < 3) return null
  const answers = asAnswers(raw.answers)
  if (!answers) return null
  const correctIndex = Number(raw.correctIndex)
  if (![0, 1, 2, 3].includes(correctIndex)) return null
  const idx = correctIndex as 0 | 1 | 2 | 3
  const correctAnswer =
    String(raw.correctAnswer ?? answers[idx] ?? '').trim().slice(0, 200) ||
    answers[idx]
  return {
    at: Number(raw.at) || Date.now(),
    kind,
    questionId: String(raw.questionId ?? '').slice(0, 80) || 'unknown',
    question,
    answers,
    correctIndex: idx,
    correctAnswer,
    explanation: raw.explanation
      ? String(raw.explanation).trim().slice(0, 600)
      : undefined,
    sourceType: raw.sourceType
      ? String(raw.sourceType).trim().slice(0, 120)
      : undefined,
    theme: raw.theme ? String(raw.theme).trim().slice(0, 80) : undefined,
    difficulty: raw.difficulty
      ? String(raw.difficulty).trim().slice(0, 16)
      : undefined,
    mode: raw.mode === 'multi' ? 'multi' : raw.mode === 'solo' ? 'solo' : undefined,
    playerCorrect:
      typeof raw.playerCorrect === 'boolean' ? raw.playerCorrect : undefined,
    selectedIndex:
      typeof raw.selectedIndex === 'number'
        ? Math.floor(raw.selectedIndex)
        : undefined,
  }
}

export async function recordQuestionFeedback(
  input: Partial<QuestionFeedbackEvent>,
): Promise<boolean> {
  const event = normalize(input)
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

export async function listQuestionFeedback(
  limit = 2000,
): Promise<QuestionFeedbackEvent[]> {
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
        const out: QuestionFeedbackEvent[] = []
        for (const row of raw) {
          try {
            const parsed = normalize(
              JSON.parse(row) as Partial<QuestionFeedbackEvent>,
            )
            if (parsed) out.push(parsed)
          } catch {
            /* skip */
          }
        }
        return out
      }
    } catch {
      /* fallback */
    }
  }
  return memory.slice(0, cap)
}

export function summarizeFeedback(events: QuestionFeedbackEvent[]) {
  let up = 0
  let down = 0
  let verify = 0
  for (const e of events) {
    if (e.kind === 'up') up += 1
    else if (e.kind === 'down') down += 1
    else verify += 1
  }
  return { up, down, verify, total: events.length }
}
