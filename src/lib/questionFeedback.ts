/** Feedback question → serveur (👍 / 👎 / vérif / à revoir / signalement) */

export type FeedbackKind = 'up' | 'down' | 'verify' | 'review' | 'report'
export type ReportTarget = 'question' | 'answer' | 'both'

export type FactVerdict = 'ok' | 'douteux' | 'faux' | 'inconnu'

export interface QuestionFeedbackPayload {
  kind: FeedbackKind
  questionId: string
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  explanation?: string
  sourceType?: string
  theme?: string
  difficulty?: string
  mode?: 'solo' | 'multi'
  playerCorrect?: boolean
  selectedIndex?: number
  reportTarget?: ReportTarget
  verdict?: FactVerdict
  answerVerdict?: FactVerdict
  sourceVerdict?: FactVerdict
  verifyProvider?: string
  verifyTitle?: string
  verifyNote?: string
  sourcesConfirmed?: number
  confirmingSources?: string
}

export function reportQuestionFeedback(payload: QuestionFeedbackPayload): void {
  const correctAnswer = payload.answers[payload.correctIndex] ?? ''
  try {
    void fetch('/api/question-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        correctAnswer,
        at: Date.now(),
      }),
      keepalive: true,
    }).catch(() => {
      /* ignore */
    })
  } catch {
    /* ignore */
  }
}

/** Vérif non plausible → log « à revoir » (admin). */
export function isVerifyImplausible(input: {
  verdict?: FactVerdict | null
  answerVerdict?: FactVerdict | null
  sourceVerdict?: FactVerdict | null
  sourcesConfirmed?: number | null
}): boolean {
  const a = input.answerVerdict ?? input.verdict ?? 'inconnu'
  const s = input.sourceVerdict
  const v = input.verdict ?? a
  const n = input.sourcesConfirmed ?? 0
  if (a === 'ok' && n < 2) return true
  if (a !== 'ok') return true
  if (v === 'faux' || v === 'douteux') return true
  if (s === 'faux' || s === 'douteux') return true
  return false
}
