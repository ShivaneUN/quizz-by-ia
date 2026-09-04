import { useMemo, useState } from 'react'
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  PASS_THRESHOLD,
  QUESTIONS_PER_TIER,
  type Difficulty,
  type SoloPlayMode,
} from '../types'
import {
  FLAG_DIFFICULTIES,
  FLAG_DIFFICULTY_LABELS,
  clampFlagCount,
  flagCountSteps,
  type FlagDifficulty,
} from '../lib/flagQuiz'
import './TierResult.css'

interface TierResultProps {
  difficulty: Difficulty
  correct: number
  answered: number
  passed: boolean
  hasNext: boolean
  playMode?: SoloPlayMode
  busy?: boolean
  onContinue: () => void
  onReplay?: () => void
  onPickDifficulty?: (d: Difficulty) => void
  onFinish?: () => void
  /** Présent uniquement pour le thème drapeaux en mode manuel */
  flags?: {
    flagDifficulty: FlagDifficulty
    flagCount: number
    onPickFlags: (input: { flagDifficulty: FlagDifficulty; flagCount: number }) => void
  }
}

export function TierResult({
  difficulty,
  correct,
  answered,
  passed,
  hasNext,
  playMode = 'progression',
  busy,
  onContinue,
  onReplay,
  onPickDifficulty,
  onFinish,
  flags,
}: TierResultProps) {
  const [replayDiff, setReplayDiff] = useState<FlagDifficulty>(
    flags?.flagDifficulty ?? 'easy',
  )
  const [replayCount, setReplayCount] = useState<number>(
    flags?.flagCount ?? 10,
  )

  const replaySteps = useMemo(() => flagCountSteps(replayDiff), [replayDiff])
  const replayCountClamped = useMemo(
    () => clampFlagCount(replayDiff, replayCount),
    [replayDiff, replayCount],
  )

  if (playMode === 'manual') {
    return (
      <section className="tier-result">
        <h2 className="tier-result__title">
          Manche {flags ? FLAG_DIFFICULTY_LABELS[replayDiff] : DIFFICULTY_LABELS[difficulty]}
        </h2>
        <p className="tier-result__score">
          {correct} / {answered} bonnes réponses
        </p>
        <p className="tier-result__msg">
          {flags
            ? 'Choisis une difficulté et un nombre de drapeaux pour rejouer.'
            : 'Choisis une difficulté pour rejouer, ou termine pour voir ton bilan.'}
        </p>

        {flags ? (
          <>
            <div className="tier-result__diffs" role="group" aria-label="Difficulté drapeaux">
              {FLAG_DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`tier-result__diff${replayDiff === d ? ' is-current' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    setReplayDiff(d)
                    setReplayCount((c) => clampFlagCount(d, c))
                  }}
                >
                  {FLAG_DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>

            <div className="tier-result__diffs tier-result__diffs--count" role="group" aria-label="Nombre de drapeaux">
              {replaySteps.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`tier-result__diff tier-result__diff--count${replayCountClamped === n ? ' is-current' : ''}`}
                  disabled={busy}
                  onClick={() => setReplayCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="tier-result__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() =>
                  flags.onPickFlags({
                    flagDifficulty: replayDiff,
                    flagCount: replayCountClamped,
                  })
                }
              >
                Rejouer
              </button>
              {onFinish && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={onFinish}
                >
                  Voir le bilan
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="tier-result__diffs" role="group" aria-label="Difficulté">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`tier-result__diff${d === difficulty ? ' is-current' : ''}`}
                  disabled={busy}
                  onClick={() => onPickDifficulty?.(d)}
                >
                  {DIFFICULTY_LABELS[d]}
                  {d === difficulty ? ' · rejouer' : ''}
                </button>
              ))}
            </div>

            <div className="tier-result__actions">
              {onReplay && (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={onReplay}
                >
                  Rejouer {DIFFICULTY_LABELS[difficulty]}
                </button>
              )}
              {onFinish && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={onFinish}
                >
                  Voir le bilan
                </button>
              )}
            </div>
          </>
        )}
      </section>
    )
  }

  return (
    <section className="tier-result">
      <h2 className="tier-result__title">
        Palier {DIFFICULTY_LABELS[difficulty]}
      </h2>
      <p className="tier-result__score">
        {correct} / {answered} bonnes réponses
      </p>
      <p className="tier-result__msg">
        {passed
          ? hasNext
            ? `${correct}/${answered} — palier suivant débloqué.`
            : 'Tous les paliers sont terminés. Bravo !'
          : `Il faut ${PASS_THRESHOLD}/${QUESTIONS_PER_TIER} bonnes réponses pour passer. Tu réessaies avec d'autres questions du même palier.`}
      </p>
      <button type="button" className="btn btn--primary" onClick={onContinue}>
        {passed
          ? hasNext
            ? 'Continuer'
            : 'Voir le bilan'
          : 'Réessayer ce palier'}
      </button>
    </section>
  )
}
