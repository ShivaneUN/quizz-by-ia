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
  /** Ce que le système a fait à la place (fallback / bascule / message user) */
  instead?: string
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

/** Déduit une action de secours si le champ instead est absent (anciens logs). */
export function inferErrorInstead(message: string, status?: number): string {
  const m = message.toLowerCase()
  if (status === 504 || /délai dépassé|timeout|trop de temps/i.test(m)) {
    return 'Demande au joueur de réessayer (timeout serveur)'
  }
  if (/\b429\b|saturé|rate limit|quota/i.test(m)) {
    return 'Bascule vers une autre IA / un autre modèle (si disponible)'
  }
  if (/json invalide|aucune question valide|pas assez de questions/i.test(m)) {
    return 'Essai modèle suivant ou rattrapage partiel ; sinon erreur affichée'
  }
  if (/404|no longer available|does not exist/i.test(m)) {
    return 'Modèle ignoré → suivant dans la pile'
  }
  if (/mock/i.test(m)) {
    return 'Questions mock (aucune clé / échec total)'
  }
  if (/lot partiel|complément|top-?up|needsTopUp/i.test(m)) {
    return 'Lot partiel conservé + rattrapage automatique'
  }
  if (/clé invalide|non autorisée|api key/i.test(m)) {
    return 'Clé abandonnée → autre slot / autre provider'
  }
  if (/deezer/i.test(m)) {
    return 'Quiz musical en échec — message d’erreur au joueur'
  }
  return 'Erreur renvoyée au joueur (pas de secours enregistré)'
}

function normalize(raw: Partial<ErrorLogEvent>): ErrorLogEvent | null {
  const message = String(raw.message ?? '')
    .trim()
    .slice(0, 500)
  if (message.length < 2) return null
  const status =
    typeof raw.status === 'number' && Number.isFinite(raw.status)
      ? Math.floor(raw.status)
      : undefined
  const insteadRaw = raw.instead ? String(raw.instead).trim().slice(0, 240) : ''
  return {
    at: Number(raw.at) || Date.now(),
    scope: asScope(raw.scope),
    message,
    instead: insteadRaw || inferErrorInstead(message, status),
    status,
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
