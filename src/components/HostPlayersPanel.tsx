import { useState } from 'react'
import type { MultiRoom } from '../lib/multiApi'
import './HostPlayersPanel.css'

interface HostPlayersPanelProps {
  room: MultiRoom
  playerId: string
  busy?: boolean
  onKick: (targetPlayerId: string) => void
  /** Lobby : liste toujours ouverte. Partie/score : bouton pour afficher. */
  alwaysOpen?: boolean
}

export function HostPlayersPanel({
  room,
  playerId,
  busy,
  onKick,
  alwaysOpen = false,
}: HostPlayersPanelProps) {
  const isHost = playerId === room.hostId
  const [open, setOpen] = useState(alwaysOpen)

  if (!isHost && !alwaysOpen) return null

  const showList = alwaysOpen || open

  return (
    <div className="host-players">
      {!alwaysOpen && isHost && (
        <button
          type="button"
          className="btn btn--secondary host-players__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open
            ? 'Masquer les joueurs'
            : `Joueurs (${room.players.length}/8)`}
        </button>
      )}

      {showList && (
        <>
          {alwaysOpen && (
            <h3 className="host-players__title">
              Joueurs ({room.players.length}/8)
            </h3>
          )}
          <ul className="host-players__list">
            {room.players.map((p) => (
              <li key={p.id}>
                <span className="host-players__name">
                  {p.name}
                  {p.id === room.hostId && (
                    <span className="host-players__badge">Hôte</span>
                  )}
                  {p.id === playerId && (
                    <span className="host-players__badge host-players__badge--you">
                      Toi
                    </span>
                  )}
                </span>
                {isHost && p.id !== room.hostId && (
                  <button
                    type="button"
                    className="host-players__kick"
                    disabled={busy}
                    onClick={() => onKick(p.id)}
                  >
                    Éjecter
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
