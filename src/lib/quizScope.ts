import type { QuizScope } from '../types'
import { normalizeThemeSlug } from './themeSlug'

/**
 * Thèmes pour lesquels la portée « Français » a un sens géo/culturel.
 * Les autres → forcer International (pas d’ancrage FR fictif).
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

export type FrScopeThemeId = (typeof FR_SCOPE_THEME_IDS)[number]

function parentThemeSlug(theme: string): string {
  const head = theme.split(/\s*[—\-–|]\s*/)[0]?.trim() || theme
  return normalizeThemeSlug(head)
}

/** True si le thème (ou son parent catalogue) accepte la portée FR. */
export function themeSupportsFrScope(theme: string): boolean {
  const slug = parentThemeSlug(theme)
  if (!slug) return false
  return (FR_SCOPE_THEME_IDS as readonly string[]).some(
    (id) => slug === id || slug.startsWith(`${id}-`),
  )
}

/** Si FR demandé sur un thème non ancré → International. */
export function resolveQuizScope(
  theme: string,
  scope: QuizScope,
): QuizScope {
  if (scope !== 'fr') return scope
  const head = parentThemeSlug(theme)
  if (head === 'aleatoire' || head === 'random') return 'fr'
  if (themeSupportsFrScope(theme)) return 'fr'
  return 'international'
}
