/**
 * Quiz musical via API publique Deezer (pas de clé requise).
 * https://api.deezer.com
 *
 * - Réponses QCM = titre seul
 * - Audit / explication = titre + artiste
 * - Tirage : Hits (global) | style | recherche libre
 * - Décennies optionnelles : 80 / 90 / 2000 / 2010 / 2020
 */

export type DeezerDifficulty = 'easy' | 'medium' | 'hard'
export type DeezerScope = 'fr' | 'international'

export interface DeezerQuizQuestion {
  id: string
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  difficulty: DeezerDifficulty
  themeSlug: string
  createdAt: string
  batchId: string
  explanation: string
  sourceType: string
  previewUrl: string
  coverUrl?: string
  deezerTrackId?: string
  /** Titre — Artiste (audit / feedback) */
  revealAnswer: string
}

interface DeezerArtist {
  id?: number
  name?: string
}

interface DeezerAlbum {
  id?: number
  title?: string
  cover_medium?: string
}

interface DeezerTrack {
  id: number
  title?: string
  title_short?: string
  preview?: string
  rank?: number
  artist?: DeezerArtist
  album?: DeezerAlbum
}

interface DeezerSearchResponse {
  data?: DeezerTrack[]
  error?: { message?: string }
}

interface DeezerChartResponse {
  data?: DeezerTrack[]
  error?: { message?: string }
}

const UA = 'QuizzByIA/1.0 (educational quiz; contact: local)'

/** Styles proposés dans l’UI → requêtes Deezer */
export const DEEZER_STYLES: {
  id: string
  label: string
  queryFr: string
  queryIntl: string
}[] = [
  { id: 'pop', label: 'Pop', queryFr: 'pop français', queryIntl: 'pop hits' },
  { id: 'rock', label: 'Rock', queryFr: 'rock français', queryIntl: 'rock hits' },
  { id: 'rap', label: 'Rap / Hip-hop', queryFr: 'rap français', queryIntl: 'hip hop hits' },
  { id: 'electro', label: 'Électro', queryFr: 'électro français', queryIntl: 'edm hits' },
  { id: 'jazz', label: 'Jazz', queryFr: 'jazz', queryIntl: 'jazz classics' },
  {
    id: 'classique',
    label: 'Classique',
    queryFr: 'musique classique',
    queryIntl: 'classical music',
  },
  { id: 'rnb', label: 'R&B / Soul', queryFr: 'rnb soul', queryIntl: 'rnb soul hits' },
  { id: 'metal', label: 'Metal', queryFr: 'metal', queryIntl: 'metal hits' },
  { id: 'reggae', label: 'Reggae', queryFr: 'reggae', queryIntl: 'reggae hits' },
  { id: 'latine', label: 'Latine', queryFr: 'musique latine', queryIntl: 'latin hits' },
  { id: 'kpop', label: 'K-pop', queryFr: 'k-pop', queryIntl: 'k-pop hits' },
  {
    id: 'variete',
    label: 'Variété FR',
    queryFr: 'chanson française tube',
    queryIntl: 'french chanson hits',
  },
]

export const DEEZER_GLOBAL = {
  id: 'hits',
  label: 'Hits (global)',
  queryFr: 'tubes français',
  queryIntl: 'top hits',
} as const

/** Décennies → suffixes de recherche Deezer */
export const DEEZER_DECADES: {
  id: string
  label: string
  queryFr: string
  queryIntl: string
}[] = [
  { id: '80', label: 'Années 80', queryFr: 'années 80', queryIntl: '80s hits' },
  { id: '90', label: 'Années 90', queryFr: 'années 90', queryIntl: '90s hits' },
  {
    id: '2000',
    label: 'Années 2000',
    queryFr: 'années 2000',
    queryIntl: '2000s hits',
  },
  {
    id: '2010',
    label: 'Années 2010',
    queryFr: 'années 2010',
    queryIntl: '2010s hits',
  },
  {
    id: '2020',
    label: 'Années 2020',
    queryFr: 'années 2020',
    queryIntl: '2020s hits',
  },
]

export type DeezerThemeParsed = {
  mode: 'global' | 'style' | 'custom'
  styleId: string | null
  decadeId: string | null
  query: string
  focusLabel: string
}

function newId(): string {
  return crypto.randomUUID()
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function normalizeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

async function deezerGet<T>(pathAndQuery: string): Promise<T> {
  const url = pathAndQuery.startsWith('http')
    ? pathAndQuery
    : `https://api.deezer.com${pathAndQuery}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12_000)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      throw new Error(`Deezer ${res.status}`)
    }
    return (await res.json()) as T
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error('Deezer: délai dépassé')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function trackUsable(t: DeezerTrack): boolean {
  const preview = String(t.preview ?? '').trim()
  const artist = String(t.artist?.name ?? '').trim()
  const title = String(t.title_short || t.title || '').trim()
  return Boolean(preview && artist && title && preview.startsWith('http'))
}

function trackTitle(t: DeezerTrack): string {
  return String(t.title_short || t.title || '').trim()
}

function trackArtist(t: DeezerTrack): string {
  return String(t.artist?.name ?? '').trim()
}

/** Artistes / catalogues à exclure (compil, spam, métadonnées foireuses). */
const JUNK_ARTIST_KEYS = new Set(
  [
    'various artists',
    'various',
    'various artist',
    'multi-interpretes',
    'multi interpretes',
    'varios',
    'varios artistas',
    'compilation',
    'compilations',
    'unknown',
    'unknown artist',
    'artiste inconnu',
    'inconnus',
    'karaoke',
    'karaoke version',
    'tribute',
    'tribute band',
    'cover',
    'covers',
    'soundtrack',
    'ost',
    'movie sounds',
    'deezer',
    'spotify',
    'frenchy family',
    'the frenchy family',
    'union du son',
    'viva la rock',
    'saja boys',
    'huntr/x',
    'huntrx',
    'hazbin hotel',
  ].map((s) => normalizeKey(s)),
)

function isJunkArtist(name: string): boolean {
  const n = normalizeKey(name)
  if (!n || n.length < 2) return true
  if (JUNK_ARTIST_KEYS.has(n)) return true
  if (n.includes('various artist')) return true
  if (n.includes('karaoke')) return true
  if (n.includes('tribute to') || n.includes('tribute')) return true
  if (n.includes('multi-interprete') || n.includes('multi interprete')) return true
  if (/\bcover(s)?\b/.test(n) && n.length < 40) return true
  // Faux “artistes” type playlist / genre / hits
  if (
    /\b(hits?|tubes?|variete|playlist|best of|compilation|karaoke|soundtrack|ost)\b/.test(
      n,
    )
  ) {
    return true
  }
  if (
    /\b(music|musique)\b/.test(n) &&
    /\b(pop|rock|rap|jazz|metal|electro|latina|latine|francais|french|italian)\b/.test(
      n,
    )
  ) {
    return true
  }
  if (/\b(pop|rock|rap|jazz|metal|electro)\s+(band|hits?|music|musique)\b/.test(n)) {
    return true
  }
  // Mix / playlists déguisées
  if (/\bparty\s*mix\b/.test(n) || /\bdj\b.*\bmix\b/.test(n)) return true
  if (/\b\d{2,4}s?\s*(hits?|party|mix|kids|anthems?|playlist)\b/.test(n)) {
    return true
  }
  if (/\b(annees?|years?)\s*\d{2,4}\b/.test(n)) return true
  if (n.includes('frenchy') || n.includes('lounge orchestra')) return true
  if (n.includes('union du son') || n.includes('viva la rock')) return true
  if (/\b(cover|tribute)\s+(band|version|project)\b/.test(n)) return true
  // Nom d’artiste = juste un genre
  if (
    /^(pop|rock|rap|hip hop|jazz|metal|electro|reggae|rnb|soul|classique|classical)$/.test(
      n,
    )
  ) {
    return true
  }
  return false
}

/** Popularité Deezer (rank) — plus haut = plus connu */
function trackFame(t: DeezerTrack): number {
  return typeof t.rank === 'number' && Number.isFinite(t.rank) && t.rank > 0
    ? t.rank
    : 0
}

/** Plancher de popularité selon le niveau (évite les obscurs). */
function minRankForDifficulty(
  difficulty: DeezerDifficulty,
  decadeMode = false,
): number {
  // Les hits d’époque ont souvent un rank Deezer plus bas que les tubes actuels
  if (decadeMode) {
    if (difficulty === 'easy') return 80_000
    if (difficulty === 'medium') return 35_000
    return 12_000
  }
  if (difficulty === 'easy') return 400_000
  if (difficulty === 'medium') return 120_000
  return 40_000
}

/**
 * Piste jouable + artiste réel + assez populaire.
 * Refuse album-as-artist (artiste == titre album) et titres vides de sens.
 */
function isQualityTrack(
  t: DeezerTrack,
  minRank: number,
): boolean {
  if (!trackUsable(t)) return false
  const artist = trackArtist(t)
  const title = trackTitle(t)
  if (isJunkArtist(artist)) return false
  if (trackFame(t) < minRank) return false

  const album = String(t.album?.title ?? '').trim()
  if (album && normalizeKey(artist) === normalizeKey(album)) return false
  if (normalizeKey(title) === normalizeKey(artist)) return false

  // Titres type "Track 01", "Intro", trop génériques
  const tn = normalizeKey(title)
  if (/^(track|piste|song)\s*\d+$/.test(tn)) return false
  if (['intro', 'outro', 'interlude', 'silence'].includes(tn)) return false

  // Aussi rejeter si le TITRE ressemble à un pack “90s hits”
  if (/\bparty\s*mix\b/.test(tn)) return false
  if (/\b\d{2}s\s+(hits?|kids|anthem|mix)\b/.test(tn)) return false

  // Artiste = mêmes mots que le titre (spam fréquent)
  const an = normalizeKey(artist)
  const titleWords = tn.split(' ').filter(Boolean).sort().join(' ')
  const artistWords = an.split(' ').filter(Boolean).sort().join(' ')
  if (titleWords.length >= 6 && titleWords === artistWords) return false

  return true
}

/** Réponse affichée au joueur : titre seul */
function answerLabel(t: DeezerTrack): string {
  return trackTitle(t)
}

function findDecadeByLabel(part: string): (typeof DEEZER_DECADES)[number] | null {
  const n = normalizeKey(part)
  return (
    DEEZER_DECADES.find(
      (d) =>
        normalizeKey(d.label) === n ||
        d.id === n ||
        n === `annees ${d.id}` ||
        n === `${d.id}s`,
    ) ?? null
  )
}

function findStyleByLabel(part: string): (typeof DEEZER_STYLES)[number] | null {
  const n = normalizeKey(part)
  return (
    DEEZER_STYLES.find(
      (s) => normalizeKey(s.label) === n || s.id === n,
    ) ?? null
  )
}

function isGlobalLabel(part: string): boolean {
  const n = normalizeKey(part)
  return (
    n === normalizeKey(DEEZER_GLOBAL.label) ||
    n === 'hits' ||
    n === 'hits global' ||
    n === 'global' ||
    n === 'tubes'
  )
}

/**
 * Parse "Deezer — Pop · Années 90" / "Deezer — Hits (global)" / texte libre.
 */
export function parseDeezerTheme(theme: string): DeezerThemeParsed {
  const raw = theme.trim()
  const afterDash = raw.includes('—')
    ? raw.split('—').slice(1).join('—').trim()
    : raw.replace(/^deezer\s*/i, '').replace(/^musique\s*/i, '').trim()
  const focus = afterDash || raw

  const parts = focus.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean)
  let base = parts[0] || focus
  let decadePart = parts.length > 1 ? parts[parts.length - 1] : ''

  // "Pop Années 90" sans point médian
  if (!decadePart) {
    const m = base.match(
      /^(.*?)\s+(années?\s*(?:80|90|2000|2010|2020)|(?:80|90|2000|2010|2020)s?)$/i,
    )
    if (m) {
      base = m[1].trim()
      decadePart = m[2].trim()
    }
  }

  const decade = decadePart ? findDecadeByLabel(decadePart) : null
  const decadeId = decade?.id ?? null

  if (isGlobalLabel(base)) {
    return {
      mode: 'global',
      styleId: null,
      decadeId,
      query: '',
      focusLabel: decade
        ? `${DEEZER_GLOBAL.label} · ${decade.label}`
        : DEEZER_GLOBAL.label,
    }
  }

  const style = findStyleByLabel(base)
  if (style) {
    return {
      mode: 'style',
      styleId: style.id,
      decadeId,
      query: '',
      focusLabel: decade ? `${style.label} · ${decade.label}` : style.label,
    }
  }

  return {
    mode: 'custom',
    styleId: null,
    decadeId,
    query: focus,
    focusLabel: focus,
  }
}

function withDecade(
  baseQuery: string,
  decadeId: string | null,
  scope: DeezerScope,
): string[] {
  if (!decadeId) return [baseQuery]
  const decade = DEEZER_DECADES.find((d) => d.id === decadeId)
  if (!decade) return [baseQuery]
  const dQ = scope === 'fr' ? decade.queryFr : decade.queryIntl
  return [
    `${baseQuery} ${dQ}`,
    `${baseQuery} ${decade.queryIntl}`,
    `${dQ} ${baseQuery}`,
    dQ,
  ]
}

function buildSearchQueries(theme: string, scope: DeezerScope): string[] {
  const parsed = parseDeezerTheme(theme)

  if (parsed.mode === 'custom' && parsed.query) {
    const base = parsed.query
    const variants =
      scope === 'fr'
        ? [base, `${base} français`, `${base} france`]
        : [base, `${base} hits`, base]
    const out: string[] = []
    for (const v of variants) {
      out.push(...withDecade(v, parsed.decadeId, scope))
    }
    return [...new Set(out)]
  }

  if (parsed.mode === 'global') {
    const primary =
      scope === 'fr' ? DEEZER_GLOBAL.queryFr : DEEZER_GLOBAL.queryIntl
    const bases = [
      primary,
      scope === 'fr' ? 'hits france' : 'billboard hits',
      'top hits',
      scope === 'fr' ? 'variété française tubes' : 'greatest hits',
    ]
    const out: string[] = []
    for (const b of bases) {
      out.push(...withDecade(b, parsed.decadeId, scope))
    }
    return [...new Set(out)]
  }

  const style =
    DEEZER_STYLES.find((s) => s.id === parsed.styleId) ?? DEEZER_STYLES[0]
  const primary = scope === 'fr' ? style.queryFr : style.queryIntl
  const bases = [primary, style.queryIntl, style.label]
  const out: string[] = []
  for (const b of bases) {
    out.push(...withDecade(b, parsed.decadeId, scope))
  }
  return [...new Set(out)]
}

async function fetchTracksForQuery(
  q: string,
  limit = 40,
): Promise<DeezerTrack[]> {
  const data = await deezerGet<DeezerSearchResponse>(
    `/search/track?q=${encodeURIComponent(q)}&limit=${limit}&order=RANKING`,
  )
  if (data.error?.message) throw new Error(data.error.message)
  return (data.data ?? []).filter(trackUsable)
}

async function fetchChartTracks(limit = 100): Promise<DeezerTrack[]> {
  const out: DeezerTrack[] = []
  const pages = [0, 25, 50, 75, 100]
  for (const index of pages) {
    if (out.length >= limit) break
    try {
      const data = await deezerGet<DeezerChartResponse>(
        `/chart/0/tracks?index=${index}&limit=25`,
      )
      for (const t of data.data ?? []) {
        if (trackUsable(t) && !out.some((x) => x.id === t.id)) out.push(t)
      }
    } catch {
      /* page suivante */
    }
  }
  return out
}

function addTracks(
  byId: Map<number, DeezerTrack>,
  tracks: DeezerTrack[],
  minRank: number,
  decadeId: string | null = null,
) {
  for (const t of tracks) {
    if (byId.has(t.id)) continue
    if (!isQualityTrack(t, minRank)) continue
    if (isDecadeSpam(t, decadeId)) continue
    byId.set(t.id, t)
  }
}

async function collectTracks(
  theme: string,
  scope: DeezerScope,
  need: number,
  difficulty: DeezerDifficulty,
): Promise<DeezerTrack[]> {
  const parsed = parseDeezerTheme(theme)
  const queries = buildSearchQueries(theme, scope)
  const decadeMode = Boolean(parsed.decadeId)
  const minRank = minRankForDifficulty(difficulty, decadeMode)
  // Pendant la collecte : plancher bas pour remplir le vivier, puis filtre minRank
  const searchFloor = decadeMode
    ? Math.max(3_000, Math.floor(minRank * 0.25))
    : Math.max(10_000, Math.floor(minRank * 0.4))
  const byId = new Map<number, DeezerTrack>()

  // Hits (global) sans décennie : charts Deezer en premier (vrais tubes).
  // Styles / décennies : pas de chart mondial (hors-sujet) — recherche + rank.
  if (parsed.mode === 'global' && !parsed.decadeId) {
    try {
      addTracks(byId, await fetchChartTracks(120), searchFloor, null)
    } catch {
      /* fallback search */
    }
  }

  const chartEnough =
    parsed.mode === 'global' && !parsed.decadeId && byId.size >= need * 2

  if (!chartEnough) {
    for (const q of queries) {
      if (byId.size >= need * 8) break
      try {
        addTracks(
          byId,
          await fetchTracksForQuery(q, 80),
          searchFloor,
          parsed.decadeId,
        )
      } catch {
        /* requête suivante */
      }
    }
  }

  let list = [...byId.values()].filter(
    (t) =>
      isQualityTrack(t, minRank) && !isDecadeSpam(t, parsed.decadeId),
  )

  // Assouplir progressivement si vivier trop petit (jamais junk / spam décennie)
  if (list.length < need + 4) {
    for (const factor of [0.5, 0.25, 0.12]) {
      const relaxed = Math.max(decadeMode ? 2_000 : 8_000, Math.floor(minRank * factor))
      list = [...byId.values()]
        .filter(
          (t) =>
            isQualityTrack(t, relaxed) && !isDecadeSpam(t, parsed.decadeId),
        )
        .sort((a, b) => trackFame(b) - trackFame(a))
      if (list.length >= need + 4) break
    }
  }

  // Recherche libre : ancrage thème si possible
  if (parsed.mode === 'custom' && parsed.query) {
    const themeTokens = themeFocusTokens(theme)
    if (themeTokens.length > 0) {
      const themed = list.filter((t) => trackMatchesTheme(t, themeTokens))
      if (themed.length >= need) list = themed
    }
  }

  return list.sort((a, b) => trackFame(b) - trackFame(a))
}

function themeFocusTokens(theme: string): string[] {
  const { query, styleId, focusLabel } = parseDeezerTheme(theme)
  const raw =
    query ||
    (styleId
      ? (DEEZER_STYLES.find((s) => s.id === styleId)?.label ?? '')
      : focusLabel)
  return normalizeKey(raw)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length >= 3 &&
        !['deezer', 'musique', 'the', 'and', 'hits', 'global', 'annees'].includes(
          t,
        ),
    )
}

function trackMatchesTheme(t: DeezerTrack, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const hay = normalizeKey(
    [trackTitle(t), trackArtist(t), t.album?.title || ''].join(' '),
  )
  return tokens.some((tok) => hay.includes(tok))
}

/** Rejette les faux “hits années X” (artiste = playlist décennie). */
function isDecadeSpam(t: DeezerTrack, decadeId: string | null): boolean {
  if (!decadeId) return false
  const decade = DEEZER_DECADES.find((d) => d.id === decadeId)
  if (!decade) return false
  const blob = normalizeKey(`${trackTitle(t)} ${trackArtist(t)}`)
  const id = decade.id
  // Titre qui se vend comme “90s …” (pas un vrai tube d’époque)
  if (/\b\d{2}s\b/.test(normalizeKey(trackTitle(t)))) return true
  // Ex. "90s kids", "DJ 90's Party Mix", "années 90 hits"
  if (blob.includes(`${id}s kids`) || blob.includes(`${id} kids`)) return true
  if (blob.includes(`dj ${id}`) || blob.includes(`${id}s party`)) return true
  if (blob.includes(`annees ${id}`) && trackArtist(t).length < 28) return true
  if (
    normalizeKey(trackArtist(t)).includes(`${id}s`) ||
    normalizeKey(trackArtist(t)).includes(`annees ${id}`)
  ) {
    return true
  }
  return false
}

/**
 * Facile → top hits (vivier assez large pour 10 Q + leurres)
 * Moyen → pool populaire (haut du classement)
 * Difficile → moins évident mais toujours au-dessus du plancher rank
 */
function orderPoolForDifficulty(
  pool: DeezerTrack[],
  difficulty: DeezerDifficulty,
): DeezerTrack[] {
  const sorted = [...pool].sort((a, b) => trackFame(b) - trackFame(a))
  if (sorted.length <= 16) return shuffle(sorted)

  if (difficulty === 'easy') {
    // Assez large pour 10 bonnes réponses + leurres variés
    const topN = Math.min(
      sorted.length,
      Math.max(28, Math.ceil(sorted.length * 0.55)),
    )
    return shuffle(sorted.slice(0, topN))
  }

  if (difficulty === 'hard') {
    const start = Math.min(
      Math.floor(sorted.length * 0.15),
      Math.max(0, sorted.length - 24),
    )
    const end = Math.min(
      sorted.length,
      start + Math.max(24, Math.ceil(sorted.length * 0.55)),
    )
    const slice = sorted.slice(start, end)
    return shuffle(slice.length >= 12 ? slice : sorted.slice(0, 28))
  }

  // medium
  const midN = Math.min(sorted.length, Math.max(28, Math.ceil(sorted.length * 0.7)))
  return shuffle(sorted.slice(0, midN))
}

/**
 * Leurres aléatoires (titre seul).
 * - facile : tirage au sort parmi les autres artistes populaires (pas toujours les mêmes top)
 * - moyen : mix aléatoire du pool
 * - difficile : même artiste en priorité, puis aléatoire
 * avoidTitles : évite de répéter les mêmes leurres d’une question à l’autre
 */
function pickWrongLabels(
  pool: DeezerTrack[],
  correct: DeezerTrack,
  count: number,
  difficulty: DeezerDifficulty,
  avoidTitles: Set<string> = new Set(),
): string[] {
  const correctId = correct.id
  const correctArtist = normalizeKey(trackArtist(correct))
  const correctTitle = normalizeKey(trackTitle(correct))
  const seen = new Set<string>([correctTitle, ...avoidTitles])
  const out: string[] = []

  function tryAdd(t: DeezerTrack): boolean {
    if (t.id === correctId) return false
    const title = answerLabel(t)
    const n = normalizeKey(title)
    if (!title || seen.has(n)) return false
    seen.add(n)
    out.push(title)
    return out.length >= count
  }

  function pickFrom(list: DeezerTrack[]): boolean {
    for (const t of shuffle(list)) {
      if (tryAdd(t)) return true
    }
    return out.length >= count
  }

  const sameArtist = pool.filter(
    (t) =>
      t.id !== correctId &&
      correctArtist &&
      normalizeKey(trackArtist(t)) === correctArtist,
  )
  const otherArtists = pool.filter(
    (t) =>
      t.id !== correctId &&
      normalizeKey(trackArtist(t)) !== correctArtist,
  )

  if (difficulty === 'hard') {
    if (pickFrom(sameArtist)) return out
    if (pickFrom(otherArtists)) return out
  } else if (difficulty === 'easy') {
    // Top populaire, puis mélange aléatoire (évite toujours les 3 mêmes tubes)
    const famousSorted = [...otherArtists].sort(
      (a, b) => trackFame(b) - trackFame(a),
    )
    const topN = Math.max(
      12,
      Math.min(famousSorted.length, Math.ceil(famousSorted.length * 0.65)),
    )
    const famousPool = famousSorted.slice(0, topN)
    if (pickFrom(famousPool)) return out
    if (pickFrom(famousSorted.slice(topN))) return out
    if (pickFrom(sameArtist)) return out
  } else {
    if (pickFrom(otherArtists)) return out
    if (pickFrom(sameArtist)) return out
  }

  // Dernier recours : autoriser des titres déjà utilisés comme leurres ailleurs
  const softSeen = new Set<string>([correctTitle])
  const softOut = [...out]
  for (const t of shuffle(pool)) {
    if (t.id === correctId) continue
    const title = answerLabel(t)
    const n = normalizeKey(title)
    if (!title || softSeen.has(n)) continue
    softSeen.add(n)
    if (!softOut.includes(title)) softOut.push(title)
    if (softOut.length >= count) break
  }
  return softOut.slice(0, count)
}

function themeQuestionPrompts(themeLabel: string): string[] {
  const focus = themeLabel.trim()
  if (!focus) {
    return [
      'Quel morceau entends-tu ?',
      'Quel est le titre de cet extrait ?',
      'Retrouve le titre de ce morceau.',
    ]
  }
  return [
    `Quel morceau « ${focus} » entends-tu ?`,
    `Retrouve le titre de cet extrait (${focus}).`,
    `Parmi ces titres liés à « ${focus} », lequel est joué ?`,
    `Quel est le titre de ce morceau dans le thème ${focus} ?`,
  ]
}

function makeTitleQuestion(
  track: DeezerTrack,
  pool: DeezerTrack[],
  difficulty: DeezerDifficulty,
  themeSlug: string,
  batchId: string,
  now: string,
  promptIndex: number,
  themeLabel: string,
  avoidWrongTitles: Set<string> = new Set(),
): DeezerQuizQuestion | null {
  const artist = trackArtist(track)
  const title = trackTitle(track)
  const preview = String(track.preview ?? '').trim()
  const correct = answerLabel(track)
  if (!preview || !artist || !title || !correct) return null

  const wrongs = pickWrongLabels(
    pool,
    track,
    3,
    difficulty,
    avoidWrongTitles,
  )
  if (wrongs.length < 3) return null

  const answers = shuffle([correct, ...wrongs.slice(0, 3)]) as [
    string,
    string,
    string,
    string,
  ]
  const correctIndex = answers.indexOf(correct) as 0 | 1 | 2 | 3
  const prompts = themeQuestionPrompts(themeLabel)

  return {
    id: newId(),
    question: prompts[promptIndex % prompts.length],
    answers,
    correctIndex,
    difficulty,
    themeSlug,
    createdAt: now,
    batchId,
    explanation: `L’extrait correspond à « ${title} » de ${artist} (thème : ${themeLabel || 'Deezer'}).`,
    sourceType: 'Deezer (extrait officiel)',
    previewUrl: preview,
    coverUrl: track.album?.cover_medium || undefined,
    deezerTrackId: String(track.id),
    revealAnswer: `${title} — ${artist}`,
  }
}

export async function buildDeezerQuiz(input: {
  theme: string
  themeSlug: string
  difficulty: DeezerDifficulty
  scope: DeezerScope
  excludeQuestions?: string[]
  count?: number
}): Promise<
  | { questions: DeezerQuizQuestion[]; message: string }
  | { error: string }
> {
  const count = Math.max(1, Math.min(10, input.count ?? 10))
  const excluded = new Set(
    (input.excludeQuestions ?? []).map((q) => normalizeKey(q)),
  )

  let pool: DeezerTrack[]
  try {
    pool = await collectTracks(
      input.theme,
      input.scope,
      count + 60,
      input.difficulty,
    )
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `Deezer indisponible (${e.message})`
          : 'Deezer indisponible',
    }
  }

  if (pool.length < 8) {
    return {
      error:
        'Pas assez de tubes connus pour ce thème. Essaie Hits (global), un autre style, ou élargis la décennie.',
    }
  }

  // Vivier large pour les leurres ; sous-ensemble pour les bonnes réponses
  const distractorPool = [...pool]
  const answerPool = orderPoolForDifficulty(pool, input.difficulty)

  const batchId = newId()
  const now = new Date().toISOString()
  const questions: DeezerQuizQuestion[] = []
  const usedTrackIds = new Set<number>()
  const usedTitles = new Set<string>()
  const usedWrongTitles = new Set<string>()
  const parsed = parseDeezerTheme(input.theme)
  const themeLabel = parsed.focusLabel || 'Deezer'

  const DIFF_FR = { easy: 'facile', medium: 'moyen', hard: 'difficile' } as const

  function tryAddFrom(
    candidates: DeezerTrack[],
    opts: { preferUniqueWrongs: boolean; allowWrongAsCorrect: boolean },
  ) {
    for (const track of shuffle(candidates)) {
      if (questions.length >= count) return
      if (usedTrackIds.has(track.id)) continue
      const titleKey = normalizeKey(trackTitle(track))
      if (!titleKey || usedTitles.has(titleKey)) continue
      if (!opts.allowWrongAsCorrect && usedWrongTitles.has(titleKey)) continue

      const avoidWrongs = opts.preferUniqueWrongs
        ? new Set<string>([...usedTitles, ...usedWrongTitles])
        : new Set<string>([...usedTitles])

      const q = makeTitleQuestion(
        track,
        distractorPool,
        input.difficulty,
        input.themeSlug,
        batchId,
        now,
        questions.length,
        themeLabel,
        avoidWrongs,
      )
      if (!q) continue
      const fingerprint = normalizeKey(
        `${q.question}|${q.answers[q.correctIndex]}`,
      )
      if (excluded.has(fingerprint)) continue
      if (
        questions.some(
          (x) =>
            normalizeKey(`${x.question}|${x.answers[x.correctIndex]}`) ===
            fingerprint,
        )
      ) {
        continue
      }
      usedTrackIds.add(track.id)
      usedTitles.add(titleKey)
      for (let i = 0; i < q.answers.length; i++) {
        if (i === q.correctIndex) continue
        usedWrongTitles.add(normalizeKey(q.answers[i]))
      }
      questions.push(q)
    }
  }

  // 1) Leurres variés en priorité
  tryAddFrom(answerPool, {
    preferUniqueWrongs: true,
    allowWrongAsCorrect: false,
  })
  // 2) Compléter en réutilisant des leurres si besoin
  if (questions.length < count) {
    tryAddFrom(answerPool, {
      preferUniqueWrongs: false,
      allowWrongAsCorrect: false,
    })
  }
  // 3) Élargir aux titres déjà vus en leurres + tout le vivier
  if (questions.length < count) {
    tryAddFrom(distractorPool, {
      preferUniqueWrongs: false,
      allowWrongAsCorrect: true,
    })
  }

  if (questions.length < count) {
    return {
      error: `Seulement ${questions.length}/${count} questions musicales générées. Élargis le thème ou change de style / décennie.`,
    }
  }

  return {
    questions: shuffle(questions.slice(0, count)),
    message: `Quiz musical Deezer — ${themeLabel} (${DIFF_FR[input.difficulty]})`,
  }
}
