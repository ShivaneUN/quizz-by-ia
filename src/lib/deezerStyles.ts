/** Styles Deezer affichés dans ThemeSelect (miroir serveur) */
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

export function formatDeezerTheme(styleLabelOrCustom: string): string {
  const t = styleLabelOrCustom.trim()
  if (!t) return ''
  return `Deezer — ${t}`
}
