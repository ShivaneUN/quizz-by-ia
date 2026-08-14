import './TypingScorePopup.css'

export interface TypingScoreEntry {
  id: string
  name: string
  score: number
}

interface TypingScorePopupProps {
  entries: TypingScoreEntry[]
  playerId?: string | null
  onClose: () => void
}

/** Petit dashboard des scores du duel de frappe — fermable à la main. */
export function TypingScorePopup({
  entries,
  playerId,
  onClose,
}: TypingScorePopupProps) {
  const ranked = [...entries].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  return (
    <div className="typing-board" role="dialog" aria-modal="true" aria-labelledby="typing-board-title">
      <div className="typing-board__card">
        <p className="typing-board__eyebrow">Mini-jeu</p>
        <h2 id="typing-board-title" className="typing-board__title">
          Classement mini-jeu
        </h2>
        <ol className="typing-board__list">
          {ranked.map((e, i) => (
            <li
              key={e.id}
              className={`typing-board__row${e.id === playerId ? ' is-you' : ''}${i === 0 ? ' is-first' : ''}`}
            >
              <span className="typing-board__rank">#{i + 1}</span>
              <span className="typing-board__name">
                {e.name}
                {e.id === playerId ? ' (toi)' : ''}
              </span>
              <span className="typing-board__score">{e.score}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn--primary typing-board__close" onClick={onClose}>
          Fermer
        </button>
        <p className="typing-board__hint">Se ferme aussi au démarrage du quiz</p>
      </div>
    </div>
  )
}
