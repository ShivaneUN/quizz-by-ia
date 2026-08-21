/**
 * Journal d’erreurs serveur — visible dans l’admin.
 * Redis prod + mémoire local.
 */

import { redisCommand, redisConfigured } from './rooms.js'

const REDIS_KEY = 'quizz:error:log'
const MAX_ENTRIES = 2000

export type ErrorScope =
  | 'generate'
  | 'fact-check'
  | 'room'
  | 'api'
  | 'other'

export interface ErrorLogEvent {
  at: number
  scope: ErrorScope
  message: string
  status?: number
  theme?: string
  detail?: string
  path?: string
}

const memory: ErrorLogEvent[] = []

export async function clearErrorLog(): Promise<void> {
  memory.length = 0
  if (!redisConfigured()) return
  try {
    await redisCommand('DEL', REDIS_KEY)
  } catch {
    /* ignore */
  }
}

function asScope(raw: unknown): ErrorScope {
  const s = String(raw ?? '')
  if (
    s === 'generate' ||
    s === 'fact-check' ||
    s === 'room' ||
    s === 'api' ||
    s === 'other'
  ) {
    return s
  }
  return 'other'
}

function normalize(raw: Partial<ErrorLogEvent>): ErrorLogEvent | null {
  const message = String(raw.message ?? '')
    .trim()
    .slice(0, 500)
  if (message.length < 2) return null
  return {
    at: Number(raw.at) || Date.now(),
    scope: asScope(raw.scope),
    message,
    status:
      typeof raw.status === 'number' && Number.isFinite(raw.status)
        ? Math.floor(raw.status)
        : undefined,
    theme: raw.theme ? String(raw.theme).trim().slice(0, 80) : undefined,
    detail: raw.detail ? String(raw.detail).trim().slice(0, 400) : undefined,
    path: raw.path ? String(raw.path).trim().slice(0, 80) : undefined,
  }
}

/** Enregistre une erreur (fire-and-forget possible côté appelant). */
export async function recordError(
  input: Partial<ErrorLogEvent> & { message: string },
): Promise<boolean> {
  const event = normalize(input)
  if (!event) return false

  memory.unshift(event)
  if (memory.length > MAX_ENTRIES) memory.length = MAX_ENTRIES

  if (!redisConfigured()) return true
  try {
    await redisCommand('LPUSH', REDIS_KEY, JSON.stringify(event))
    await redisCommand('LTRIM', REDIS_KEY, 0, MAX_ENTRIES - 1)
  } catch {
    /* mémoire OK */
  }
  return true
}

/** Ne bloque jamais l’API appelante. */
export function logError(
  input: Partial<ErrorLogEvent> & { message: string },
): void {
  void recordError(input).catch(() => {
    /* ignore */
  })
}

export async function listErrorLog(limit = 500): Promise<ErrorLogEvent[]> {
  const cap = Math.max(1, Math.min(MAX_ENTRIES, Math.floor(limit)))
  if (redisConfigured()) {
    try {
      const raw = await redisCommand<string[] | null>(
        'LRANGE',
        REDIS_KEY,
        0,
        cap - 1,
      )
      if (Array.isArray(raw)) {
        const out: ErrorLogEvent[] = []
        for (const row of raw) {
          try {
            const parsed = normalize(
              JSON.parse(row) as Partial<ErrorLogEvent>,
            )
            if (parsed) out.push(parsed)
          } catch {
            /* skip */
          }
        }
        return out
      }
    } catch {
      /* fallback */
    }
  }
  return memory.slice(0, cap)
}

export function summarizeErrorLog(events: ErrorLogEvent[]) {
  const byScope: Record<string, number> = {}
  for (const e of events) {
    byScope[e.scope] = (byScope[e.scope] ?? 0) + 1
  }
  return { total: events.length, byScope }
}
