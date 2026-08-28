/**
 * Quiz musical via API publique Deezer (pas de clé requise).
 * https://api.deezer.com
 *
 * - Réponses QCM = titre seul (moyen/difficile) ; titre — artiste (facile)
 * - Audit / explication = titre + artiste
 * - Tirage : Hits (global) | style | recherche libre (artiste via /artist/top)
 * - Difficulté (toujours des hits populaires — le niveau change le format, pas l’obscurité) :
 *   - facile = tubes, QCM (titre + artiste)
 *   - moyen = hits encore très connus, QCM (titre seul)
 *   - difficile = hits, réponse libre
 *     (artiste choisi → titre seul ; sinon titre OU artiste)
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
  /** qcm = 4 choix ; free = saisie titre ou artiste */
  answerMode?: 'qcm' | 'free'
  /** Réponses acceptées en mode free (titre, artiste, variantes) */
  acceptedAnswers?: string[]
  /** free : 'title' = titre seul (quiz artiste) ; 'title_or_artist' sinon */
  freeInputHint?: 'title' | 'title_or_artist'
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
  { id: 'house', label: 'House', queryFr: 'house française', queryIntl: 'house hits' },
  { id: 'techno', label: 'Techno', queryFr: 'techno', queryIntl: 'techno hits' },
  { id: 'trance', label: 'Trance', queryFr: 'trance', queryIntl: 'trance hits' },
  { id: 'disco', label: 'Disco', queryFr: 'disco', queryIntl: 'disco hits' },
  { id: 'funk', label: 'Funk', queryFr: 'funk', queryIntl: 'funk hits' },
  { id: 'jazz', label: 'Jazz', queryFr: 'jazz', queryIntl: 'jazz classics' },
  { id: 'blues', label: 'Blues', queryFr: 'blues', queryIntl: 'blues classics' },
  { id: 'gospel', label: 'Gospel', queryFr: 'gospel', queryIntl: 'gospel hits' },
  {
    id: 'classique',
    label: 'Classique',
    queryFr: 'musique classique piano',
    queryIntl: 'classical piano essentials',
  },
  { id: 'rnb', label: 'R&B / Soul', queryFr: 'rnb soul', queryIntl: 'rnb soul hits' },
  { id: 'metal', label: 'Metal', queryFr: 'metal', queryIntl: 'metal hits' },
  { id: 'punk', label: 'Punk', queryFr: 'punk rock', queryIntl: 'punk hits' },
  { id: 'indie', label: 'Indie', queryFr: 'indie français', queryIntl: 'indie hits' },
  { id: 'reggae', label: 'Reggae', queryFr: 'reggae', queryIntl: 'reggae hits' },
  { id: 'country', label: 'Country', queryFr: 'country', queryIntl: 'country hits' },
  { id: 'folk', label: 'Folk', queryFr: 'folk', queryIntl: 'folk hits' },
  { id: 'latine', label: 'Latine', queryFr: 'musique latine', queryIntl: 'latin hits' },
  { id: 'afrobeats', label: 'Afrobeats', queryFr: 'afrobeats', queryIntl: 'afrobeats hits' },
  { id: 'amapiano', label: 'Amapiano', queryFr: 'amapiano', queryIntl: 'amapiano hits' },
  { id: 'kpop', label: 'K-pop', queryFr: 'k-pop', queryIntl: 'k-pop hits' },
  {
    id: 'variete',
    label: 'Variété FR',
    queryFr: 'chanson française tube',
    queryIntl: 'french chanson hits',
  },
  {
    id: 'variete-intl',
    label: 'Variété internationale',
    queryFr: 'hits internationaux france',
    queryIntl: 'international pop hits',
  },
  {
    id: 'ost',
    label: 'Bandes originales',
    queryFr: 'bande originale film',
    queryIntl: 'movie soundtrack hits',
  },
  {
    id: 'comedie-musicale',
    label: 'Comédies musicales',
    queryFr: 'comédie musicale',
    queryIntl: 'musical theatre hits',
  },
]

export const DEEZER_GLOBAL = {
  id: 'hits',
  label: 'Hits (global)',
  queryFr: 'tubes français',
  queryIntl: 'top hits',
} as const

/** Décennies / période → suffixes de recherche Deezer */
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

function resolveDecadePeriod(decadeId: string | null): {
  id: string
  label: string
  queryFr: string
  queryIntl: string
} | null {
  if (!decadeId) return null
  return DEEZER_DECADES.find((d) => d.id === decadeId) ?? null
}

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

/** Clé anti-doublon : ignore remix / feat / remaster (même « appellation »). */
function titleDedupeKey(s: string): string {
  return normalizeKey(s)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(
      /\b(feat|ft|featuring|with|remix|remaster(?:ed)?|live|radio edit|version|acoustic|deluxe|extended|edit|bonus|instrumental)\b.*$/g,
      ' ',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

/** Artistes / catalogues spam (toujours exclus). */
const SPAM_ARTIST_KEYS = new Set(
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

/** Actes cover / tribute — exclus hors mode difficile. */
function isCoverActArtist(name: string): boolean {
  const n = normalizeKey(name)
  if (!n) return false
  if (n === 'cover' || n === 'covers' || n === 'tribute' || n === 'tribute band') {
    return true
  }
  if (n.includes('tribute to') || n.includes('tribute')) return true
  if (/\bcover(s)?\b/.test(n)) return true
  if (/\b(cover|tribute)\s+(band|version|project|players?|orchestra)\b/.test(n)) {
    return true
  }
  return false
}

function isSpamArtist(name: string): boolean {
  const n = normalizeKey(name)
  if (!n || n.length < 2) return true
  if (SPAM_ARTIST_KEYS.has(n)) return true
  if (n.includes('various artist')) return true
  if (n.includes('karaoke')) return true
  if (n.includes('multi-interprete') || n.includes('multi interprete')) return true
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

function isJunkArtist(name: string, allowCoverActs = false): boolean {
  if (isSpamArtist(name)) return true
  if (!allowCoverActs && isCoverActArtist(name)) return true
  return false
}

/**
 * Classification piste — les remix sont exclus de tous les niveaux.
 */
function isRemixTrack(t: DeezerTrack): boolean {
  const title = normalizeKey(trackTitle(t))
  return /\b(remix|rmx|bootleg|mash[\s-]?up|rework|vip mix|club mix|extended mix|dub mix)\b/.test(
    title,
  )
}

function isCoverTrack(t: DeezerTrack): boolean {
  const title = normalizeKey(trackTitle(t))
  const album = normalizeKey(String(t.album?.title ?? ''))
  if (/\b(cover|covers|tribute)\b/.test(title)) return true
  if (isCoverActArtist(trackArtist(t))) return true
  if (/\b(covers?|tributes?)\b/.test(album)) return true
  if (/\b(piano|karaoke|orchestral?|harp|acoustic guitar)\s+version\b/.test(title)) {
    return true
  }
  if (/\btribute to\b/.test(title)) return true
  return false
}

function isInstrumentalTrack(t: DeezerTrack): boolean {
  const title = normalizeKey(trackTitle(t))
  const album = normalizeKey(String(t.album?.title ?? ''))
  if (/\b(instrumental|instru|backing track)\b/.test(title)) return true
  if (/\binstrumentals?\b/.test(album)) return true
  return false
}

/** original uniquement (pas cover/instru/remix) — tous niveaux Deezer actuels */
type TrackVariantFilter = 'original'

function variantForDifficulty(_d: DeezerDifficulty): TrackVariantFilter {
  return 'original'
}

function matchesVariant(t: DeezerTrack, _variant: TrackVariantFilter): boolean {
  if (isRemixTrack(t)) return false
  if (isInstrumentalTrack(t)) return false
  if (isCoverTrack(t)) return false
  return true
}

/** Popularité Deezer (rank) — plus haut = plus connu */
function trackFame(t: DeezerTrack): number {
  return typeof t.rank === 'number' && Number.isFinite(t.rank) && t.rank > 0
    ? t.rank
    : 0
}

/**
 * Plancher de popularité (rank Deezer 0–1M).
 * Sources curées (playlists) : plancher bas — les classiques ont souvent un rank actuel faible.
 * Recherche brute : plancher haut pour éviter le bruit.
 */
function minRankForDifficulty(
  difficulty: DeezerDifficulty,
  decadeMode = false,
): number {
  if (decadeMode) {
    if (difficulty === 'easy') return 40_000
    if (difficulty === 'medium') return 20_000
    return 12_000
  }
  if (difficulty === 'easy') return 220_000
  if (difficulty === 'medium') return 120_000
  return 80_000
}

/** Plancher plus strict pour les résultats de recherche (non curés). */
function searchMinRank(
  difficulty: DeezerDifficulty,
  decadeMode = false,
): number {
  if (decadeMode) {
    if (difficulty === 'easy') return 80_000
    if (difficulty === 'medium') return 40_000
    return 25_000
  }
  if (difficulty === 'easy') return 450_000
  if (difficulty === 'medium') return 280_000
  return 180_000
}

/** Genre Deezer pour /chart/{id}/tracks (hits réels par style). */
const STYLE_CHART_GENRE: Record<string, number> = {
  pop: 132,
  rock: 152,
  rap: 116,
  electro: 106,
  house: 113,
  techno: 106,
  trance: 106,
  disco: 113,
  funk: 169,
  jazz: 129,
  blues: 153,
  gospel: 165,
  classique: 98,
  rnb: 165,
  metal: 464,
  punk: 152,
  indie: 85,
  reggae: 144,
  country: 84,
  folk: 466,
  latine: 197,
  afrobeats: 2,
  amapiano: 2,
  kpop: 16,
  variete: 52,
  'variete-intl': 132,
  ost: 173,
  'comedie-musicale': 173,
}

/**
 * Piste jouable + artiste réel + assez populaire.
 * Refuse album-as-artist (artiste == titre album) et titres vides de sens.
 */
function isQualityTrack(
  t: DeezerTrack,
  minRank: number,
  allowCoverActs = false,
  variant: TrackVariantFilter = 'original',
): boolean {
  if (!trackUsable(t)) return false
  const artist = trackArtist(t)
  const title = trackTitle(t)
  if (isJunkArtist(artist, allowCoverActs)) return false
  if (!matchesVariant(t, variant)) return false
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

/** Réponse QCM : facile = titre + artiste ; moyen/difficile = titre seul */
function answerLabel(t: DeezerTrack, difficulty: DeezerDifficulty): string {
  const title = trackTitle(t)
  if (difficulty === 'easy') {
    const artist = trackArtist(t)
    return artist ? `${title} — ${artist}` : title
  }
  return title
}

function findDecadeByLabel(
  part: string,
): { id: string; label: string; queryFr: string; queryIntl: string } | null {
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
    n === 'tubes' ||
    n === '(global)' ||
    n === 'hits (global)'
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

  // Hits (global) avant le strip « Hits <style> »
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

  // "Hits Pop" / "Hits Rock" → mode style
  const hitsStyle = base.match(/^hits\s+(.+)$/i)
  if (hitsStyle) {
    const rest = hitsStyle[1].trim()
    // "Hits global" / "Hits (global)" ne sont pas un style
    if (isGlobalLabel(rest) || isGlobalLabel(`Hits ${rest}`)) {
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
    base = rest
  }

  const style = findStyleByLabel(base)
  if (style) {
    return {
      mode: 'style',
      styleId: style.id,
      decadeId,
      query: '',
      focusLabel: decade
        ? `Hits ${style.label} · ${decade.label}`
        : `Hits ${style.label}`,
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
  const decade = resolveDecadePeriod(decadeId)
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
    const bases =
      scope === 'fr'
        ? [
            primary,
            'tubes français',
            'hits france',
            'variété française tubes',
            'chanson française hits',
            'top france',
          ]
        : [
            primary,
            'billboard hits',
            'top hits',
            'greatest hits',
            'world hits',
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
  // Hits par style : forcer « hits / tubes » dans les requêtes
  const bases = [
    primary,
    `${style.label} hits`,
    `tubes ${style.label}`,
    `${style.queryIntl}`,
    style.label,
  ]
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

interface DeezerArtistHit {
  id?: number
  name?: string
  nb_fan?: number
}

interface DeezerArtistSearchResponse {
  data?: DeezerArtistHit[]
  error?: { message?: string }
}

interface DeezerTrackListResponse {
  data?: DeezerTrack[]
  error?: { message?: string }
}

function artistNameScore(query: string, name: string): number {
  const q = normalizeKey(query)
  const n = normalizeKey(name)
  if (!q || !n) return 0
  if (q === n) return 1000
  if (n.startsWith(q) || q.startsWith(n)) return 800
  if (n.includes(q) || q.includes(n)) return 600
  const qw = q.split(' ').filter(Boolean)
  const nw = new Set(n.split(' ').filter(Boolean))
  const overlap = qw.filter((w) => nw.has(w)).length
  return overlap * 80
}

/**
 * Catalogue artiste : top titres uniquement (pas la radio « découvertes »).
 * Si la recherche libre est un nom d’artiste, on ancre le quiz dessus.
 */
async function fetchArtistCatalog(artistQuery: string): Promise<{
  artistName: string
  tracks: DeezerTrack[]
} | null> {
  const q = artistQuery.trim()
  if (q.length < 2) return null

  const search = await deezerGet<DeezerArtistSearchResponse>(
    `/search/artist?q=${encodeURIComponent(q)}&limit=8`,
  )
  if (search.error?.message) throw new Error(search.error.message)

  const candidates = (search.data ?? []).filter(
    (a) => a.id && a.name && !isJunkArtist(a.name, false),
  )
  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const sa = artistNameScore(q, a.name!)
    const sb = artistNameScore(q, b.name!)
    if (sb !== sa) return sb - sa
    return (b.nb_fan ?? 0) - (a.nb_fan ?? 0)
  })

  const best = candidates[0]!
  if (artistNameScore(q, best.name!) < 600) return null

  const artistName = best.name!.trim()
  const byId = new Map<number, DeezerTrack>()

  try {
    const top = await deezerGet<DeezerTrackListResponse>(
      `/artist/${best.id}/top?limit=50`,
    )
    for (const t of top.data ?? []) {
      if (trackUsable(t)) byId.set(t.id, t)
    }
  } catch {
    /* top indisponible */
  }

  const tracks = [...byId.values()]
  if (tracks.length < 6) return null
  return { artistName, tracks }
}

async function fetchChartTracks(
  limit = 100,
  genreId = 0,
): Promise<DeezerTrack[]> {
  const out: DeezerTrack[] = []
  const pages = [0, 25, 50, 75, 100]
  for (const index of pages) {
    if (out.length >= limit) break
    try {
      const data = await deezerGet<DeezerChartResponse>(
        `/chart/${genreId}/tracks?index=${index}&limit=25`,
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

interface DeezerPlaylistHit {
  id?: number
  title?: string
  nb_tracks?: number
  nb_fans?: number
  user?: { name?: string }
}

interface DeezerPlaylistSearchResponse {
  data?: DeezerPlaylistHit[]
  error?: { message?: string }
}

interface DeezerArtistChartResponse {
  data?: DeezerArtistHit[]
  error?: { message?: string }
}

function playlistEditorScore(p: DeezerPlaylistHit): number {
  const user = normalizeKey(p.user?.name || '')
  const title = normalizeKey(p.title || '')
  let score = p.nb_fans ?? 0
  if (
    user.includes('deezer') ||
    user.includes('filtr') ||
    user.includes('editor')
  ) {
    score += 500_000
  }
  // Essentiels / classiques > charts du moment
  if (/\b(essentiels?|classiques?|greatest|best of|bestof)\b/.test(title)) {
    score += 400_000
  }
  if (/\b(tubes?|hits?)\b/.test(title) && !/\btop\b/.test(title)) {
    score += 120_000
  }
  // Top / Charts = souvent viral obscur → déprioriser
  if (/\b(top france|deezer charts|charts?)\b/.test(title + ' ' + user)) {
    score -= 600_000
  }
  if (/^\s*top\b/.test(title) || /\btop\s+\d{4}\b/.test(title)) {
    score -= 200_000
  }
  return score
}

/** Playlists Deezer éditoriales = tubes universels (IDs stables). */
const CURATED_PLAYLIST_IDS = {
  fr: [
    1420459465, // Essentiels variété française
    700895155, // Essentiels chanson française
    9128596442, // Essentiels pop rock français
  ],
  international: [
    1036183001, // Pop Essentials
    8282573142, // 10s Pop
    3631248842, // Flashback Party
    8499830842, // Party Hits & All-Time Classics
  ],
} as const

/** Hits internationaux connus en France (pas seulement US obscure). */
const CURATED_PLAYLIST_IDS_INTL_IN_FR = [
  1036183001, // Pop Essentials (tubes universels)
  8282573142, // 10s Pop
  8499830842, // Party Hits & All-Time Classics
  1109890291, // Top France — ce qui cartonne ici
] as const

/** Plancher bas pour playlists curées (un classique peut avoir un rank actuel faible). */
const CURATED_RANK_FLOOR = 3_000
/** Variété intl en portée FR : plancher plus haut = hits vraiment connus */
const FR_INTL_HITS_FLOOR = 80_000

async function fetchTracksFromPlaylistIds(
  ids: number[],
  maxTracks = 120,
): Promise<DeezerTrack[]> {
  const byId = new Map<number, DeezerTrack>()
  for (const id of ids) {
    if (byId.size >= maxTracks) break
    try {
      const page = await deezerGet<DeezerTrackListResponse>(
        `/playlist/${id}/tracks?limit=50`,
      )
      for (const t of page.data ?? []) {
        if (!trackUsable(t) || byId.has(t.id)) continue
        byId.set(t.id, t)
      }
    } catch {
      /* playlist suivante */
    }
  }
  return [...byId.values()]
}

/** Prefere playlists Deezer Editor dont le titre contient le style. */
function playlistMatchesStyleLabel(
  p: DeezerPlaylistHit,
  styleLabel: string | null | undefined,
): boolean {
  if (!styleLabel?.trim()) return true
  const title = normalizeKey(p.title || '')
  const label = normalizeKey(styleLabel)

  // « Classique » ≠ « tubes classiques » (pop) — exiger musique savante
  if (label.includes('classique') || label === 'classical') {
    if (/\btubes?\s+classiques?\b/.test(title)) return false
    if (/\b(hits?|party|dance|edm|electro)\b/.test(title)) return false
    return /\b(classique|classical|piano|orchestre|opera|symphon|baroque|mozart|bach)\b/.test(
      title,
    )
  }

  const words = label
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3)
  // K-pop : le split donne « pop » seul → matcher kpop / k-pop / korean
  if (label.includes('k-pop') || label.includes('kpop') || label === 'k pop') {
    return /\b(k-?pop|kpop|korean|korea|blackpink|bts|stray kids)\b/.test(title)
  }
  if (words.length === 0) return title.includes(label.replace(/-/g, ''))
  // Exiger le label compact aussi (ex. « hip-hop » → hiphop) pour éviter match trop large
  const compact = label.replace(/[^a-z0-9]+/g, '')
  if (compact.length >= 4 && title.includes(compact)) return true
  return words.every((w) => title.includes(w)) || words.some((w) => title.includes(w) && w.length >= 4)
}

/** Playlists éditoriales / populaires via recherche (complément). */
async function fetchPlaylistHitTracks(
  queries: string[],
  maxTracks = 100,
  styleLabel?: string | null,
): Promise<DeezerTrack[]> {
  const byId = new Map<number, DeezerTrack>()
  for (const q of queries) {
    if (byId.size >= maxTracks) break
    try {
      const search = await deezerGet<DeezerPlaylistSearchResponse>(
        `/search/playlist?q=${encodeURIComponent(q)}&limit=10`,
      )
      let playlists = [...(search.data ?? [])].filter(
        (p) => p.id && (p.nb_tracks ?? 0) >= 15,
      )
      if (styleLabel) {
        const matched = playlists.filter((p) =>
          playlistMatchesStyleLabel(p, styleLabel),
        )
        // Si aucune playlist ne cite le style, on ignore ce query (évite hors-sujet)
        if (matched.length === 0) continue
        playlists = matched
      }
      playlists.sort((a, b) => playlistEditorScore(b) - playlistEditorScore(a))
      playlists = playlists.slice(0, 2)

      for (const pl of playlists) {
        if (byId.size >= maxTracks) break
        try {
          const page = await deezerGet<DeezerTrackListResponse>(
            `/playlist/${pl.id}/tracks?limit=50`,
          )
          for (const t of page.data ?? []) {
            if (!trackUsable(t) || byId.has(t.id)) continue
            byId.set(t.id, t)
          }
        } catch {
          /* playlist suivante */
        }
      }
    } catch {
      /* requête suivante */
    }
  }
  return [...byId.values()]
}

/** Tops des artistes du chart = tubes des artistes que tout le monde écoute. */
async function fetchChartArtistTopTracks(
  genreId: number,
  artistLimit = 15,
  perArtist = 4,
): Promise<DeezerTrack[]> {
  const byId = new Map<number, DeezerTrack>()
  try {
    const artists = await deezerGet<DeezerArtistChartResponse>(
      `/chart/${genreId}/artists?limit=${artistLimit}`,
    )
    for (const a of artists.data ?? []) {
      if (!a.id) continue
      try {
        const top = await deezerGet<DeezerTrackListResponse>(
          `/artist/${a.id}/top?limit=${perArtist}`,
        )
        for (const t of top.data ?? []) {
          if (!trackUsable(t) || byId.has(t.id)) continue
          byId.set(t.id, t)
        }
      } catch {
        /* artiste suivant */
      }
    }
  } catch {
    /* chart artistes indisponible */
  }
  return [...byId.values()]
}

function playlistQueriesForTheme(
  theme: string,
  scope: DeezerScope,
): string[] {
  const parsed = parseDeezerTheme(theme)
  const decade = parsed.decadeId
    ? resolveDecadePeriod(parsed.decadeId)
    : null
  const decadeLabel = decade?.label ?? ''
  const decadeIntl = decade?.queryIntl ?? decadeLabel

  if (parsed.mode === 'custom' && parsed.query) {
    return [
      `${parsed.query} hits`,
      `${parsed.query} best of`,
      parsed.query,
    ]
  }

  if (parsed.mode === 'global') {
    if (scope === 'fr') {
      return decadeLabel
        ? [
            `Essentiels ${decadeLabel}`,
            `Essentiels variété ${decadeLabel}`,
            `tubes ${decadeLabel} variété`,
            `classiques ${decadeLabel}`,
          ]
        : [
            'Essentiels variété française',
            'Essentiels chanson française',
            'Essentiels pop rock français',
            'tubes français classiques',
            '100 tubes variété',
          ]
    }
    return decadeLabel
      ? [
          `essentials ${decadeIntl}`,
          `greatest hits ${decadeIntl}`,
          `classic ${decadeIntl}`,
          'Pop Essentials',
        ]
      : [
          'Pop Essentials',
          '10s Pop',
          'Flashback Party',
          'greatest hits of all time',
          'classic pop hits',
        ]
  }

  const style =
    DEEZER_STYLES.find((s) => s.id === parsed.styleId) ?? DEEZER_STYLES[0]
  const label = style.label
  const intl = style.queryIntl
  // Classique : éviter « classiques » (= tubes pop en FR)
  if (parsed.styleId === 'classique') {
    return [
      'Essentiels musique classique',
      'Classical Essentials',
      'classical piano',
      'musique classique piano',
      intl,
      style.queryFr,
    ]
  }
  // Variété intl + portée FR : tubes internationaux les plus connus / streamés en France
  if (parsed.styleId === 'variete-intl' && scope === 'fr') {
    return decadeLabel
      ? [
          `hits internationaux ${decadeLabel}`,
          `tubes internationaux ${decadeLabel}`,
          `Top France ${decadeLabel}`,
          'Pop Essentials',
        ]
      : [
          'hits internationaux france',
          'tubes internationaux',
          'Top France',
          'Deezer Hits',
          'Pop Essentials',
          '10s Pop',
          'greatest hits',
        ]
  }
  // K-pop : mega-hits connus (pas obscurs)
  if (parsed.styleId === 'kpop') {
    return [
      'K-pop Essentials',
      'Essentiels K-pop',
      'K-pop hits',
      'best of k-pop',
      'BTS BLACKPINK hits',
      intl,
    ]
  }
  if (scope === 'fr') {
    return decadeLabel
      ? [
          `Essentiels ${label} ${decadeLabel}`,
          `${intl} ${decadeIntl}`,
          `tubes ${label} ${decadeLabel}`,
          `best of ${label}`,
        ]
      : [
          `Essentiels ${label}`,
          `${label} essentials`,
          `best of ${label}`,
          `tubes ${label}`,
          intl,
        ]
  }
  return decadeLabel
    ? [`${label} ${decadeIntl} essentials`, `${intl} ${decadeIntl}`, `${label} classic hits`]
    : [`${label} essentials`, `best of ${label}`, intl, `${label} greatest hits`]
}

function addTracks(
  byId: Map<number, DeezerTrack>,
  tracks: DeezerTrack[],
  minRank: number,
  decadeId: string | null = null,
  allowCoverActs = false,
  variant: TrackVariantFilter = 'original',
) {
  for (const t of tracks) {
    if (byId.has(t.id)) continue
    if (!isQualityTrack(t, minRank, allowCoverActs, variant)) continue
    if (isDecadeSpam(t, decadeId)) continue
    byId.set(t.id, t)
  }
}

async function collectTracks(
  theme: string,
  scope: DeezerScope,
  need: number,
  difficulty: DeezerDifficulty,
): Promise<{ tracks: DeezerTrack[]; anchoredArtist: string | null }> {
  const parsed = parseDeezerTheme(theme)
  const queries = buildSearchQueries(theme, scope)
  const decadeMode = Boolean(parsed.decadeId)
  const minRank = minRankForDifficulty(difficulty, decadeMode)
  const searchFloor = searchMinRank(difficulty, decadeMode)
  const variant = variantForDifficulty(difficulty)
  const allowCoverActs = false
  const byId = new Map<number, DeezerTrack>()
  let anchoredArtist: string | null = null

  // Catalogue artiste (originaux) — top uniquement
  if (parsed.mode === 'custom' && parsed.query) {
    try {
      const catalog = await fetchArtistCatalog(parsed.query)
      if (catalog) {
        anchoredArtist = catalog.artistName
        addTracks(
          byId,
          catalog.tracks,
          Math.min(minRank, searchFloor),
          parsed.decadeId,
          allowCoverActs,
          variant,
        )
      }
    } catch {
      /* fallback search */
    }
  }

  // 1) Sources selon le mode (global ≠ style)
  if (!anchoredArtist) {
    if (parsed.mode === 'global') {
      const curatedIds =
        scope === 'fr'
          ? [...CURATED_PLAYLIST_IDS.fr]
          : [...CURATED_PLAYLIST_IDS.international]
      try {
        addTracks(
          byId,
          await fetchTracksFromPlaylistIds(curatedIds, 140),
          CURATED_RANK_FLOOR,
          parsed.decadeId,
          allowCoverActs,
          variant,
        )
      } catch {
        /* playlists ensuite */
      }
      if (byId.size < need * 3 || parsed.decadeId) {
        try {
          addTracks(
            byId,
            await fetchPlaylistHitTracks(
              playlistQueriesForTheme(theme, scope),
              80,
            ),
            CURATED_RANK_FLOOR,
            parsed.decadeId,
            allowCoverActs,
            variant,
          )
        } catch {
          /* charts ensuite */
        }
      }
    } else if (parsed.mode === 'style' && parsed.styleId) {
      // JAMAIS les essentiels variété globaux (sauf style Variété / Pop)
      if (parsed.styleId === 'variete') {
        try {
          addTracks(
            byId,
            await fetchTracksFromPlaylistIds([...CURATED_PLAYLIST_IDS.fr], 140),
            CURATED_RANK_FLOOR,
            parsed.decadeId,
            allowCoverActs,
            variant,
          )
        } catch {
          /* charts ensuite */
        }
      } else if (parsed.styleId === 'pop') {
        try {
          addTracks(
            byId,
            await fetchTracksFromPlaylistIds(
              [...CURATED_PLAYLIST_IDS.international],
              140,
            ),
            CURATED_RANK_FLOOR,
            parsed.decadeId,
            allowCoverActs,
            variant,
          )
        } catch {
          /* charts ensuite */
        }
      } else if (parsed.styleId === 'variete-intl') {
        // Portée FR : hits intl les plus streamés / connus en France
        const ids =
          scope === 'fr'
            ? [...CURATED_PLAYLIST_IDS_INTL_IN_FR]
            : [...CURATED_PLAYLIST_IDS.international]
        const floor =
          scope === 'fr' ? FR_INTL_HITS_FLOOR : CURATED_RANK_FLOOR
        try {
          addTracks(
            byId,
            await fetchTracksFromPlaylistIds(ids, 140),
            floor,
            parsed.decadeId,
            allowCoverActs,
            variant,
          )
        } catch {
          /* charts ensuite */
        }
        if (scope === 'fr') {
          try {
            addTracks(
              byId,
              await fetchChartTracks(100, 132),
              floor,
              parsed.decadeId,
              allowCoverActs,
              variant,
            )
          } catch {
            /* playlists ensuite */
          }
        }
      }

      const styleMeta = DEEZER_STYLES.find((s) => s.id === parsed.styleId)
      const stylePlaylistFloor =
        parsed.styleId === 'variete-intl' && scope === 'fr'
          ? FR_INTL_HITS_FLOOR
          : CURATED_RANK_FLOOR
      // Variété intl : ne pas exiger le mot « variété » dans le titre playlist
      const stylePlaylistLabel =
        parsed.styleId === 'variete-intl'
          ? null
          : (styleMeta?.label ?? parsed.styleId)
      // 1) Playlists Essentiels du style d’abord (plus fiables que le chart)
      try {
        addTracks(
          byId,
          await fetchPlaylistHitTracks(
            playlistQueriesForTheme(theme, scope),
            120,
            stylePlaylistLabel,
          ),
          stylePlaylistFloor,
          parsed.decadeId,
          allowCoverActs,
          variant,
        )
      } catch {
        /* chart ensuite */
      }

      // 2) Chart TRACKS du genre seulement si playlists insuffisantes
      // (/chart/{id}/artists ignoré : top global hors genre)
      const genreId = STYLE_CHART_GENRE[parsed.styleId]
      if (genreId != null && byId.size < Math.max(need, 28)) {
        try {
          addTracks(
            byId,
            await fetchChartTracks(120, genreId),
            CURATED_RANK_FLOOR,
            parsed.decadeId,
            allowCoverActs,
            variant,
          )
        } catch {
          /* search ensuite */
        }
      }
    } else {
      try {
        addTracks(
          byId,
          await fetchPlaylistHitTracks(
            playlistQueriesForTheme(theme, scope),
            80,
          ),
          CURATED_RANK_FLOOR,
          parsed.decadeId,
          allowCoverActs,
          variant,
        )
      } catch {
        /* search ensuite */
      }
    }
  }

  // 2) Complément chart global seulement en mode Hits (global)
  if (!anchoredArtist && parsed.mode === 'global' && byId.size < need * 2) {
    const genreId = scope === 'fr' ? 52 : 132
    try {
      addTracks(
        byId,
        await fetchChartArtistTopTracks(genreId, 12, 4),
        minRank,
        parsed.decadeId,
        allowCoverActs,
        variant,
      )
    } catch {
      /* suivant */
    }
    if (!parsed.decadeId) {
      try {
        addTracks(
          byId,
          await fetchChartTracks(50, genreId),
          searchFloor,
          null,
          allowCoverActs,
          variant,
        )
      } catch {
        /* suivant */
      }
    }
  }

  const curatedEnough =
    !anchoredArtist &&
    (parsed.mode === 'style'
      ? byId.size >= Math.max(need, 24)
      : parsed.mode === 'global'
        ? byId.size >= need * 2
        : byId.size >= need * 3)

  if (anchoredArtist) {
    if (byId.size < need * 4) {
      const artistQueries = [
        `artist:"${anchoredArtist}"`,
        anchoredArtist,
        `${anchoredArtist} hits`,
      ]
      for (const q of artistQueries) {
        if (byId.size >= need * 6) break
        try {
          addTracks(
            byId,
            await fetchTracksForQuery(q, 80),
            Math.min(minRank, Math.floor(searchFloor * 0.5)),
            parsed.decadeId,
            allowCoverActs,
            variant,
          )
        } catch {
          /* suivante */
        }
      }
    }
  } else if (!curatedEnough) {
    for (const q of queries) {
      if (byId.size >= need * 8) break
      try {
        addTracks(
          byId,
          await fetchTracksForQuery(q, 80),
          searchFloor,
          parsed.decadeId,
          allowCoverActs,
          variant,
        )
      } catch {
        /* requête suivante */
      }
    }
  }

  const themeTokens = themeFocusTokens(theme)

  function filterPool(floor: number): DeezerTrack[] {
    let list = [...byId.values()].filter(
      (t) =>
        isQualityTrack(t, floor, allowCoverActs, variant) &&
        !isDecadeSpam(t, parsed.decadeId),
    )

    if (anchoredArtist) {
      const key = normalizeKey(anchoredArtist)
      list = list.filter((t) => normalizeKey(trackArtist(t)) === key)
    } else if (
      parsed.mode === 'custom' &&
      parsed.query &&
      themeTokens.length > 0
    ) {
      const themed = list.filter((t) => trackMatchesTheme(t, themeTokens))
      if (themed.length >= 4) list = themed
    }
    // style : sources déjà bornées au genre — pas de filtre texte « rock » dans le titre

    return list.sort((a, b) => trackFame(b) - trackFame(a))
  }

  const artistMin = anchoredArtist
    ? Math.max(5_000, Math.floor(minRank * 0.15))
    : CURATED_RANK_FLOOR

  let list = filterPool(artistMin)

  if (list.length < need + 4) {
    for (const factor of [0.7, 0.45, 0.25]) {
      const base = anchoredArtist ? artistMin : minRank
      const relaxed = Math.max(
        decadeMode ? 2_000 : anchoredArtist ? 1_500 : CURATED_RANK_FLOOR,
        Math.floor(base * factor),
      )
      list = filterPool(relaxed)
      if (list.length >= need + 4) break
    }
  }

  if (!anchoredArtist && list.length > need * 3) {
    list = list.slice(0, Math.max(need * 3, 40))
  }

  return { tracks: list, anchoredArtist }
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
  const artist = normalizeKey(trackArtist(t))
  const title = normalizeKey(trackTitle(t))
  const album = normalizeKey(t.album?.title || '')
  const sig = tokens.filter((tok) => tok.length >= 3)
  if (sig.length === 0) return true

  // Artiste : tous les tokens du nom (ex. « daft punk »)
  if (sig.every((tok) => artist.includes(tok))) return true

  const phrase = sig.join(' ')
  if (phrase.length >= 4 && artist.includes(phrase)) return true

  // Genre / thème libre : au moins un token significatif (≥4) dans titre/artiste/album
  if (sig.length === 1) {
    const tok = sig[0]!
    return (
      artist.includes(tok) || title.includes(tok) || album.includes(tok)
    )
  }

  // Multi-mots hors artiste exact : majorité des tokens
  const hits = sig.filter(
    (tok) =>
      artist.includes(tok) || title.includes(tok) || album.includes(tok),
  ).length
  return hits >= Math.ceil(sig.length * 0.6)
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
 * Tranches par popularité — toujours le haut du classement.
 * On élargit la tranche pour garder des classiques (rank un peu plus bas)
 * face au viral du moment (rank ~1M).
 */
function orderPoolForDifficulty(
  pool: DeezerTrack[],
  difficulty: DeezerDifficulty,
): DeezerTrack[] {
  const sorted = [...pool].sort((a, b) => trackFame(b) - trackFame(a))
  const n = sorted.length
  if (n <= 14) return shuffle(sorted)

  if (difficulty === 'easy') {
    const end = Math.min(n, Math.max(28, Math.ceil(n * 0.55)))
    return shuffle(sorted.slice(0, end))
  }

  if (difficulty === 'medium') {
    const end = Math.min(n, Math.max(30, Math.ceil(n * 0.65)))
    return shuffle(sorted.slice(0, end))
  }

  // hard : majorité hits connus + un peu plus profond
  const easyEnd = Math.min(n, Math.max(16, Math.ceil(n * 0.4)))
  const midEnd = Math.min(n, Math.max(easyEnd + 10, Math.ceil(n * 0.7)))
  const easyPool = sorted.slice(0, easyEnd)
  const midPool = sorted.slice(Math.floor(easyEnd * 0.35), midEnd)
  const half = Math.max(6, Math.ceil(Math.min(needHint(n), 10) / 2))
  const fromEasy = shuffle(easyPool).slice(0, half)
  const fromMid = shuffle(midPool).slice(0, half)
  const mixed = [...fromEasy, ...fromMid]
  const seen = new Set(mixed.map((t) => t.id))
  for (const t of shuffle(sorted.slice(0, midEnd))) {
    if (mixed.length >= 24) break
    if (seen.has(t.id)) continue
    seen.add(t.id)
    mixed.push(t)
  }
  return shuffle(mixed)
}

function needHint(poolSize: number): number {
  return Math.min(20, Math.max(10, Math.ceil(poolSize * 0.3)))
}

/**
 * Leurres QCM — dédup par appellation (remix/feat ignorés).
 * Facile : libellé « titre — artiste » ; moyen/difficile : titre seul.
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
  const correctTitle = titleDedupeKey(trackTitle(correct))
  const seen = new Set<string>([correctTitle, ...avoidTitles])
  const out: string[] = []

  function tryAdd(t: DeezerTrack): boolean {
    if (t.id === correctId) return false
    const label = answerLabel(t, difficulty)
    const n = titleDedupeKey(trackTitle(t))
    if (!label || !n || seen.has(n)) return false
    seen.add(n)
    out.push(label)
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
    const famousSorted = [...otherArtists].sort(
      (a, b) => trackFame(b) - trackFame(a),
    )
    const topN = Math.max(
      12,
      Math.min(famousSorted.length, Math.ceil(famousSorted.length * 0.55)),
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
    const label = answerLabel(t, difficulty)
    const n = titleDedupeKey(trackTitle(t))
    if (!label || !n || softSeen.has(n)) continue
    softSeen.add(n)
    if (!softOut.includes(label)) softOut.push(label)
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

function freeQuestionPrompts(
  themeLabel: string,
  titleOnly: boolean,
): string[] {
  const focus = themeLabel.trim()
  if (titleOnly) {
    if (!focus) {
      return [
        'Écris le titre du morceau.',
        'Quel est le titre de cet extrait ?',
        'Saisis uniquement le titre.',
      ]
    }
    return [
      `« ${focus} » — quel est le titre ?`,
      `Retrouve le titre de cet extrait (${focus}).`,
      `Saisis le titre du morceau (pas l’artiste).`,
    ]
  }
  if (!focus) {
    return [
      'Écris le titre OU le nom de l’artiste.',
      'Quel titre ou quel artiste entends-tu ?',
      'Saisis le titre ou l’artiste de cet extrait.',
    ]
  }
  return [
    `« ${focus} » — écris le titre OU l’artiste.`,
    `Retrouve le titre ou l’artiste (${focus}).`,
    `Saisis le titre ou le nom de l’artiste pour « ${focus} ».`,
  ]
}

/** Réponses libres acceptées. titleOnly = quiz artiste (le nom d’artiste ne compte pas). */
function buildAcceptedAnswers(
  title: string,
  artist: string,
  titleOnly: boolean,
): string[] {
  const out = new Set<string>()
  const raws = titleOnly ? [title] : [title, artist]
  for (const raw of raws) {
    const t = raw.trim()
    if (!t) continue
    out.add(t)
    out.add(titleDedupeKey(t))
    out.add(normalizeKey(t))
  }
  if (!titleOnly) {
    const an = normalizeKey(artist)
    if (an.startsWith('the ')) out.add(an.slice(4))
  }
  return [...out].filter((s) => s.length >= 2)
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
  /** Quiz généré sur un artiste précis → saisie = titre seul */
  artistLocked = false,
): DeezerQuizQuestion | null {
  const artist = trackArtist(track)
  const title = trackTitle(track)
  const preview = String(track.preview ?? '').trim()
  if (!preview || !artist || !title) return null

  const revealAnswer = `${title} — ${artist}`
  const explanation = `L’extrait correspond à « ${title} » de ${artist} (thème : ${themeLabel || 'Deezer'}).`

  // Difficile : réponse libre
  if (difficulty === 'hard') {
    const titleOnly = artistLocked
    const prompts = freeQuestionPrompts(themeLabel, titleOnly)
    const prompt = prompts[promptIndex % prompts.length]
    return {
      id: newId(),
      question: `Extrait ${promptIndex + 1} — ${prompt}`,
      answers: [title, artist, title, artist],
      correctIndex: 0,
      difficulty,
      themeSlug,
      createdAt: now,
      batchId,
      explanation,
      sourceType: 'Deezer (extrait officiel)',
      previewUrl: preview,
      coverUrl: track.album?.cover_medium || undefined,
      deezerTrackId: String(track.id),
      revealAnswer,
      answerMode: 'free',
      acceptedAnswers: buildAcceptedAnswers(title, artist, titleOnly),
      freeInputHint: titleOnly ? 'title' : 'title_or_artist',
    }
  }

  const correct = answerLabel(track, difficulty)
  if (!correct) return null

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
    question: `Extrait ${promptIndex + 1} — ${prompts[promptIndex % prompts.length]}`,
    answers,
    correctIndex,
    difficulty,
    themeSlug,
    createdAt: now,
    batchId,
    explanation,
    sourceType: 'Deezer (extrait officiel)',
    previewUrl: preview,
    coverUrl: track.album?.cover_medium || undefined,
    deezerTrackId: String(track.id),
    revealAnswer,
    answerMode: 'qcm',
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

  function isExcludedQuestion(
    q: Pick<DeezerQuizQuestion, 'question' | 'answers' | 'correctIndex' | 'deezerTrackId' | 'revealAnswer'>,
  ): boolean {
    const ans = q.answers[q.correctIndex] ?? ''
    const fp = normalizeKey(`${q.question}|${ans}`)
    if (excluded.has(fp)) return true
    const rich = normalizeKey(
      `${q.question}|${ans}|${q.deezerTrackId ?? q.revealAnswer ?? ''}`,
    )
    if (excluded.has(rich)) return true
    if (q.deezerTrackId && excluded.has(normalizeKey(q.deezerTrackId))) {
      return true
    }
    return false
  }

  let pool: DeezerTrack[]
  let anchoredArtist: string | null = null
  try {
    const collected = await collectTracks(
      input.theme,
      input.scope,
      count + 60,
      input.difficulty,
    )
    pool = collected.tracks
    anchoredArtist = collected.anchoredArtist
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
        anchoredArtist
          ? `Pas assez de titres de « ${anchoredArtist} » pour ce niveau. Essaie un autre artiste.`
          : input.difficulty === 'hard'
            ? 'Pas assez de titres pour ce thème en mode difficile. Essaie un artiste ou un style plus large.'
            : 'Pas assez de tubes connus pour ce thème. Essaie Hits (global), un autre style, ou élargis la décennie.',
    }
  }

  // Vivier large pour les leurres ; sous-ensemble pour les bonnes réponses
  const distractorPool = [...pool]
  const answerPool = orderPoolForDifficulty(pool, input.difficulty)
  const artistLocked = Boolean(anchoredArtist)

  const batchId = newId()
  const now = new Date().toISOString()
  const questions: DeezerQuizQuestion[] = []
  const usedTrackIds = new Set<number>()
  const usedTitles = new Set<string>()
  const usedWrongTitles = new Set<string>()
  const parsed = parseDeezerTheme(input.theme)
  const themeLabel = artistLocked
    ? anchoredArtist || parsed.focusLabel || 'Deezer'
    : parsed.focusLabel || 'Deezer'

  const DIFF_FR = { easy: 'facile', medium: 'moyen', hard: 'difficile' } as const

  function tryAddFrom(
    candidates: DeezerTrack[],
    opts: { preferUniqueWrongs: boolean; allowWrongAsCorrect: boolean },
  ) {
    for (const track of shuffle(candidates)) {
      if (questions.length >= count) return
      if (usedTrackIds.has(track.id)) continue
      const titleKey = titleDedupeKey(trackTitle(track))
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
        artistLocked,
      )
      if (!q) continue
      if (isExcludedQuestion(q)) continue
      const fingerprint = normalizeKey(
        `${q.question}|${q.answers[q.correctIndex]}`,
      )
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
        usedWrongTitles.add(titleDedupeKey(q.answers[i]))
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
