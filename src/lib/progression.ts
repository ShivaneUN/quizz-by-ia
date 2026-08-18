import type { Difficulty, TierAttempt } from '../types'
import { DIFFICULTIES, PASS_THRESHOLD, QUESTIONS_PER_TIER } from '../types'

export function createEmptyTierAttempts(): Record<Difficulty, TierAttempt> {
  return {
    easy: { correct: 0, answered: 0, status: 'active' },
    medium: { correct: 0, answered: 0, status: 'locked' },
    hard: { correct: 0, answered: 0, status: 'locked' },
  }
}

/**
 * Après les 10 questions du palier :
 * - ≥ PASS_THRESHOLD / QUESTIONS_PER_TIER → débloque le palier suivant
 * - sinon → réessai sur le même palier
 */
export function resolveTierOutcome(
  correct: number,
  answered: number,
  current: Difficulty,
): {
  passed: boolean
  nextDifficulty: Difficulty | null
  unlocked: Difficulty[]
} {
  const passed =
    answered >= QUESTIONS_PER_TIER && correct >= PASS_THRESHOLD
  const idx = DIFFICULTIES.indexOf(current)

  if (!passed) {
    return {
      passed: false,
      nextDifficulty: current,
      unlocked: DIFFICULTIES.slice(0, idx + 1),
    }
  }

  const next = DIFFICULTIES[idx + 1] ?? null
  return {
    passed: true,
    nextDifficulty: next,
    unlocked: next
      ? DIFFICULTIES.slice(0, idx + 2)
      : [...DIFFICULTIES],
  }
}

export function nextDifficultyLabel(d: Difficulty | null): string {
  if (!d) return 'Terminé'
  const map = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' }
  return map[d]
}
