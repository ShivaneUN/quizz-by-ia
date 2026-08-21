/**
 * Client : banque curatée (liké + vérif OK).
 * Placement catalogue ou fichier custom — jamais de nouveau thème UI sans demande.
 * L’envoi serveur est no-op tant que l’ingest est désactivé.
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
  /** Id catalogue si connu (ex: musique) — ne pas inventer */
  themeId?: string
  /** Sous-thème catalogue exact si connu */
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

/** Prépare un envoi — no-op utile tant que l’API refuse (ingest off). */
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
