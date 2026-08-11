import type { MultiRoom } from '../lib/multiApi'
import { StreakFlame } from './StreakFlame'
import './PlayersStreakBar.css'

interface PlayersStreakBarProps {
  room: MultiRoom
  playerId: string
}

/** Liste joueurs + flammes — visible par tout le monde pendant la partie. */
export function PlayersStreakBar({ room, playerId }: PlayersStreakBarProps) {
  return (
    <ul className="players-streak" aria-label="Joueurs et séries">
      {room.players.map((p) => {
        const streak = p.streakActuelle ?? 0
        return (
          <li
            key={p.id}
            className={`players-streak__item${p.id === playerId ? ' is-you' : ''}`}
          >
            <span className="players-streak__name">
              {p.name}
              {p.id === room.hostId ? ' · hôte' : ''}
              {p.id === playerId ? ' · toi' : ''}
            </span>
            <span className="players-streak__meta">
              <StreakFlame streak={streak} />
              <span className="players-streak__score">{p.score} pts</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
