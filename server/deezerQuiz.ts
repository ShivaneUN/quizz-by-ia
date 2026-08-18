/**
 * Quiz musical via API publique Deezer (pas de clé requise).
 * https://api.deezer.com
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
    queryFr: 'variété française',
    queryIntl: 'french pop',
  },
]

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
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  })
  if (!res.ok) {
    throw new Error(`Deezer ${res.status}`)
  }
  return (await res.json()) as T
}

function trackUsable(t: DeezerTrack): boolean {
  const preview = String(t.preview ?? '').trim()
  const artist = String(t.artist?.name ?? '').trim()
  const title = String(t.title_short || t.title || '').trim()
  return Boolean(preview && artist && title && preview.startsWith('http'))
}

/** Extrait le focus depuis "Deezer — Pop" / texte libre */
export function parseDeezerTheme(theme: string): {
  styleId: string | null
  query: string
} {
  const raw = theme.trim()
  const afterDash = raw.includes('—')
    ? raw.split('—').slice(1).join('—').trim()
    : raw.replace(/^deezer\s*/i, '').replace(/^musique\s*/i, '').trim()
  const focus = afterDash || raw
  const style = DEEZER_STYLES.find(
    (s) =>
      normalizeKey(s.label) === normalizeKey(focus) ||
      s.id === normalizeKey(focus),
  )
  if (style) return { styleId: style.id, query: '' }
  return { styleId: null, query: focus }
}

function buildSearchQueries(theme: string, scope: DeezerScope): string[] {
  const { styleId, query } = parseDeezerTheme(theme)
  if (query) {
    const base = query
    return scope === 'fr'
      ? [base, `${base} français`, `${base} france`]
      : [base, `${base} hits`, base]
  }
  const style = DEEZER_STYLES.find((s) => s.id === styleId) ?? DEEZER_STYLES[0]
  const primary = scope === 'fr' ? style.queryFr : style.queryIntl
  return [primary, style.queryIntl, style.label]
}

async function fetchTracksForQuery(
  q: string,
  limit = 40,
): Promise<DeezerTrack[]> {
  const data = await deezerGet<DeezerSearchResponse>(
    `/search/track?q=${encodeURIComponent(q)}&limit=${limit}`,
  )
  if (data.error?.message) throw new Error(data.error.message)
  return (data.data ?? []).filter(trackUsable)
}

async function collectTracks(
  theme: string,
  scope: DeezerScope,
  need: number,
): Promise<DeezerTrack[]> {
  const queries = buildSearchQueries(theme, scope)
  const byId = new Map<number, DeezerTrack>()
  for (const q of queries) {
    if (byId.size >= need * 4) break
    try {
      const tracks = await fetchTracksForQuery(q, 50)
      for (const t of tracks) {
        if (!byId.has(t.id)) byId.set(t.id, t)
      }
    } catch {
      /* requête suivante */
    }
  }
  // Pas de chart global : ça pollue le thème avec des titres hors sujet
  // Filtre métadonnées seulement pour recherche libre (artiste / année…),
  // pas pour les styles prédéfinis (Pop, Rock…) déjà ciblés par la requête.
  const { styleId, query } = parseDeezerTheme(theme)
  let list = [...byId.values()]
  if (!styleId && query) {
    const themeTokens = themeFocusTokens(theme)
    if (themeTokens.length > 0) {
      const themed = list.filter((t) => trackMatchesTheme(t, themeTokens))
      if (themed.length >= need) list = themed
    }
  }
  return shuffle(list)
}

function themeFocusTokens(theme: string): string[] {
  const { styleId, query } = parseDeezerTheme(theme)
  const raw = query || (styleId
    ? (DEEZER_STYLES.find((s) => s.id === styleId)?.label ?? '')
    : '')
  return normalizeKey(raw)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !['deezer', 'musique', 'the', 'and'].includes(t))
}

function trackMatchesTheme(t: DeezerTrack, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const hay = normalizeKey(
    [
      t.title_short || t.title || '',
      t.artist?.name || '',
      t.album?.title || '',
    ].join(' '),
  )
  // Au moins un jeton du thème dans métadonnées, ou on garde si tokens = style générique court
  return tokens.some((tok) => hay.includes(tok))
}

function trackLabel(t: DeezerTrack): string {
  const title = String(t.title_short || t.title || '').trim()
  const artist = String(t.artist?.name ?? '').trim()
  if (!title) return ''
  return artist ? `${title} — ${artist}` : title
}

/** Popularité Deezer (rank) — plus haut = plus connu */
function trackFame(t: DeezerTrack): number {
  return typeof t.rank === 'number' && Number.isFinite(t.rank) && t.rank > 0
    ? t.rank
    : 0
}

/**
 * Facile → titres les plus populaires d’abord
 * Moyen → mélange
 * Difficile → titres moins connus
 */
function orderPoolForDifficulty(
  pool: DeezerTrack[],
  difficulty: DeezerDifficulty,
): DeezerTrack[] {
  const sorted = [...pool].sort((a, b) => trackFame(b) - trackFame(a))
  if (sorted.length <= 8) return shuffle(sorted)

  if (difficulty === 'easy') {
    const top = sorted.slice(0, Math.max(10, Math.ceil(sorted.length * 0.5)))
    return shuffle(top)
  }

  if (difficulty === 'hard') {
    const start = Math.floor(sorted.length * 0.35)
    const obscure = sorted.slice(start)
    return shuffle(obscure.length >= 8 ? obscure : sorted)
  }

  // medium : tout le pool, mélangé
  return shuffle(sorted)
}

/**
 * Leurres selon le niveau :
 * - facile : autres artistes (plus séparés)
 * - moyen : mix du thème
 * - difficile : même artiste en priorité (proche du son)
 */
function pickWrongLabels(
  pool: DeezerTrack[],
  correct: DeezerTrack,
  count: number,
  difficulty: DeezerDifficulty,
): string[] {
  const correctId = correct.id
  const correctArtist = normalizeKey(String(correct.artist?.name ?? ''))
  const correctLabel = normalizeKey(trackLabel(correct))
  const correctTitle = normalizeKey(
    String(correct.title_short || correct.title || ''),
  )
  const seen = new Set<string>([correctLabel, correctTitle])
  const out: string[] = []

  function tryAdd(t: DeezerTrack): boolean {
    if (t.id === correctId) return false
    const label = trackLabel(t)
    const n = normalizeKey(label)
    const titleOnly = normalizeKey(String(t.title_short || t.title || ''))
    if (!label || seen.has(n) || seen.has(titleOnly)) return false
    seen.add(n)
    seen.add(titleOnly)
    out.push(label)
    return out.length >= count
  }

  const sameArtist = shuffle(
    pool.filter(
      (t) =>
        t.id !== correctId &&
        correctArtist &&
        normalizeKey(String(t.artist?.name ?? '')) === correctArtist,
    ),
  )
  const otherArtists = shuffle(
    pool.filter(
      (t) =>
        t.id !== correctId &&
        normalizeKey(String(t.artist?.name ?? '')) !== correctArtist,
    ),
  )

  if (difficulty === 'hard') {
    for (const t of sameArtist) {
      if (tryAdd(t)) return out
    }
    for (const t of otherArtists) {
      if (tryAdd(t)) return out
    }
  } else if (difficulty === 'easy') {
    // Autres artistes d’abord (idéalement populaires)
    const famousOthers = [...otherArtists].sort(
      (a, b) => trackFame(b) - trackFame(a),
    )
    for (const t of famousOthers) {
      if (tryAdd(t)) return out
    }
    for (const t of sameArtist) {
      if (tryAdd(t)) return out
    }
  } else {
    // moyen : d’abord autres artistes, puis même artiste
    for (const t of otherArtists) {
      if (tryAdd(t)) return out
    }
    for (const t of sameArtist) {
      if (tryAdd(t)) return out
    }
  }

  for (const t of shuffle(pool)) {
    if (tryAdd(t)) return out
  }
  return out
}

function themeQuestionPrompts(themeLabel: string): string[] {
  const focus = themeLabel.trim()
  if (!focus) {
    return [
      'Quel morceau entends-tu ?',
      'Quel est le titre de cet extrait ?',
      'Retrouve le titre de ce titre.',
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
): DeezerQuizQuestion | null {
  const artist = String(track.artist?.name ?? '').trim()
  const title = String(track.title_short || track.title || '').trim()
  const preview = String(track.preview ?? '').trim()
  const correct = trackLabel(track)
  if (!preview || !artist || !title || !correct) return null

  const wrongs = pickWrongLabels(pool, track, 3, difficulty)
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
    // Plus de candidats pour pouvoir trier par popularité selon le niveau
    pool = await collectTracks(input.theme, input.scope, count + 40)
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
        'Pas assez de titres avec extrait pour ce thème Deezer. Essaie un autre style ou une autre recherche.',
    }
  }

  pool = orderPoolForDifficulty(pool, input.difficulty)

  const batchId = newId()
  const now = new Date().toISOString()
  const questions: DeezerQuizQuestion[] = []
  const usedTrackIds = new Set<number>()
  const usedTitles = new Set<string>()
  const { styleId, query } = parseDeezerTheme(input.theme)
  const themeLabel =
    query ||
    DEEZER_STYLES.find((s) => s.id === styleId)?.label ||
    input.theme.replace(/^deezer\s*—\s*/i, '').trim() ||
    'Deezer'

  const DIFF_FR = { easy: 'facile', medium: 'moyen', hard: 'difficile' } as const

  for (const track of pool) {
    if (questions.length >= count) break
    if (usedTrackIds.has(track.id)) continue
    const titleKey = normalizeKey(
      String(track.title_short || track.title || ''),
    )
    if (!titleKey || usedTitles.has(titleKey)) continue
    const q = makeTitleQuestion(
      track,
      pool,
      input.difficulty,
      input.themeSlug,
      batchId,
      now,
      questions.length,
      themeLabel,
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
    questions.push(q)
  }

  if (questions.length < count) {
    return {
      error: `Seulement ${questions.length}/${count} questions musicales générées. Élargis le thème ou change de style.`,
    }
  }

  return {
    questions: questions.slice(0, count),
    message: `Quiz musical Deezer — ${input.theme} (${DIFF_FR[input.difficulty]})`,
  }
}
