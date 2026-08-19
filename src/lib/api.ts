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
  source: 'groq' | 'gemini' | 'mock' | 'bank' | 'deezer'
  message?: string
  /** Durée réelle serveur (ms) */
  generationMs?: number
  /** Prochaine ETA suggérée (s) */
  estimateSec?: number
}

const TIMEOUT_MSG =
  'Le serveur a mis trop de temps à répondre, réessaie dans quelques secondes'
const NOT_ENOUGH_VALID_MSG = 'Pas assez de questions valides'

function isRetryableStatus(status: number): boolean {
  // Ne pas relancer un 504 : le serveur a déjà brûlé ~60s, un 2e essai double l’échec.
  return status === 429
}

function isNotEnoughValidError(msg: string): boolean {
  return msg.toLowerCase().includes(NOT_ENOUGH_VALID_MSG.toLowerCase())
}

function newProgressId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/** Appelle la fonction serverless (clés API jamais côté client) */
export async function generateQuestions(
  body: GenerateRequest,
  signal?: AbortSignal,
  onProgress?: (
    done: number,
    total: number,
    engine?: string,
    stage?: string,
  ) => void,
): Promise<GenerateResponse> {
  const clientStarted = performance.now()
  let bestDone = 0
  let knownEngine: string | undefined
  let knownStage: string | undefined
  onProgress?.(bestDone, 10)

  function bump(done: number, total = 10, engine?: string, stage?: string) {
    if (!Number.isFinite(done)) return
    const clampedDone = Math.max(0, Math.round(done))
    bestDone = Math.max(bestDone, clampedDone)
    const displayDone = Math.max(bestDone, clampedDone)
    if (engine) knownEngine = engine
    if (stage) knownStage = stage
    onProgress?.(displayDone, total, knownEngine, knownStage)
  }

  function startPoll(progressId: string) {
    const poll = () => {
      void (async () => {
        if (signal?.aborted) return
        try {
          const pr = await fetch(
            `/api/gen-progress?id=${encodeURIComponent(progressId)}&t=${Date.now()}`,
            { cache: 'no-store' },
          )
          if (!pr.ok) return
          const data = (await pr.json()) as {
            done?: number
            total?: number
            engine?: string | null
            stage?: string | null
          }
          bump(
            Number(data.done),
            Number(data.total) || 10,
            data.engine ?? undefined,
            data.stage ?? undefined,
          )
        } catch {
          /* ignore poll errors */
        }
      })()
    }

    poll()
    const pollId = window.setInterval(poll, 500)
    return () => window.clearInterval(pollId)
  }

  async function once(progressId: string): Promise<Response> {
    return fetch('/api/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, progressId }),
      signal,
      cache: 'no-store',
    })
  }

  async function runAttempt(progressId: string): Promise<GenerateResponse> {
    let stopPoll = () => {}
    stopPoll = startPoll(progressId)
    try {
      let res: Response
      try {
        res = await once(progressId)
        if (isRetryableStatus(res.status)) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
          await new Promise((r) => setTimeout(r, 900))
          res = await once(progressId)
        }
      } catch (e) {
        if (
          signal?.aborted ||
          (e instanceof DOMException && e.name === 'AbortError') ||
          (e instanceof Error && e.name === 'AbortError')
        ) {
          throw new Error('Génération annulée')
        }
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
      return data
    } finally {
      stopPoll()
    }
  }

  try {
    const firstProgressId = newProgressId()
    let data: GenerateResponse
    try {
      data = await runAttempt(firstProgressId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!isNotEnoughValidError(msg)) throw e
      onProgress?.(bestDone, 10, knownEngine, 'Nouvelle tentative IA…')
      const secondProgressId = newProgressId()
      data = await runAttempt(secondProgressId)
    }

    bump(10, 10)

    const serverMs = Number(data.generationMs)
    if (Number.isFinite(serverMs) && serverMs > 0) {
      recordLocalGenMs(serverMs)
    } else {
      recordLocalGenMs(performance.now() - clientStarted)
    }

    return data
  } finally {
    // no global poll interval to clear (handled per attempt)
  }
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
