import type { QuizContentMode, QuizScope } from '../types'

/**
 * Normalise un thème en slug stable pour éviter les doublons
 * ("Cambodge" / "cambodge " / "CAMBODGE" → "cambodge").
 */
export function normalizeThemeSlug(theme: string): string {
  return theme
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Slug banque = thème + portée (+ mode image si besoin) */
export function bankSlug(
  theme: string,
  scope: QuizScope,
  quizMode: QuizContentMode = 'standard',
): string {
  const base = normalizeThemeSlug(theme)
  if (!base) return ''
  return quizMode === 'image'
    ? `${base}--${scope}--image`
    : quizMode === 'audio'
      ? `${base}--${scope}--audio`
      : `${base}--${scope}`
}

/** Actualité : jamais en banque (régénération à chaque manche) */
export function isEphemeralTheme(theme: string, themeSlug: string): boolean {
  const hay = `${theme} ${themeSlug}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return hay.includes('actualite')
}
