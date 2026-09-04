import { useEffect, useMemo, useState } from 'react'
import { DIFFICULTY_LABELS, type Difficulty, type TierAttempt } from '../types'
import {
  FLAG_DIFFICULTIES,
  FLAG_DIFFICULTY_LABELS,
  clampFlagCount,
  flagCountSteps,
  type FlagDifficulty,
} from '../lib/flagQuiz'
import './Results.css'

interface ResultsProps {
  theme: string
  totalScore: number
  tierAttempts: Record<Difficulty, TierAttempt>
  onRestart: () => void
  flags?: {
    flagDifficulty: FlagDifficulty
    flagCount: number
    onReplay: (input: {
      flagDifficulty: FlagDifficulty
      flagCount: number
    }) => void | Promise<void>
  }
}

export function Results({
  theme,
  totalScore,
  tierAttempts,
  onRestart,
  flags,
}: ResultsProps) {
  const [replayDifficulty, setReplayDifficulty] = useState<FlagDifficulty>(
    flags?.flagDifficulty ?? 'easy',
  )
  const [replayCount, setReplayCount] = useState<number>(
    flags?.flagCount ?? 10,
  )

  useEffect(() => {
    if (!flags) return
    setReplayDifficulty(flags.flagDifficulty)
    setReplayCount(flags.flagCount)
  }, [flags])

  const replaySteps = useMemo(
    () => flagCountSteps(replayDifficulty),
    [replayDifficulty],
  )

  const replayCountClamped = useMemo(
    () => clampFlagCount(replayDifficulty, replayCount),
    [replayDifficulty, replayCount],
  )

  return (
    <section className="results">
      <h2 className="results__title">Bilan</h2>
      <p className="results__lead">
        Thème <strong>{theme}</strong>
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
      {flags ? (
        <div className="results__flags">
          <h3 className="results__flags-title">Rejouer drapeaux</h3>

          <div
            className="results__flags-section"
            role="group"
            aria-label="Difficulté drapeaux"
          >
            {FLAG_DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={`results__chip${replayDifficulty === d ? ' is-selected' : ''}`}
                onClick={() => {
                  setReplayDifficulty(d)
                  setReplayCount((c) => clampFlagCount(d, c))
                }}
                aria-pressed={replayDifficulty === d}
              >
                {FLAG_DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>

          <div
            className="results__flags-section results__flags-section--count"
            role="group"
            aria-label="Nombre de drapeaux"
          >
            {replaySteps.map((n) => (
              <button
                key={n}
                type="button"
                className={`results__chip results__chip--count${replayCountClamped === n ? ' is-selected' : ''}`}
                onClick={() => setReplayCount(n)}
                aria-pressed={replayCountClamped === n}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="results__flags-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() =>
                void flags.onReplay({
                  flagDifficulty: replayDifficulty,
                  flagCount: replayCountClamped,
                })
              }
            >
              Rejouer
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onRestart}
            >
              Nouveau thème
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--primary" onClick={onRestart}>
          Nouveau thème
        </button>
      )}
    </section>
  )
}
