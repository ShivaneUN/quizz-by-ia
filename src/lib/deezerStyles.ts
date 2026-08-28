/** Styles / décennies Deezer affichés dans ThemeSelect (miroir serveur) */

export const DEEZER_STYLE_OPTIONS: { id: string; label: string }[] = [
  { id: 'pop', label: 'Pop' },
  { id: 'rock', label: 'Rock' },
  { id: 'rap', label: 'Rap / Hip-hop' },
  { id: 'electro', label: 'Électro' },
  { id: 'house', label: 'House' },
  { id: 'techno', label: 'Techno' },
  { id: 'trance', label: 'Trance' },
  { id: 'disco', label: 'Disco' },
  { id: 'funk', label: 'Funk' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'blues', label: 'Blues' },
  { id: 'gospel', label: 'Gospel' },
  { id: 'classique', label: 'Classique' },
  { id: 'rnb', label: 'R&B / Soul' },
  { id: 'metal', label: 'Metal' },
  { id: 'punk', label: 'Punk' },
  { id: 'indie', label: 'Indie' },
  { id: 'reggae', label: 'Reggae' },
  { id: 'country', label: 'Country' },
  { id: 'folk', label: 'Folk' },
  { id: 'latine', label: 'Latine' },
  { id: 'afrobeats', label: 'Afrobeats' },
  { id: 'amapiano', label: 'Amapiano' },
  { id: 'kpop', label: 'K-pop' },
  { id: 'variete', label: 'Variété FR' },
  { id: 'variete-intl', label: 'Variété internationale' },
  { id: 'ost', label: 'Bandes originales' },
  { id: 'comedie-musicale', label: 'Comédies musicales' },
]

export const DEEZER_GLOBAL_OPTION = {
  id: 'hits',
  label: 'Hits (global)',
} as const

/**
 * Compatibilité style ↔ portée.
 * - fr : pertinent pour francophones
 * - international : corpus surtout monde / anglophone
 * - both : les deux
 */
export type DeezerStyleScopeFit = 'fr' | 'international' | 'both'

/** Styles surtout mondiaux : en 🇫🇷 → grisés, clic = bascule 🌍 */
export const DEEZER_STYLES_INTL_LEANING = new Set([
  'country',
  'gospel',
  'blues',
  'amapiano',
  'afrobeats',
  'latine',
])

/** Styles surtout FR : en 🌍 → grisés, clic = bascule 🇫🇷 */
export const DEEZER_STYLES_FR_ONLY = new Set([
  'variete',
  'comedie-musicale',
])

export function deezerStyleScopeFit(styleId: string): DeezerStyleScopeFit {
  if (DEEZER_STYLES_FR_ONLY.has(styleId)) return 'fr'
  if (DEEZER_STYLES_INTL_LEANING.has(styleId)) return 'international'
  return 'both'
}

export function isDeezerStyleNativeToScope(
  styleId: string,
  scope: 'fr' | 'international',
): boolean {
  const fit = deezerStyleScopeFit(styleId)
  return fit === 'both' || fit === scope
}

export function scopeForDeezerStyle(
  styleId: string,
  current: 'fr' | 'international',
): 'fr' | 'international' {
  const fit = deezerStyleScopeFit(styleId)
  if (fit === 'both') return current
  return fit
}

export function deezerStyleScopeHint(
  styleId: string,
  scope: 'fr' | 'international',
): string | null {
  if (isDeezerStyleNativeToScope(styleId, scope)) return null
  if (deezerStyleScopeFit(styleId) === 'international') {
    return 'Plutôt international — bascule en 🌍'
  }
  return 'Plutôt francophone — bascule en 🇫🇷'
}

/** Préférence lecture auto Deezer (solo / multi, par navigateur). */
const DEEZER_AUTOPLAY_KEY = 'quizz:deezer-autoplay'

export function readDeezerAutoplayPreference(fallback = true): boolean {
  try {
    const v = localStorage.getItem(DEEZER_AUTOPLAY_KEY)
    if (v === '0' || v === 'false') return false
    if (v === '1' || v === 'true') return true
  } catch {
    /* private mode */
  }
  return fallback
}

export function writeDeezerAutoplayPreference(on: boolean): void {
  try {
    localStorage.setItem(DEEZER_AUTOPLAY_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Périodes / décennies */
export function getDeezerDecadeOptions(): { id: string; label: string }[] {
  return [
    { id: 'all', label: 'Toutes' },
    { id: '80', label: 'Années 80' },
    { id: '90', label: 'Années 90' },
    { id: '2000', label: 'Années 2000' },
    { id: '2010', label: 'Années 2010' },
    { id: '2020', label: 'Années 2020' },
  ]
}

export const DEEZER_DECADE_OPTIONS: { id: string; label: string }[] =
  getDeezerDecadeOptions()

export type DeezerPoolMode = 'global' | 'style'

export function formatDeezerTheme(input: {
  mode: DeezerPoolMode
  styleLabel?: string
  decadeId?: string
  custom?: string
}): string {
  const custom = input.custom?.trim()
  if (custom) return `Deezer — ${custom}`

  const decades = getDeezerDecadeOptions()
  const decade =
    decades.find((d) => d.id === input.decadeId && d.id !== 'all')?.label ?? ''

  const styleLabel =
    input.styleLabel?.trim() || DEEZER_STYLE_OPTIONS[0]?.label || 'Pop'

  const base =
    input.mode === 'global'
      ? DEEZER_GLOBAL_OPTION.label
      : `Hits ${styleLabel}`

  return decade ? `Deezer — ${base} · ${decade}` : `Deezer — ${base}`
}
