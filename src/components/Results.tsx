import { DIFFICULTY_LABELS, type Difficulty, type TierAttempt } from '../types'
import './Results.css'

interface ResultsProps {
  playerName: string
  theme: string
  totalScore: number
  tierAttempts: Record<Difficulty, TierAttempt>
  onRestart: () => void
}

export function Results({
  playerName,
  theme,
  totalScore,
  tierAttempts,
  onRestart,
}: ResultsProps) {
  return (
    <section className="results">
      <h2 className="results__title">Bilan</h2>
      <p className="results__lead">
        {playerName} — thème <strong>{theme}</strong>
      </p>
      <p className="results__total">
        Score total : <span>{totalScore}</span> bonnes réponses
      </p>
      <ul className="results__tiers">
        {(Object.keys(tierAttempts) as Difficulty[]).map((d) => {
          const t = tierAttempts[d]
          if (t.status === 'locked' && t.answered === 0) return null
          return (
            <li key={d}>
              <span>{DIFFICULTY_LABELS[d]}</span>
              <span>
                {t.correct}/{t.answered}
                {t.status === 'passed' ? ' ✓' : t.status === 'failed' ? ' — bloqué' : ''}
              </span>
            </li>
          )
        })}
      </ul>
      <button type="button" className="btn btn--primary" onClick={onRestart}>
        Nouveau thème
      </button>
    </section>
  )
}
