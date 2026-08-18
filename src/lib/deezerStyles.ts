/** Styles / décennies Deezer affichés dans ThemeSelect (miroir serveur) */

export const DEEZER_STYLE_OPTIONS: { id: string; label: string }[] = [
  { id: 'pop', label: 'Pop' },
  { id: 'rock', label: 'Rock' },
  { id: 'rap', label: 'Rap / Hip-hop' },
  { id: 'electro', label: 'Électro' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'classique', label: 'Classique' },
  { id: 'rnb', label: 'R&B / Soul' },
  { id: 'metal', label: 'Metal' },
  { id: 'reggae', label: 'Reggae' },
  { id: 'latine', label: 'Latine' },
  { id: 'kpop', label: 'K-pop' },
  { id: 'variete', label: 'Variété FR' },
]

export const DEEZER_GLOBAL_OPTION = {
  id: 'hits',
  label: 'Hits (global)',
} as const

export const DEEZER_DECADE_OPTIONS: { id: string; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: '80', label: 'Années 80' },
  { id: '90', label: 'Années 90' },
  { id: '2000', label: 'Années 2000' },
  { id: '2010', label: 'Années 2010' },
  { id: '2020', label: 'Années 2020' },
]

export type DeezerPoolMode = 'global' | 'style'

export function formatDeezerTheme(input: {
  mode: DeezerPoolMode
  styleLabel?: string
  decadeId?: string
  custom?: string
}): string {
  const custom = input.custom?.trim()
  if (custom) return `Deezer — ${custom}`

  const decade =
    DEEZER_DECADE_OPTIONS.find((d) => d.id === input.decadeId && d.id !== 'all')
      ?.label ?? ''

  const base =
    input.mode === 'global'
      ? DEEZER_GLOBAL_OPTION.label
      : (input.styleLabel?.trim() || DEEZER_STYLE_OPTIONS[0]?.label || 'Pop')

  return decade ? `Deezer — ${base} · ${decade}` : `Deezer — ${base}`
}
