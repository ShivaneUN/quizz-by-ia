/**
 * Métadonnées thème Langues — écritures spéciales = native + transcription.
 * (côté client ; miroir logique côté server/generate)
 */

export const LANGUES_LATIN_SUBS = [
  'Anglais',
  'Espagnol',
  'Allemand',
  'Italien',
  'Portugais',
  'Français',
  'Néerlandais',
  'Turc',
  'Polonais',
  'Suédois',
  'Vietnamien',
] as const

/** Sous-thèmes à écriture non latine → format « native (transcription) ». */
export const LANGUES_SPECIAL_SCRIPT = [
  { sub: 'Arabe', example: 'مرحبا (marhaba)' },
  { sub: 'Japonais', example: 'こんにちは (konnichiwa)' },
  { sub: 'Coréen', example: '안녕하세요 (annyeonghaseyo)' },
  { sub: 'Chinois', example: '你好 (nihao)' },
  { sub: 'Russe', example: 'привет (privet)' },
  { sub: 'Grec', example: 'γεια (geia)' },
  { sub: 'Hébreu', example: 'שלום (shalom)' },
  { sub: 'Hindi', example: 'नमस्ते (namaste)' },
  { sub: 'Cambodgien', example: 'សួស្តី (suostei)' },
] as const

export function isLanguesSpecialScriptSub(sub: string): boolean {
  const n = sub.trim().toLowerCase()
  return LANGUES_SPECIAL_SCRIPT.some((x) => x.sub.toLowerCase() === n)
}
