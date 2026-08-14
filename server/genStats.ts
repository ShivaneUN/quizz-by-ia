/**
 * Stats de durée de génération (médiane glissante).
 * Redis en prod, mémoire en local — indépendant du cache questions.
 */

import { redisCommand, redisConfigured } from './rooms.js'

const REDIS_KEY = 'quizz:genstats:ms'
const MAX_SAMPLES = 30
const DEFAULT = { solo: 18, multi: 25 } as const

const memorySamples: number[] = []

function clampMs(ms: number): number | null {
  if (!Number.isFinite(ms)) return null
  const n = Math.round(ms)
  // Ignore outliers absurdes
  if (n < 800 || n > 90_000) return null
  return n
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!
}

async function readSamples(): Promise<number[]> {
  if (redisConfigured()) {
    try {
      const raw = await redisCommand<string[] | null>('LRANGE', REDIS_KEY, 0, MAX_SAMPLES - 1)
      if (!Array.isArray(raw)) return [...memorySamples]
      return raw
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n >= 800 && n <= 90_000)
    } catch {
      return [...memorySamples]
    }
  }
  return [...memorySamples]
}

/** Enregistre une durée réelle de génération réussie. */
export async function recordGenerationMs(ms: number): Promise<void> {
  const n = clampMs(ms)
  if (n == null) return

  memorySamples.unshift(n)
  if (memorySamples.length > MAX_SAMPLES) memorySamples.length = MAX_SAMPLES

  if (!redisConfigured()) return
  try {
    await redisCommand('LPUSH', REDIS_KEY, String(n))
    await redisCommand('LTRIM', REDIS_KEY, 0, MAX_SAMPLES - 1)
  } catch {
    /* mémoire locale suffit */
  }
}

/**
 * Estimation en secondes (médiane des dernières générations).
 * Multi : +3 s de marge (orch. salle / poll).
 */
export async function getGenerationEstimateSec(
  kind: 'solo' | 'multi' = 'solo',
): Promise<{ estimateSec: number; samples: number }> {
  const samples = await readSamples()
  const med = median(samples)
  const baseSec =
    med != null
      ? Math.max(5, Math.min(55, Math.ceil(med / 1000)))
      : DEFAULT[kind]
  const estimateSec =
    kind === 'multi' ? Math.min(55, baseSec + 3) : baseSec
  return { estimateSec, samples: samples.length }
}
