import type { AiProvider } from '../types'
import { AI_PROVIDER_LABELS } from '../types'
import { useEffect, useRef, useState } from 'react'
import {
  clearArcadeScores,
  loadArcadeScores,
  recordArcadeBest,
  type ArcadeScores,
} from '../lib/arcadeStorage'
import { FlappyWait } from './FlappyWait'
import { TypingDuel } from './TypingDuel'
import {
  MorpionLobby,
  type MorpionEnterPayload,
} from './MorpionLobby'
import { MorpionPlay } from './MorpionPlay'
import { GenEtaLabel, useGenEta } from './waitEta'
import './WaitMiniGames.css'

export type WaitGameId = 'typing' | 'flappy' | 'morpion'

const GAME_TITLES: Record<WaitGameId, string> = {
  typing: 'Duel de frappe',
  flappy: 'Flappy',
  morpion: 'Morpion',
}

export type { MorpionEnterPayload }

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
  /** Hub arcade : entrée dans une salle morpion */
  onMorpionEnter?: (payload: MorpionEnterPayload) => void
  /** Ouvre un jeu dès l’arrivée (popup accueil) */
  initialGame?: WaitGameId | null
  morpionResume?: MorpionEnterPayload | null
  onMorpionResume?: () => void
  onMorpionMove?: (cell: number) => void
  onMorpionReplay?: () => void
  onMorpionLeave?: () => void
  morpionBusy?: boolean
  morpionError?: string | null
  /** Pseudo déjà connu (salle quiz / solo) */
  morpionDefaultName?: string
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
  onMorpionEnter,
  morpionResume = null,
  onMorpionResume,
  onMorpionMove,
  onMorpionReplay,
  onMorpionLeave,
  morpionBusy,
  morpionError,
  morpionDefaultName,
  initialGame = null,
}: WaitMiniGamesProps) {
  const [game, setGame] = useState<WaitGameId | null>(initialGame)
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
    if (initialGame) setGame(initialGame)
  }, [initialGame])

  useEffect(() => {
    return () => {
      onScoreRef.current?.(sessionBestRef.current)
    }
  }, [])

  function report(kind: 'typing' | 'flappy', score: number) {
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
    ? 'Entraîne-toi ou lance un morpion — un 2ᵉ joueur peut rejoindre.'
    : mode === 'multi'
      ? 'Choisis un jeu — tu peux rejoindre un morpion. Si le quiz démarre, l’IA reprend ta place.'
      : 'Choisis un jeu le temps que le quiz se prépare — morpion possible, l’IA reprend si ça lance.'

  const isDeezerWait = aiSource === 'deezer'
  const sourceLabel = isDeezerWait
    ? 'Deezer'
    : aiSource
      ? (AI_PROVIDER_LABELS[aiSource as AiProvider] ?? aiSource)
      : '…'
  const progressLead = isDeezerWait
    ? 'Extraits Deezer'
    : 'Questions générées par'

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
      {!freePlay && !isDeezerWait && <GenEtaLabel etaSec={etaSec} />}
      {showProgress && (
        <>
          <p className="wait-minis__progress" aria-live="polite">
            {progressLead}{' '}
            <span className="wait-minis__ai-source">{sourceLabel}</span>{' '}
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
            {onMorpionEnter && (
              <button
                type="button"
                className="wait-minis__pick wait-minis__pick--morpion"
                onClick={() => setGame('morpion')}
              >
                <span className="wait-minis__pick-name">Morpion</span>
                <span className="wait-minis__pick-desc">
                  {freePlay
                    ? 'Vs IA — un joueur peut rejoindre en cours'
                    : 'Vs IA ou rejoins une salle — l’IA reprend si le quiz part'}
                </span>
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="wait-minis__toolbar">
            <h2 className="wait-minis__title wait-minis__title--sm">
              {GAME_TITLES[game]}
            </h2>
            <button
              type="button"
              className="wait-minis__switch"
              onClick={() => {
                if (game === 'morpion' && morpionResume) onMorpionLeave?.()
                setGame(null)
                setRecords(loadArcadeScores())
              }}
            >
              Changer
            </button>
          </div>
          {game !== 'morpion' && (
            <p className="wait-minis__record" aria-live="polite">
              Record{' '}
              {game === 'typing'
                ? records.typingBest
                : records.flappyBest}
            </p>
          )}

          {game === 'typing' ? (
            <TypingDuel
              mode={mode}
              embedded
              onScoreChange={(s) => report('typing', s)}
            />
          ) : game === 'flappy' ? (
            <FlappyWait onScoreChange={(s) => report('flappy', s)} />
          ) : morpionResume && onMorpionMove && onMorpionLeave ? (
            <MorpionPlay
              room={morpionResume.room}
              playerId={morpionResume.playerId}
              busy={morpionBusy}
              error={morpionError}
              onMove={onMorpionMove}
              onReplay={onMorpionReplay}
              onLeave={onMorpionLeave}
            />
          ) : onMorpionEnter ? (
            <MorpionLobby
              onEnter={onMorpionEnter}
              resume={morpionResume}
              onResume={onMorpionResume}
              defaultName={morpionDefaultName}
            />
          ) : null}
        </>
      )}
    </section>
  )
}
