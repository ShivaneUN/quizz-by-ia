import type { AiProvider, Difficulty, Question, QuizContentMode, QuizScope } from '../types'

export type { AiProvider }

export interface GenerateRequest {
  theme: string
  mode: 'initial' | 'complementary'
  difficulty?: Difficulty
  scope?: QuizScope
  provider?: AiProvider
  quizMode?: QuizContentMode
}

export interface GenerateResponse {
  theme: string
  themeSlug: string
  questions: Question[]
  source: 'groq' | 'gemini' | 'mock' | 'bank'
  message?: string
}

/** Appelle la fonction serverless (clés API jamais côté client) */
export async function generateQuestions(
  body: GenerateRequest,
): Promise<GenerateResponse> {
  let res: Response
  try {
    res = await fetch('/api/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(
      'Délai dépassé ou réseau coupé. Réessaie — le mode Images est plus long.',
    )
  }

  if (!res.ok) {
    if (res.status === 504 || res.status === 524 || res.status === 502) {
      throw new Error(
        'Génération trop longue (timeout serveur). Réessaie, ou utilise le mode Texte.',
      )
    }
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(
      typeof err.error === 'string'
        ? err.error
        : `Erreur API (${res.status})`,
    )
  }

  return res.json() as Promise<GenerateResponse>
}
