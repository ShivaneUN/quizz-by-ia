import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  PASS_THRESHOLD,
  QUESTIONS_PER_TIER,
  type Difficulty,
  type SoloPlayMode,
} from '../types'
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
}: TierResultProps) {
  if (playMode === 'manual') {
    return (
      <section className="tier-result">
        <h2 className="tier-result__title">
          Manche {DIFFICULTY_LABELS[difficulty]}
        </h2>
        <p className="tier-result__score">
          {correct} / {answered} bonnes réponses
        </p>
        <p className="tier-result__msg">
          Choisis une difficulté pour rejouer, ou termine pour voir ton bilan.
        </p>

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
            ? `10/10 ! Palier suivant débloqué.`
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
