/**
 * Feedback joueur sur les questions (👍 / 👎 / vérif / à revoir / signalement).
 * Redis prod + mémoire local — indépendant du cache questions.
 */

import { redisCommand, redisConfigured } from './rooms.js'

const REDIS_KEY = 'quizz:calib:feedback'
const MAX_ENTRIES = 3000
/** Évite de logger 10× la même question douteuse. */
const REVIEW_DEDUP_MS = 7 * 24 * 60 * 60 * 1000

export type FeedbackKind = 'up' | 'down' | 'verify' | 'review' | 'report'
export type ReportTarget = 'question' | 'answer' | 'both'

export type FactVerdict = 'ok' | 'douteux' | 'faux' | 'inconnu'

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
  /** Cible du signalement (kind=report) */
  reportTarget?: ReportTarget
  /** Résultat de la vérif (surtout kind=review) */
  verdict?: FactVerdict
  answerVerdict?: FactVerdict
  sourceVerdict?: FactVerdict
  verifyProvider?: string
  verifyTitle?: string
  verifyNote?: string
  /** Nb de sources confirmantes (vérif OpenRouter ≥ 2) */
  sourcesConfirmed?: number
  confirmingSources?: string
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

function asVerdict(raw: unknown): FactVerdict | undefined {
  const v = String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (v === 'ok' || v === 'vrai' || v === 'correct') return 'ok'
  if (v === 'faux' || v === 'incorrect') return 'faux'
  if (v === 'douteux' || v === 'incertain') return 'douteux'
  if (v === 'inconnu' || v === 'empty' || v === 'error') return 'inconnu'
  return undefined
}

function asReportTarget(raw: unknown): ReportTarget | undefined {
  const v = String(raw ?? '')
    .toLowerCase()
    .trim()
  if (v === 'question' || v === 'answer' || v === 'both') return v
  return undefined
}

function normalize(
  raw: Partial<QuestionFeedbackEvent>,
): QuestionFeedbackEvent | null {
  const kind = raw.kind
  if (
    kind !== 'up' &&
    kind !== 'down' &&
    kind !== 'verify' &&
    kind !== 'review' &&
    kind !== 'report'
  ) {
    return null
  }
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
  const reportTarget =
    kind === 'report'
      ? asReportTarget(raw.reportTarget) ?? 'both'
      : undefined
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
    reportTarget,
    verdict: asVerdict(raw.verdict),
    answerVerdict: asVerdict(raw.answerVerdict),
    sourceVerdict: asVerdict(raw.sourceVerdict),
    verifyProvider: raw.verifyProvider
      ? String(raw.verifyProvider).trim().slice(0, 40)
      : undefined,
    verifyTitle: raw.verifyTitle
      ? String(raw.verifyTitle).trim().slice(0, 200)
      : undefined,
    verifyNote: raw.verifyNote
      ? String(raw.verifyNote).trim().slice(0, 400)
      : undefined,
    sourcesConfirmed:
      typeof raw.sourcesConfirmed === 'number'
        ? Math.max(0, Math.floor(raw.sourcesConfirmed))
        : undefined,
    confirmingSources: raw.confirmingSources
      ? String(raw.confirmingSources).trim().slice(0, 500)
      : undefined,
  }
}

function sameQuestion(a: QuestionFeedbackEvent, b: QuestionFeedbackEvent): boolean {
  if (a.questionId && a.questionId !== 'unknown' && a.questionId === b.questionId) {
    return true
  }
  return (
    a.question === b.question &&
    a.correctAnswer === b.correctAnswer &&
    (a.theme ?? '') === (b.theme ?? '')
  )
}

async function hasRecentReview(event: QuestionFeedbackEvent): Promise<boolean> {
  const recent = await listQuestionFeedback(400)
  const cutoff = Date.now() - REVIEW_DEDUP_MS
  return recent.some(
    (e) =>
      e.kind === 'review' &&
      e.at >= cutoff &&
      sameQuestion(e, event),
  )
}

export async function recordQuestionFeedback(
  input: Partial<QuestionFeedbackEvent>,
): Promise<boolean> {
  const event = normalize(input)
  if (!event) return false

  if (event.kind === 'review') {
    if (await hasRecentReview(event)) return true
  }

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
  let review = 0
  let report = 0
  for (const e of events) {
    if (e.kind === 'up') up += 1
    else if (e.kind === 'down') down += 1
    else if (e.kind === 'review') review += 1
    else if (e.kind === 'report') report += 1
    else verify += 1
  }
  return { up, down, verify, review, report, total: events.length }
}
