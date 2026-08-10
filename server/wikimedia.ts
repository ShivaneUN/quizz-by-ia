/**
 * Résolution d’image pour le mode quiz illustré.
 * Priorité : Wikipedia FR/EN (miniatures) — bien plus fiable que Commons seul.
 */

export type ImageKind = 'logo' | 'sujet_entier' | 'detail_zoome'

const FETCH_MS = 2_500
const UA = 'QuizzApp/1.0 (educational quiz; contact local)'

function cleanSujet(raw: string): string {
  return raw
    .trim()
    .replace(/^["'«]+|["'»]+$/g, '')
    .replace(/\s+/g, ' ')
}

function titleCandidates(sujet: string, kind: ImageKind): string[] {
  const base = cleanSujet(sujet)
  if (!base) return []
  const out: string[] = [base]
  const withoutParen = base.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  if (withoutParen && withoutParen !== base) out.push(withoutParen)
  if (kind === 'logo') {
    out.push(`${withoutParen || base} (entreprise)`)
  }
  return [...new Set(out)].slice(0, 3)
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS)
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

type WikiSummary = {
  type?: string
  thumbnail?: { source?: string }
  originalimage?: { source?: string }
}

async function wikiSummaryThumb(
  lang: 'fr' | 'en',
  title: string,
): Promise<string | undefined> {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'))
  const data = await fetchJson<WikiSummary>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
  )
  if (!data || data.type === 'disambiguation') return undefined
  return data.thumbnail?.source || data.originalimage?.source || undefined
}

async function wikiSearchThenThumb(
  lang: 'fr' | 'en',
  query: string,
): Promise<string | undefined> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: '1',
    format: 'json',
    origin: '*',
  })
  const data = await fetchJson<{
    query?: { search?: Array<{ title?: string }> }
  }>(`https://${lang}.wikipedia.org/w/api.php?${params}`)
  const title = data?.query?.search?.[0]?.title
  if (!title) return undefined
  return wikiSummaryThumb(lang, title)
}

async function resolveOneTitle(title: string): Promise<string | undefined> {
  const [fr, en] = await Promise.all([
    wikiSummaryThumb('fr', title),
    wikiSummaryThumb('en', title),
  ])
  if (fr || en) return fr || en

  const [frSearch, enSearch] = await Promise.all([
    wikiSearchThenThumb('fr', title),
    wikiSearchThenThumb('en', title),
  ])
  return frSearch || enSearch
}

/** Résout une URL d’image (Wikipedia prioritaire). */
export async function fetchCommonsImageUrl(
  sujetImage: string,
  typeImage: ImageKind = 'sujet_entier',
  fallbackSujet?: string,
): Promise<string | undefined> {
  const tried = new Set<string>()
  const subjects = [
    ...titleCandidates(sujetImage, typeImage),
    ...(fallbackSujet ? titleCandidates(fallbackSujet, typeImage) : []),
  ]

  for (const subject of subjects) {
    const key = subject.toLowerCase()
    if (tried.has(key)) continue
    tried.add(key)
    const url = await resolveOneTitle(subject)
    if (url) return url
  }
  return undefined
}

export const resolveQuizImage = fetchCommonsImageUrl
