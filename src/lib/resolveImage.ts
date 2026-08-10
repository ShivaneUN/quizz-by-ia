/**
 * Résolution d’image côté client (Wikipedia FR/EN).
 * Complète les questions dont le serveur n’a pas encore trouvé d’URL.
 */

import type { Question } from '../types'

async function wikiThumb(
  lang: 'fr' | 'en',
  title: string,
): Promise<string | undefined> {
  try {
    const encoded = encodeURIComponent(title.trim().replace(/ /g, '_'))
    const res = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
    )
    if (!res.ok) return undefined
    const data = (await res.json()) as {
      type?: string
      thumbnail?: { source?: string }
      originalimage?: { source?: string }
    }
    if (data.type === 'disambiguation') return undefined
    return data.thumbnail?.source || data.originalimage?.source
  } catch {
    return undefined
  }
}

async function wikiSearchThumb(
  lang: 'fr' | 'en',
  query: string,
): Promise<string | undefined> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: '1',
      format: 'json',
      origin: '*',
    })
    const res = await fetch(
      `https://${lang}.wikipedia.org/w/api.php?${params}`,
    )
    if (!res.ok) return undefined
    const data = (await res.json()) as {
      query?: { search?: Array<{ title?: string }> }
    }
    const title = data.query?.search?.[0]?.title
    if (!title) return undefined
    return wikiThumb(lang, title)
  } catch {
    return undefined
  }
}

function candidates(sujet: string): string[] {
  const base = sujet.trim()
  if (!base) return []
  const noParen = base.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  return [...new Set([base, noParen].filter(Boolean))]
}

export async function resolveImageUrl(
  sujet: string,
): Promise<string | undefined> {
  for (const title of candidates(sujet)) {
    const [fr, en] = await Promise.all([
      wikiThumb('fr', title),
      wikiThumb('en', title),
    ])
    if (fr || en) return fr || en
    const [frS, enS] = await Promise.all([
      wikiSearchThumb('fr', title),
      wikiSearchThumb('en', title),
    ])
    if (frS || enS) return frS || enS
  }
  return undefined
}

/** Attache les images manquantes et retire imageSubject (anti-spoiler). */
export async function attachImagesToQuestions(
  questions: Question[],
): Promise<Question[]> {
  const resolved = await Promise.all(
    questions.map(async (q) => {
      let imageUrl = q.imageUrl
      if (!imageUrl) {
        const sujet = q.imageSubject || q.answers[q.correctIndex]
        if (sujet) imageUrl = await resolveImageUrl(sujet)
      }
      const { imageSubject: _drop, ...rest } = q
      return imageUrl ? { ...rest, imageUrl } : { ...rest }
    }),
  )
  return resolved.filter((q) => Boolean(q.imageUrl))
}
