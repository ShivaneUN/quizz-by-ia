/** Feedback question → serveur (👍 / 👎 / à vérifier) */

export type FeedbackKind = 'up' | 'down' | 'verify'

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
