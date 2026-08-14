/** Mots courts — tirage local, zéro IA */
export const TYPING_DUEL_WORDS = [
  'QUIZ',
  'OR',
  'FEU',
  'AIR',
  'EAU',
  'RIO',
  'LUNE',
  'MARS',
  'CODE',
  'JEUX',
  'FILM',
  'STAR',
  'GOAL',
  'ROCK',
  'JAZZ',
  'BYTE',
  'PIXEL',
  'NINJA',
  'LASER',
  'COMBO',
  'FLASH',
  'SUPER',
  'RAPIDE',
  'FUSION',
  'PLANETE',
  'ETOILE',
  'VITESSE',
  'CHRONO',
  'VICTOIRE',
  'RECORDS',
  'PARIS',
  'LYON',
  'NICE',
  'MARIO',
  'ZELDA',
  'TITAN',
  'NEON',
  'BLAZE',
  'STORM',
  'WAVE',
] as const

export function pickTypingWord(exclude?: string): string {
  const pool = TYPING_DUEL_WORDS.filter((w) => w !== exclude)
  const list = pool.length > 0 ? pool : [...TYPING_DUEL_WORDS]
  return list[Math.floor(Math.random() * list.length)]!
}
