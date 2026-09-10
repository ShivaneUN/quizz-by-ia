import type { MultiRoom } from '../lib/multiApi'
import type { Difficulty } from '../types'
import { DIFFICULTY_LABELS, PASS_THRESHOLD, QUESTIONS_PER_TIER } from '../types'
import {
  FLAG_DIFFICULTY_LABELS,
  isFlagTheme,
  parseFlagDifficulty,
} from '../lib/flagQuiz'
import { HostPlayersPanel } from './HostPlayersPanel'
import { WaitMiniGames } from './WaitMiniGames'
import './MultiLobby.css'

interface MultiLobbyProps {
  room: MultiRoom
  playerId: string
  busy?: boolean
  error?: string | null
  statusMsg?: string | null
  onStart: () => void
  onLeave: () => void
  /** Hôte uniquement : ferme la salle pour tout le monde */
  onCloseRoom?: () => void
  onKick: (targetPlayerId: string) => void
  onChangeTheme?: () => void
  onCancelGenerate?: () => void
  onTypingScore?: (score: number) => void
  onMorpionEnter?: (payload: import('./WaitMiniGames').MorpionEnterPayload) => void
  morpionResume?: import('./WaitMiniGames').MorpionEnterPayload | null
  onMorpionMove?: (cell: number) => void
  onMorpionReplay?: () => void
  onMorpionLeave?: () => void
  morpionBusy?: boolean
  morpionError?: string | null
  morpionDefaultName?: string
}

export function MultiLobby({
  room,
  playerId,
  busy,
  error,
  statusMsg,
  onStart,
  onLeave,
  onCloseRoom,
  onKick,
  onChangeTheme,
  onCancelGenerate,
  onTypingScore,
  onMorpionEnter,
  morpionResume,
  onMorpionMove,
  onMorpionReplay,
  onMorpionLeave,
  morpionBusy,
  morpionError,
  morpionDefaultName,
}: MultiLobbyProps) {
  const isHost = playerId === room.hostId
  const timerOn = room.timerEnabled !== false
  const playMode = room.playMode === 'progression' ? 'progression' : 'free'
  const difficulty: Difficulty =
    room.difficulty === 'medium' || room.difficulty === 'hard'
      ? room.difficulty
      : 'easy'
  const generating = room.status === 'generating' || busy
  const isPendu = room.quizMode === 'pendu'
  const penduCount = room.players.length
  const penduReady =
    room.penduVariant === 'duo'
      ? penduCount === 2
      : penduCount >= 2 && penduCount <= 8
  const roomError =
    room.status === 'error'
      ? room.errorMessage || 'La génération a échoué. Réessaie.'
      : null
  const displayError = roomError || error

  return (
    <section className="multi-lobby">
      <p className="multi-lobby__code-label">Code de la salle</p>
      <p className="multi-lobby__code">{room.code}</p>
      <p className="multi-lobby__theme">
        {room.theme} · {room.scope === 'fr' ? 'Français' : 'International'}
        {room.quizMode === 'audio' ? ' · Musique Deezer' : ''}
        {room.quizMode === 'pendu'
          ? ` · Pendu ${room.penduVariant === 'duo' ? 'Duo' : 'Multi'} · ${DIFFICULTY_LABELS[difficulty]} · ${room.penduWordSource === 'ai' ? 'Banque + IA' : 'Banque locale'}`
          : ''}
        {isFlagTheme(room.theme)
          ? ` · ${FLAG_DIFFICULTY_LABELS[parseFlagDifficulty(room.flagDifficulty)]} · ${room.flagCount ?? 10} drapeaux`
          : ''}
        {room.quizMode !== 'pendu' &&
          !isFlagTheme(room.theme) &&
          (playMode === 'progression' ? ' · Paliers' : ' · Libre')}
        {room.quizMode !== 'pendu' &&
          !isFlagTheme(room.theme) &&
          ` · ${DIFFICULTY_LABELS[difficulty]}`}
        {room.quizMode !== 'pendu' &&
          (timerOn ? ' · Chrono 10 s' : ' · Sans chrono')}
      </p>

      <HostPlayersPanel
        room={room}
        playerId={playerId}
        busy={busy || room.status === 'generating'}
        onKick={onKick}
        alwaysOpen
      />

      {playMode === 'progression' && (
        <p className="multi-lobby__info">
          Mode paliers : tout le monde doit faire au moins{' '}
          {PASS_THRESHOLD}/{QUESTIONS_PER_TIER} pour avancer
        </p>
      )}

      {room.hostPickingTheme && !isHost && (
        <p className="multi-lobby__info">
          L’hôte choisit un nouveau thème… Tu es dans la salle, patiente.
        </p>
      )}

      {room.hostPickingTheme && isHost && (
        <p className="multi-lobby__info">
          Choix de thème en cours — les joueurs attendent dans la salle.
        </p>
      )}

      {room.status === 'generating' && (
        <WaitMiniGames
          mode="multi"
          statusLabel={
            room.quizMode === 'audio'
              ? 'Tirage Deezer… Tout le monde reste synchronisé.'
              : isFlagTheme(room.theme)
                ? 'Préparation des drapeaux… Tout le monde reste synchronisé.'
                : 'Génération IA… Tout le monde reste synchronisé.'
          }
          theme={room.theme || null}
          difficultyLabel={DIFFICULTY_LABELS[difficulty]}
          onScoreChange={onTypingScore}
          estimateSec={room.genEstimateSec ?? null}
          questionsDone={room.genQuestionsDone ?? 0}
          questionsTotal={room.genQuestionsTotal ?? 10}
          aiSource={
            room.quizMode === 'audio'
              ? 'deezer'
              : (room.genAiSource ?? null)
          }
          onMorpionEnter={onMorpionEnter}
          morpionResume={morpionResume}
          onMorpionMove={onMorpionMove}
          onMorpionReplay={onMorpionReplay}
          onMorpionLeave={onMorpionLeave}
          morpionBusy={morpionBusy}
          morpionError={morpionError}
          morpionDefaultName={morpionDefaultName}
        />
      )}

      {statusMsg && room.status !== 'generating' && (
        <p className="multi-lobby__hint">{statusMsg}</p>
      )}
      {displayError && (
        <p className="multi-lobby__error" role="alert">
          {displayError}
        </p>
      )}

      {isHost ? (
        <div className="multi-lobby__actions">
          {room.status === 'generating' ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onCancelGenerate}
              disabled={!onCancelGenerate}
            >
              Annuler la génération
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--primary"
                disabled={generating || (isPendu ? !penduReady : room.players.length < 1)}
                onClick={onStart}
              >
                {isPendu
                  ? room.penduVariant === 'duo'
                    ? penduCount === 2
                      ? 'Démarrer le pendu Duo'
                      : `Duo : 2 joueurs (${penduCount}/2)`
                    : penduCount >= 2
                      ? 'Démarrer le pendu Multi'
                      : `Multi : au moins 2 joueurs (${penduCount}/2)`
                  : room.status === 'error'
                    ? `Réessayer (10 Q · ${DIFFICULTY_LABELS[difficulty]}${timerOn ? ' · 10 s' : ''})`
                    : `Démarrer (10 Q · ${DIFFICULTY_LABELS[difficulty]}${timerOn ? ' · 10 s' : ''})`}
              </button>
              {onChangeTheme && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={onChangeTheme}
                >
                  Changer de thème
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="multi-lobby__wait">
          {room.hostPickingTheme
            ? 'L’hôte choisit un thème…'
            : room.status === 'generating'
              ? 'L’hôte génère les questions…'
              : room.status === 'error'
                ? 'En attente que l’hôte relance…'
                : 'En attente de l’hôte…'}
        </p>
      )}

      {isHost && onCloseRoom ? (
        <div className="multi-lobby__leave-row">
          <button
            type="button"
            className="multi-lobby__leave"
            onClick={onLeave}
            disabled={busy}
            title="Tu quittes ; l’hôte passe à un autre joueur"
          >
            Quitter la salle
          </button>
          <button
            type="button"
            className="multi-lobby__leave multi-lobby__leave--danger"
            onClick={onCloseRoom}
            disabled={busy}
            title="Ferme la salle pour tous les participants"
          >
            Fermer la salle (tous)
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="multi-lobby__leave"
          onClick={onLeave}
          disabled={busy}
        >
          Quitter la salle
        </button>
      )}
    </section>
  )
}
