import type { Difficulty } from '../types'
import { DIFFICULTIES, DIFFICULTY_LABELS } from '../types'
import './ProgressBar.css'

interface ProgressBarProps {
  current: Difficulty
  finished?: boolean
  /** En mode libre, tous les paliers sont accessibles */
  freeMode?: boolean
}

/** Facile ✓ → Moyen (en cours) → Difficile 🔒 */
export function ProgressBar({ current, finished, freeMode }: ProgressBarProps) {
  const curIdx = DIFFICULTIES.indexOf(current)

  return (
    <ol className="progress-bar" aria-label="Progression des paliers">
      {DIFFICULTIES.map((d, i) => {
        let state: 'done' | 'current' | 'locked'
        if (finished) state = 'done'
        else if (i === curIdx) state = 'current'
        else if (freeMode || i < curIdx) state = 'done'
        else state = 'locked'

        return (
          <li key={d} className={`progress-bar__step progress-bar__step--${state}`}>
            <span className="progress-bar__mark" aria-hidden>
              {state === 'done' ? '✓' : state === 'locked' ? '🔒' : '●'}
            </span>
            <span className="progress-bar__label">
              {DIFFICULTY_LABELS[d]}
              {state === 'current' ? ' (en cours)' : ''}
            </span>
            {i < DIFFICULTIES.length - 1 && (
              <span className="progress-bar__arrow" aria-hidden>
                →
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
