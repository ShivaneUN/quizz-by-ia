/**
 * Client : banque curatée.
 * Pour l’instant : enregistre seulement les thèmes / sous-thèmes custom (pas les questions).
 */

import type { Difficulty } from '../types'

export interface CuratedQuestionPayload {
  questionId: string
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  difficulty: Difficulty
  theme: string
  themeSlug?: string
  themeId?: string
  subTheme?: string
  scope?: 'fr' | 'international'
  explanation?: string
  sourceType?: string
  liked: boolean
  verifiedOk: boolean
  sourcesConfirmed?: number
  confirmingSources?: string
  verdict?: string
  answerVerdict?: string
  sourceVerdict?: string
  mode?: 'solo' | 'multi'
  playMode?: 'manual' | 'progression'
}

/** Enregistre un slot thème/sous-thème custom (fichier vide) — pas de questions. */
export function ensureCuratedThemeFromPlay(
  rawTheme: string,
  hints?: { themeId?: string; subTheme?: string },
): void {
  const raw = String(rawTheme ?? '').trim()
  if (!raw) return
  try {
    void fetch('/api/curated-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ensure-theme',
        rawTheme: raw,
        theme: raw,
        themeId: hints?.themeId,
        subTheme: hints?.subTheme ?? raw,
      }),
      keepalive: true,
    }).catch(() => {
      /* ignore */
    })
  } catch {
    /* ignore */
  }
}

/** Prépare un envoi question — no-op tant que l’ingest questions est off. */
export function reportCuratedCandidate(payload: CuratedQuestionPayload): void {
  try {
    void fetch('/api/curated-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        id: payload.questionId,
        correctAnswer: payload.answers[payload.correctIndex] ?? '',
        rawTheme: payload.theme,
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
