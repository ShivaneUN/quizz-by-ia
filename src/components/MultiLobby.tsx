import type { MultiRoom } from '../lib/multiApi'
import type { Difficulty } from '../types'
import { DIFFICULTY_LABELS } from '../types'
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
  onKick: (targetPlayerId: string) => void
  onChangeTheme?: () => void
  onCancelGenerate?: () => void
  onTypingScore?: (score: number) => void
}

export function MultiLobby({
  room,
  playerId,
  busy,
  error,
  statusMsg,
  onStart,
  onLeave,
  onKick,
  onChangeTheme,
  onCancelGenerate,
  onTypingScore,
}: MultiLobbyProps) {
  const isHost = playerId === room.hostId
  const timerOn = room.timerEnabled !== false
  const playMode = room.playMode === 'progression' ? 'progression' : 'free'
  const difficulty: Difficulty =
    room.difficulty === 'medium' || room.difficulty === 'hard'
      ? room.difficulty
      : 'easy'
  const generating = room.status === 'generating' || busy
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
        {playMode === 'progression' ? ' · Paliers' : ' · Libre'}
        {` · ${DIFFICULTY_LABELS[difficulty]}`}
        {timerOn ? ' · Chrono 10 s' : ' · Sans chrono'}
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
          Mode paliers : tout le monde doit faire 10/10 pour avancer
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
          statusLabel="Génération des questions… Tout le monde reste synchronisé."
          onScoreChange={onTypingScore}
          estimateSec={room.genEstimateSec ?? null}
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
                disabled={generating || room.players.length < 1}
                onClick={onStart}
              >
                {room.status === 'error'
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

      <button
        type="button"
        className="multi-lobby__leave"
        onClick={onLeave}
        disabled={room.status === 'generating'}
      >
        Quitter la salle
      </button>
    </section>
  )
}
