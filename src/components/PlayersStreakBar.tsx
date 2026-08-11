import type { MultiRoom } from '../lib/multiApi'
import { StreakFlame } from './StreakFlame'
import './PlayersStreakBar.css'

interface PlayersStreakBarProps {
  room: MultiRoom
  playerId: string
}

/** Classement live (score + flammes) — coin haut droite pendant le quiz. */
export function PlayersStreakBar({ room, playerId }: PlayersStreakBarProps) {
  const ranked = [...room.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.name.localeCompare(b.name, 'fr')
  })

  return (
    <aside className="live-rank" aria-label="Classement">
      <p className="live-rank__title">Classement</p>
      <ol className="live-rank__list">
        {ranked.map((p, i) => {
          const streak = p.streakActuelle ?? 0
          return (
            <li
              key={p.id}
              className={`live-rank__item${p.id === playerId ? ' is-you' : ''}${i === 0 ? ' is-first' : ''}`}
            >
              <span className="live-rank__pos">#{i + 1}</span>
              <span className="live-rank__name">
                {p.name}
                {p.id === playerId ? ' · toi' : ''}
              </span>
              <span className="live-rank__meta">
                <StreakFlame streak={streak} />
                <span className="live-rank__score">{p.score}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
