import type { Difficulty, Question } from '../types/index.js'
import { shuffle } from './shuffle.js'

export type FlagDifficulty = 'easy' | 'medium' | 'hard' | 'expert'

export type FlagCountry = {
  code: string
  nom: string
  fichier: string
  tier: 1 | 2 | 3
}

export const FLAG_DIFFICULTIES: FlagDifficulty[] = [
  'easy',
  'medium',
  'hard',
  'expert',
]

export const FLAG_DIFFICULTY_LABELS: Record<FlagDifficulty, string> = {
  easy: 'Facile',
  medium: 'Moyen',
  hard: 'Difficile',
  expert: 'Hard',
}

/** Nombre de choix de réponse (4 / 8 / 10 / 10). */
export const FLAG_CHOICE_COUNT: Record<FlagDifficulty, number> = {
  easy: 4,
  medium: 8,
  hard: 10,
  expert: 10,
}

/** Max de drapeaux sélectionnables (20 / 60 / 100 / 196). */
export const FLAG_MAX_COUNT: Record<FlagDifficulty, number> = {
  easy: 20,
  medium: 60,
  hard: 100,
  expert: 196,
}

/** Pool : Facile = tier 1 ; Moyen = ≤2 ; Difficile/Hard = ≤3. */
export const FLAG_MAX_TIER: Record<FlagDifficulty, 1 | 2 | 3> = {
  easy: 1,
  medium: 2,
  hard: 3,
  expert: 3,
}

export const FLAG_QUESTION_TEXT = 'De quel pays est ce drapeau ?'

export function isFlagTheme(theme?: string | null): boolean {
  if (!theme?.trim()) return false
  const n = theme
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  const head = n.split(/\s*[—\-–|]\s*/)[0]?.trim() ?? n
  return head === 'drapeaux' || head === 'drapeaux du monde'
}

export function parseFlagDifficulty(raw: unknown): FlagDifficulty {
  if (raw === 'medium' || raw === 'hard' || raw === 'expert') return raw
  return 'easy'
}

export function flagDifficultyToQuestionDifficulty(
  d: FlagDifficulty,
): Difficulty {
  return d === 'easy' || d === 'medium' ? d : 'hard'
}

export function flagImageUrl(fichier: string): string {
  const rel = String(fichier ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  return `/drapeaux/${rel}`
}

export function flagPool(countries: FlagCountry[], d: FlagDifficulty): FlagCountry[] {
  const maxTier = FLAG_MAX_TIER[d]
  return countries.filter((c) => c.tier >= 1 && c.tier <= maxTier)
}

/** Paliers de 10 jusqu’au max ; Hard ajoute 196. */
export function flagCountSteps(d: FlagDifficulty): number[] {
  const max = FLAG_MAX_COUNT[d]
  const steps: number[] = []
  for (let n = 10; n <= max; n += 10) steps.push(n)
  if (d === 'expert' && steps[steps.length - 1] !== 196) steps.push(196)
  return steps
}

export function clampFlagCount(d: FlagDifficulty, count: number): number {
  const steps = flagCountSteps(d)
  const n = Math.round(Number(count) || 10)
  return steps.reduce((best, s) =>
    Math.abs(s - n) < Math.abs(best - n) ? s : best,
  )
}

export type FlagQuizOptions = {
  difficulty: FlagDifficulty
  count: number
  themeSlug: string
}

/**
 * Génère N questions distinctes (100 % local, pas d’IA).
 * Leurres piochés dans le même pool, sans doublon.
 */
export function generateFlagQuiz(
  countries: FlagCountry[],
  opts: FlagQuizOptions,
): Question[] {
  const difficulty = parseFlagDifficulty(opts.difficulty)
  const pool = flagPool(countries, difficulty)
  const k = FLAG_CHOICE_COUNT[difficulty]
  const n = Math.min(clampFlagCount(difficulty, opts.count), pool.length)
  if (n < 1 || pool.length < k) return []

  const targets = shuffle(pool).slice(0, n)
  const now = new Date().toISOString()
  const batchId = `flags-${Date.now()}`
  const qDiff = flagDifficultyToQuestionDifficulty(difficulty)

  return targets.map((country, i) => {
    const decoyPool = shuffle(pool.filter((c) => c.code !== country.code))
    const decoys = decoyPool.slice(0, k - 1).map((c) => c.nom)
    const answers = shuffle([country.nom, ...decoys])
    const correctIndex = answers.indexOf(country.nom)
    return {
      id: `flag-${country.code.toLowerCase()}-${i}`,
      question: FLAG_QUESTION_TEXT,
      answers,
      correctIndex,
      difficulty: qDiff,
      themeSlug: opts.themeSlug,
      createdAt: now,
      batchId,
      explanation: `C’est le drapeau de ${country.nom}.`,
      sourceType: 'local',
      imageUrl: flagImageUrl(country.fichier),
      revealAnswer: country.nom,
    }
  })
}

export async function loadFlagCountriesFromPublic(): Promise<FlagCountry[]> {
  const res = await fetch('/drapeaux/drapeaux.json')
  if (!res.ok) {
    throw new Error('Impossible de charger drapeaux.json')
  }
  const data: unknown = await res.json()
  if (!Array.isArray(data)) throw new Error('drapeaux.json invalide')
  return data.filter(isFlagCountry)
}

function isFlagCountry(raw: unknown): raw is FlagCountry {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  const tier = o.tier
  return (
    typeof o.code === 'string' &&
    typeof o.nom === 'string' &&
    typeof o.fichier === 'string' &&
    (tier === 1 || tier === 2 || tier === 3)
  )
}
