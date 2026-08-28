/** État local des actions feedback (👍/👎/vérif/signal) — partagé révélation ↔ audit */

export type ReportTarget = 'question' | 'answer' | 'both'

export type FeedbackSessionState = {
  vote: 'up' | 'down' | null
  verified: boolean
  report: ReportTarget | null
}

const EMPTY: FeedbackSessionState = {
  vote: null,
  verified: false,
  report: null,
}

const byQuestion = new Map<string, FeedbackSessionState>()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function getFeedbackSession(questionId: string): FeedbackSessionState {
  const id = String(questionId || '').trim()
  if (!id) return EMPTY
  return byQuestion.get(id) ?? EMPTY
}

export function patchFeedbackSession(
  questionId: string,
  partial: Partial<FeedbackSessionState>,
): FeedbackSessionState {
  const id = String(questionId || '').trim()
  if (!id) return EMPTY
  const next = { ...(byQuestion.get(id) ?? EMPTY), ...partial }
  byQuestion.set(id, next)
  emit()
  return next
}

export function subscribeFeedbackSession(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}
