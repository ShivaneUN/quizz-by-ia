import { useEffect, useRef, useState } from 'react'
import {
  clearArcadeScores,
  loadArcadeScores,
  recordArcadeBest,
  type ArcadeScores,
} from '../lib/arcadeStorage'
import { FlappyWait } from './FlappyWait'
import { TypingDuel } from './TypingDuel'
import { GenEtaLabel, useGenEta } from './waitEta'
import './WaitMiniGames.css'

export type WaitGameId = 'typing' | 'flappy'

interface WaitMiniGamesProps {
  statusLabel?: string
  mode?: 'solo' | 'multi'
  onScoreChange?: (score: number) => void
  /** Depuis l’accueil : pas de compte à rebours génération */
  freePlay?: boolean
  /** ETA serveur (multi room.genEstimateSec) */
  estimateSec?: number | null
  /** Questions déjà générées (ex. 3) */
  questionsDone?: number | null
  /** Total cible (défaut 10) */
  questionsTotal?: number
  /** Nom de l'IA en cours (ex: "groq", "gemini", "openrouter") */
  aiSource?: string | null
  /** Thème en cours de génération */
  theme?: string | null
  /** Libellé difficulté (ex: "Facile") */
  difficultyLabel?: string | null
}

/**
 * Choix + mini-jeux (frappe / flappy).
 * Classement local persistant, indépendant du cache questions IA.
 */
export function WaitMiniGames({
  statusLabel = 'Génération du quiz…',
  mode = 'solo',
  onScoreChange,
  freePlay = false,
  estimateSec = null,
  questionsDone = null,
  questionsTotal = 10,
  aiSource = null,
  theme = null,
  difficultyLabel = null,
}: WaitMiniGamesProps) {
  const [game, setGame] = useState<WaitGameId | null>(null)
  const [records, setRecords] = useState<ArcadeScores>(() => loadArcadeScores())
  const [clearMsg, setClearMsg] = useState<string | null>(null)
  const etaSec = useGenEta(mode, freePlay ? null : estimateSec)
  const sessionBestRef = useRef(0)
  const onScoreRef = useRef(onScoreChange)
  onScoreRef.current = onScoreChange

  const showProgress =
    !freePlay &&
    questionsDone != null &&
    Number.isFinite(questionsDone) &&
    questionsTotal > 0
  const progressDone = showProgress
    ? Math.max(0, Math.min(questionsTotal, Math.round(questionsDone)))
    : 0

  useEffect(() => {
    return () => {
      onScoreRef.current?.(sessionBestRef.current)
    }
  }, [])

  function report(kind: WaitGameId, score: number) {
    if (score > sessionBestRef.current) {
      sessionBestRef.current = score
      onScoreRef.current?.(score)
    }
    setRecords(recordArcadeBest(kind, score))
  }

  function handleClearRank() {
    const ok = window.confirm(
      'Vider ton classement mini-jeux local ?\n\nCela n’efface pas les questions générées par l’IA ni l’historique de quiz.',
    )
    if (!ok) return
    const had = clearArcadeScores()
    setRecords(loadArcadeScores())
    setClearMsg(had ? 'Classement mini-jeux vidé.' : 'Classement déjà vide.')
  }

  const hint = freePlay
    ? 'Entraîne-toi quand tu veux — frappe ou Flappy.'
    : mode === 'multi'
      ? 'Choisis un jeu — chacun de son côté en attendant.'
      : 'Choisis un jeu le temps que le quiz se prépare.'

  return (
    <section className="wait-minis">
      <p className="wait-minis__eyebrow">
        {freePlay ? 'Arcade' : statusLabel}
      </p>
      {!freePlay && (theme || difficultyLabel) && (
        <p className="wait-minis__gen-meta" aria-live="polite">
          {theme}
          {theme && difficultyLabel ? ' · ' : ''}
          {difficultyLabel}
        </p>
      )}
      {!freePlay && <GenEtaLabel etaSec={etaSec} />}
      {showProgress && (
        <>
          <p className="wait-minis__progress" aria-live="polite">
            Questions générées par{' '}
            <span className="wait-minis__ai-source">
              {aiSource ?? '…'}
            </span>{' '}
            <span className="wait-minis__progress-num">
              {progressDone}/{questionsTotal}
            </span>
          </p>
        </>
      )}

      {game === null ? (
        <>
          <h2 className="wait-minis__title">Mini-jeux</h2>
          <p className="wait-minis__hint">{hint}</p>

          <div className="wait-minis__board" aria-live="polite">
            <p className="wait-minis__board-title">Mon classement local</p>
            <div className="wait-minis__board-grid">
              <div className="wait-minis__board-cell">
                <span className="wait-minis__board-label">Frappe</span>
                <span className="wait-minis__board-value">
                  {records.typingBest}
                </span>
              </div>
              <div className="wait-minis__board-cell">
                <span className="wait-minis__board-label">Flappy</span>
                <span className="wait-minis__board-value">
                  {records.flappyBest}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="wait-minis__clear-rank"
              onClick={handleClearRank}
            >
              Vider mon classement
            </button>
            {clearMsg && (
              <p className="wait-minis__clear-msg" role="status">
                {clearMsg}
              </p>
            )}
          </div>

          <div className="wait-minis__picks">
            <button
              type="button"
              className="wait-minis__pick"
              onClick={() => setGame('typing')}
            >
              <span className="wait-minis__pick-name">Duel de frappe</span>
              <span className="wait-minis__pick-desc">
                Tape les mots le plus vite possible
                {records.typingBest > 0
                  ? ` · record ${records.typingBest}`
                  : ''}
              </span>
            </button>
            <button
              type="button"
              className="wait-minis__pick wait-minis__pick--flappy"
              onClick={() => setGame('flappy')}
            >
              <span className="wait-minis__pick-name">Flappy</span>
              <span className="wait-minis__pick-desc">
                Tape pour voler entre les tuyaux
                {records.flappyBest > 0
                  ? ` · record ${records.flappyBest}`
                  : ''}
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="wait-minis__toolbar">
            <h2 className="wait-minis__title wait-minis__title--sm">
              {game === 'typing' ? 'Duel de frappe' : 'Flappy'}
            </h2>
            <button
              type="button"
              className="wait-minis__switch"
              onClick={() => {
                setGame(null)
                setRecords(loadArcadeScores())
              }}
            >
              Changer
            </button>
          </div>
          <p className="wait-minis__record" aria-live="polite">
            Record{' '}
            {game === 'typing' ? records.typingBest : records.flappyBest}
          </p>

          {game === 'typing' ? (
            <TypingDuel
              mode={mode}
              embedded
              onScoreChange={(s) => report('typing', s)}
            />
          ) : (
            <FlappyWait onScoreChange={(s) => report('flappy', s)} />
          )}
        </>
      )}
    </section>
  )
}
