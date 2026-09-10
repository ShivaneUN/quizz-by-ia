/**
 * Helpers client pour le thème Aléatoire (mix multi-thèmes côté serveur).
 * Le tirage réel des couples thème/sous-thème se fait dans server/randomThemeMix.ts.
 */

export function isAleatoireTheme(theme?: string | null): boolean {
  if (!theme?.trim()) return false
  const n = theme
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  const head = n.split(/\s*[—\-–|]\s*/)[0]?.trim() ?? n
  return head === 'aleatoire' || head === 'random'
}
