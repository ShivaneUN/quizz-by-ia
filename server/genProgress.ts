/**
 * Progression génération solo (X/10) — Redis (prod) ou mémoire (Vite).
 */

import { redisCommand, redisConfigured } from './rooms.js'

const TTL_SEC = 90
const memory = new Map<
  string,
  { done: number; total: number; engine?: string; stage?: string; at: number }
>()

export function isValidProgressId(raw: unknown): raw is string {
  return (
    typeof raw === 'string' &&
    /^[a-zA-Z0-9_-]{8,64}$/.test(raw.trim())
  )
}

function key(id: string): string {
  return `quizz:genprog:${id}`
}

function parseProgress(
  raw: unknown,
): { done: number; total: number; engine?: string; stage?: string } | null {
  if (raw == null) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as {
      done?: unknown
      total?: unknown
      engine?: unknown
      stage?: unknown
    }
    const done = Number(o.done)
    const total = Number(o.total)
    if (Number.isFinite(done) && Number.isFinite(total)) {
      return {
        done,
        total,
        engine: typeof o.engine === 'string' ? o.engine : undefined,
        stage: typeof o.stage === 'string' ? o.stage : undefined,
      }
    }
    return null
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { done: raw, total: 10 }
  }
  if (typeof raw !== 'string' || !raw) return null
  // Ancien format "3/10" — pas d'engine
  const slash = raw.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (slash) {
    return { done: Number(slash[1]), total: Number(slash[2]) }
  }
  try {
    return parseProgress(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export async function setGenProgress(
  id: string,
  done: number,
  total = 10,
  engine?: string,
  stage?: string,
): Promise<void> {
  const d = Math.max(0, Math.min(total, Math.round(done)))
  const t = Math.max(1, Math.round(total))
  const prev = memory.get(id)
  // Conserver l'engine déjà connu si le nouvel appel ne le fournit pas
  const resolvedEngine = engine ?? prev?.engine
  memory.set(id, {
    done: d,
    total: t,
    engine: resolvedEngine,
    stage: stage ?? prev?.stage,
    at: Date.now(),
  })

  if (!redisConfigured()) return
  try {
    const payload = JSON.stringify({
      done: d,
      total: t,
      engine: resolvedEngine ?? null,
      stage: stage ?? prev?.stage ?? null,
    })
    await redisCommand('SET', key(id), payload)
    await redisCommand('EXPIRE', key(id), TTL_SEC)
  } catch {
    /* mémoire locale suffit en dev */
  }
}

export async function getGenProgress(
  id: string,
): Promise<{ done: number; total: number; engine?: string; stage?: string } | null> {
  if (redisConfigured()) {
    try {
      const raw = await redisCommand<unknown>('GET', key(id))
      const parsed = parseProgress(raw)
      if (parsed) return parsed
    } catch {
      /* fallback mémoire */
    }
  }

  const local = memory.get(id)
  if (!local) return null
  if (Date.now() - local.at > TTL_SEC * 1000) {
    memory.delete(id)
    return null
  }
  return {
    done: local.done,
    total: local.total,
    engine: local.engine,
    stage: local.stage,
  }
}

export async function clearGenProgress(id: string): Promise<void> {
  memory.delete(id)
  if (!redisConfigured()) return
  try {
    await redisCommand('DEL', key(id))
  } catch {
    /* ignore */
  }
}
