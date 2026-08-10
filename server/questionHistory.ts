/**
 * Historique multi des énoncés déjà servis, indexé par themeSlug (Redis ou mémoire).
 * Évite de rejouer les mêmes questions trop souvent entre parties.
 */

import { redisCommand, redisConfigured } from './rooms.js'

const memory = new Map<string, Set<string>>()

/** Cap par thème — les plus anciennes tombent si on dépasse (liste Redis) */
const MAX_KEYS = 200
/** TTL Redis ~ 30 jours (rafraîchi à chaque écriture) */
const TTL_SEC = 60 * 60 * 24 * 30

function histKey(themeSlug: string): string {
  return `quizz:qhist:${themeSlug}`
}

/** Empreinte stable d’un énoncé (indépendante de l’id généré) */
export function questionFingerprint(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function getSeenQuestionKeys(
  themeSlug: string,
): Promise<Set<string>> {
  const slug = themeSlug.trim()
  if (!slug) return new Set()

  if (redisConfigured()) {
    try {
      const raw = await redisCommand<string | null>('GET', histKey(slug))
      if (!raw) return new Set()
      const arr = JSON.parse(raw) as unknown
      if (!Array.isArray(arr)) return new Set()
      return new Set(arr.filter((x): x is string => typeof x === 'string'))
    } catch {
      return new Set()
    }
  }

  return new Set(memory.get(slug) ?? [])
}

export async function rememberQuestionKeys(
  themeSlug: string,
  keys: string[],
): Promise<void> {
  const slug = themeSlug.trim()
  if (!slug || keys.length === 0) return

  const next = await getSeenQuestionKeys(slug)
  for (const k of keys) {
    if (k) next.add(k)
  }
  let list = [...next]
  if (list.length > MAX_KEYS) {
    list = list.slice(list.length - MAX_KEYS)
  }

  if (redisConfigured()) {
    await redisCommand(
      'SET',
      histKey(slug),
      JSON.stringify(list),
      'EX',
      TTL_SEC,
    )
    return
  }

  memory.set(slug, new Set(list))
}

/**
 * Préfère les questions jamais vues ; complète avec des déjà vues si besoin.
 */
export function pickUnseenPreferring<T extends { question: string }>(
  questions: T[],
  seen: Set<string>,
  limit: number,
): T[] {
  const unseen: T[] = []
  const known: T[] = []
  for (const q of questions) {
    const fp = questionFingerprint(q.question)
    if (seen.has(fp)) known.push(q)
    else unseen.push(q)
  }
  const picked = [...unseen, ...known].slice(0, limit)
  return picked
}
