import type { AiProvider, Difficulty, Question, QuizContentMode, QuizScope } from '../types'
import { recordLocalGenMs } from './genEtaStorage'

export type { AiProvider }

export interface GenerateRequest {
  theme: string
  mode: 'initial' | 'complementary'
  difficulty?: Difficulty
  scope?: QuizScope
  provider?: AiProvider
  quizMode?: QuizContentMode
  /** Énoncés déjà posés — injectés dans le prompt anti-doublon */
  excludeQuestions?: string[]
}

export interface GenerateResponse {
  theme: string
  themeSlug: string
  questions: Question[]
  source: 'groq' | 'gemini' | 'mock' | 'bank'
  message?: string
  /** Durée réelle serveur (ms) */
  generationMs?: number
  /** Prochaine ETA suggérée (s) */
  estimateSec?: number
}

const TIMEOUT_MSG =
  'Le serveur a mis trop de temps à répondre, réessaie dans quelques secondes'

function isRetryableStatus(status: number): boolean {
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 524
  )
}

/** Appelle la fonction serverless (clés API jamais côté client) */
export async function generateQuestions(
  body: GenerateRequest,
): Promise<GenerateResponse> {
  const clientStarted = performance.now()

  async function once(): Promise<Response> {
    return fetch('/api/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  let res: Response
  try {
    res = await once()
    // 2 tentatives client, backoff 800ms → 1600ms
    for (let attempt = 0; attempt < 2 && isRetryableStatus(res.status); attempt++) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
      res = await once()
    }
  } catch {
    throw new Error(TIMEOUT_MSG)
  }

  if (!res.ok) {
    if (isRetryableStatus(res.status)) {
      throw new Error(TIMEOUT_MSG)
    }
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(
      typeof err.error === 'string'
        ? err.error
        : `Erreur API (${res.status})`,
    )
  }

  const data = (await res.json()) as GenerateResponse
  if (!Array.isArray(data.questions) || data.questions.length !== 10) {
    throw new Error(
      'JSON invalide : le lot ne contient pas exactement 10 questions. Réessaie.',
    )
  }

  const serverMs = Number(data.generationMs)
  if (Number.isFinite(serverMs) && serverMs > 0) {
    recordLocalGenMs(serverMs)
  } else {
    recordLocalGenMs(performance.now() - clientStarted)
  }

  return data
}

/** Vide l’historique multi serveur (tous thèmes). */
export async function clearMultiQuestionCache(): Promise<{
  multiHistoriesCleared: number
}> {
  const res = await fetch('/api/clear-cache', { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(
      typeof err.error === 'string'
        ? err.error
        : `Erreur API (${res.status})`,
    )
  }
  return res.json() as Promise<{ multiHistoriesCleared: number }>
}
