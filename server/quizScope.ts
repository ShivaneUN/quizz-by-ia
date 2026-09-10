/**
 * Thèmes pour lesquels la portée « Français » a un sens géo/culturel.
 * Les autres → forcer International (aligné avec src/lib/quizScope.ts).
 */
export const FR_SCOPE_THEME_IDS = [
  'histoire',
  'cinema',
  'musique',
  'litterature',
  'actualite',
  'cuisine',
  'sport',
  'art',
  'geographie',
] as const

function normalizeThemeSlug(theme: string): string {
  return theme
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parentThemeSlug(theme: string): string {
  const head = theme.split(/\s*[—\-–|]\s*/)[0]?.trim() || theme
  return normalizeThemeSlug(head)
}

export function themeSupportsFrScope(theme: string): boolean {
  const slug = parentThemeSlug(theme)
  if (!slug) return false
  return (FR_SCOPE_THEME_IDS as readonly string[]).some(
    (id) => slug === id || slug.startsWith(`${id}-`),
  )
}

export function resolveQuizScope(
  theme: string,
  scope: 'fr' | 'international',
): 'fr' | 'international' {
  if (scope !== 'fr') return scope
  // Aléatoire : la portée choisie filtre le vivier (FR = thèmes FR only)
  const head = parentThemeSlug(theme)
  if (head === 'aleatoire' || head === 'random') return 'fr'
  if (themeSupportsFrScope(theme)) return 'fr'
  return 'international'
}
