import './ModeSelect.css'

interface ModeSelectProps {
  onSolo: () => void
  onMulti: () => void
}

export function ModeSelect({ onSolo, onMulti }: ModeSelectProps) {
  return (
    <section className="mode-select">
      <h1 className="mode-select__title">Quizz By Ai</h1>
      <p className="mode-select__lead">Choisis ton mode de jeu</p>
      <div className="mode-select__grid">
        <button type="button" className="mode-card" onClick={onSolo}>
          <span className="mode-card__icon" aria-hidden>
            👤
          </span>
          <span className="mode-card__label">Solo</span>
          <span className="mode-card__hint">
            Paliers ou libre · chrono optionnel
          </span>
        </button>
        <button
          type="button"
          className="mode-card mode-card--multi"
          onClick={onMulti}
        >
          <span className="mode-card__icon" aria-hidden>
            👥
          </span>
          <span className="mode-card__label">Multijoueur</span>
          <span className="mode-card__hint">
            Salle · paliers ou libre · chrono optionnel
          </span>
        </button>
      </div>
    </section>
  )
}
