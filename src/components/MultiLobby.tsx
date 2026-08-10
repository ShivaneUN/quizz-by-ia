import type { MultiRoom } from '../lib/multiApi'
import type { Difficulty } from '../types'
import { DIFFICULTY_LABELS } from '../types'
import { HostPlayersPanel } from './HostPlayersPanel'
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

      {room.status === 'generating' && (
        <p className="multi-lobby__hint" aria-live="polite">
          Génération des questions en cours… Tout le monde reste synchronisé.
        </p>
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
        <button
          type="button"
          className="btn btn--primary"
          disabled={generating || room.players.length < 1}
          onClick={onStart}
        >
          {generating
            ? 'Génération…'
            : room.status === 'error'
              ? `Réessayer (10 Q · ${DIFFICULTY_LABELS[difficulty]}${timerOn ? ' · 10 s' : ''})`
              : `Démarrer (10 Q · ${DIFFICULTY_LABELS[difficulty]}${timerOn ? ' · 10 s' : ''})`}
        </button>
      ) : (
        <p className="multi-lobby__wait">
          {room.status === 'generating'
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
