/**
 * Historique multi des énoncés déjà servis, indexé par themeSlug (Redis ou mémoire).
 * Évite de rejouer les mêmes questions trop souvent entre parties.
 */

import { redisCommand, redisConfigured } from './rooms.js'

const memory = new Map<string, string[]>()

/** Cap par thème — les plus anciennes tombent si on dépasse */
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

function normalizeStoredList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim())
      continue
    }
    // Compat anciens fingerprints seuls : on les ignore pour le prompt
  }
  return out
}

/** Textes bruts déjà servis (pour injection prompt). */
export async function getSeenQuestionTexts(
  themeSlug: string,
): Promise<string[]> {
  const slug = themeSlug.trim()
  if (!slug) return []

  if (redisConfigured()) {
    try {
      const raw = await redisCommand<string | null>('GET', histKey(slug))
      if (!raw) return []
      return normalizeStoredList(JSON.parse(raw) as unknown)
    } catch {
      return []
    }
  }

  return [...(memory.get(slug) ?? [])]
}

export async function getSeenQuestionKeys(
  themeSlug: string,
): Promise<Set<string>> {
  const texts = await getSeenQuestionTexts(themeSlug)
  return new Set(texts.map(questionFingerprint))
}

export async function rememberQuestionKeys(
  themeSlug: string,
  keysOrTexts: string[],
): Promise<void> {
  const slug = themeSlug.trim()
  if (!slug || keysOrTexts.length === 0) return

  const next = await getSeenQuestionTexts(slug)
  const seenFp = new Set(next.map(questionFingerprint))
  for (const item of keysOrTexts) {
    const t = item.trim()
    if (!t) continue
    const fp = questionFingerprint(t)
    if (seenFp.has(fp)) continue
    // N’enregistre que de vrais énoncés (pas d’anciens fingerprints seuls)
    if (t.length < 12 && !/[?]/.test(t) && !/\s/.test(t)) continue
    next.push(t)
    seenFp.add(fp)
  }
  let list = next
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

  memory.set(slug, list)
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

/** Vide tout l’historique multi (tous les thèmes). */
export async function clearAllQuestionHistory(): Promise<number> {
  const memCount = memory.size
  memory.clear()

  if (!redisConfigured()) return memCount

  try {
    const keys = await redisCommand<string[]>('KEYS', 'quizz:qhist:*')
    if (!keys || keys.length === 0) return memCount
    await redisCommand('DEL', ...keys)
    return keys.length
  } catch {
    return memCount
  }
}
