/**
 * Preuves factuelles via Wikipédia FR — recherche stricte (anti hors-sujet).
 */

const FETCH_MS = 4_000
const UA = 'QuizzApp/1.0 (fact-check; educational)'

const STOP = new Set(
  [
    'a',
    'au',
    'aux',
    'avec',
    'ce',
    'ces',
    'cet',
    'cette',
    'dans',
    'de',
    'des',
    'du',
    'en',
    'et',
    'est',
    'il',
    'ils',
    'je',
    'la',
    'le',
    'les',
    'un',
    'une',
    'ou',
    'par',
    'pas',
    'pour',
    'que',
    'qui',
    'quoi',
    'quel',
    'quelle',
    'quels',
    'quelles',
    'se',
    'sa',
    'son',
    'sur',
    'the',
    'of',
    'nom',
    'appel',
    'appelle',
    'comment',
    'quand',
    'ou',
    'combien',
    'principal',
    'principale',
    'lieu',
    'serie',
    'film',
    'jeu',
    'personnage',
  ].map((w) =>
    w
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  ),
)

export type WikiHit = {
  lang: 'fr'
  title: string
  extract: string
  url: string
  score?: number
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

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function keywords(text: string, minLen = 4): string[] {
  return norm(text)
    .split(' ')
    .filter((w) => w.length >= minLen && !STOP.has(w))
}

async function wikiSummary(title: string): Promise<WikiHit | null> {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'))
  const data = await fetchJson<{
    type?: string
    title?: string
    extract?: string
    description?: string
    content_urls?: { desktop?: { page?: string } }
  }>(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encoded}`)
  if (!data || data.type === 'disambiguation') return null
  const extract = String(data.extract ?? '').trim()
  if (extract.length < 40) return null
  const desc = String(data.description ?? '').trim()
  return {
    lang: 'fr',
    title: String(data.title ?? title).trim(),
    extract: (desc ? `${desc}. ${extract}` : extract).slice(0, 700),
    url:
      data.content_urls?.desktop?.page ??
      `https://fr.wikipedia.org/wiki/${encoded}`,
  }
}

async function wikiSearchTitles(query: string, limit = 5): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(limit),
    format: 'json',
    origin: '*',
  })
  const data = await fetchJson<{
    query?: { search?: Array<{ title?: string; snippet?: string }> }
  }>(`https://fr.wikipedia.org/w/api.php?${params}`)
  const out: string[] = []
  for (const row of data?.query?.search ?? []) {
    const t = String(row.title ?? '').trim()
    if (t) out.push(t)
  }
  return out
}

/**
 * Score 0–100. Refuse les pages hors sujet (ex. « New York » sans le thème Friends).
 */
export function scoreWikiHit(
  hit: WikiHit,
  answer: string,
  question: string,
  theme?: string,
): number {
  const titleN = norm(hit.title)
  const blob = norm(`${hit.title} ${hit.extract}`)
  const ans = norm(answer)
  const th = theme ? norm(theme) : ''
  const qKeys = keywords(question).slice(0, 6)

  if (ans.length < 2) return 0

  // Réponse absente du titre ET de l’extrait → hors sujet
  const answerInTitle =
    titleN === ans ||
    titleN.startsWith(`${ans} `) ||
    titleN.includes(` ${ans}`) ||
    titleN.includes(`(${ans}`)
  const answerInBlob = blob.includes(ans)
  if (!answerInTitle && !answerInBlob) {
    const parts = ans.split(' ').filter((w) => w.length >= 3)
    if (!(parts.length > 0 && parts.every((w) => blob.includes(w)))) return 0
  }

  let score = 0
  if (titleN === ans) score += 50
  else if (answerInTitle) score += 35
  else if (answerInBlob) score += 15

  // Thème fort si fourni (séries, films, jeux…)
  if (th.length >= 3) {
    if (blob.includes(th) || titleN.includes(th)) score += 30
    else score -= 40 // pas le bon univers → très pénalisé
  }

  // Mots de la question (lieu, café, personnage…)
  let qHits = 0
  for (const k of qKeys) {
    if (k === ans || (th && k === th)) continue
    if (blob.includes(k)) qHits += 1
  }
  score += Math.min(20, qHits * 5)

  // Titre trop générique / page liste
  if (/liste des|liste de|homonymie|disambigu/i.test(hit.title)) score -= 50

  return score
}

const MIN_SCORE = 45

/**
 * Cherche des pages Wikipédia FR pertinentes uniquement.
 * Retourne 0–2 hits triés par score.
 */
export async function lookupWikiEvidence(input: {
  correctAnswer: string
  question: string
  theme?: string
}): Promise<WikiHit[]> {
  const answer = input.correctAnswer.trim()
  if (answer.length < 2) return []

  const theme = input.theme?.trim() || ''
  const qKeys = keywords(input.question).slice(0, 4)

  // Requêtes ciblées (jamais la question entière seule)
  const queries = [
    theme ? `"${answer}" ${theme}` : '',
    theme ? `${answer} ${theme}` : '',
    qKeys.length ? `${answer} ${qKeys.slice(0, 2).join(' ')}` : '',
    answer,
  ].filter(Boolean)

  const candidates: string[] = [answer]
  if (theme) candidates.push(`${answer} (${theme})`)

  for (const q of queries) {
    const found = await wikiSearchTitles(q, 5)
    for (const t of found) candidates.push(t)
  }

  const scored: WikiHit[] = []
  const uniqueTitles: string[] = []
  const seenTitles = new Set<string>()
  for (const title of candidates) {
    const key = norm(title)
    if (!key || seenTitles.has(key)) continue
    seenTitles.add(key)
    uniqueTitles.push(title.trim())
  }

  // Parallelise les résumés (max 8) pour rester sous le budget Vercel
  const summaries = await Promise.all(
    uniqueTitles.slice(0, 8).map((title) => wikiSummary(title)),
  )

  for (const hit of summaries) {
    if (!hit) continue
    const score = scoreWikiHit(hit, answer, input.question, theme || undefined)
    if (score < MIN_SCORE) continue
    scored.push({ ...hit, score })
  }

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  // Évite 2 pages quasi identiques
  const out: WikiHit[] = []
  for (const h of scored) {
    const tooClose = out.some(
      (o) =>
        norm(o.title) === norm(h.title) ||
        norm(o.extract).slice(0, 80) === norm(h.extract).slice(0, 80),
    )
    if (tooClose) continue
    out.push(h)
    if (out.length >= 2) break
  }
  return out
}

/** @deprecated — utiliser scoreWikiHit */
export function wikiLooksRelevant(
  hit: WikiHit,
  answer: string,
  theme?: string,
): boolean {
  return scoreWikiHit(hit, answer, '', theme) >= MIN_SCORE
}
