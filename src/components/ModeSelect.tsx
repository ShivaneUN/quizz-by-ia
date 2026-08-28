import { useState } from 'react'
import { clearMultiQuestionCache } from '../lib/api'
import { clearLocalQuizCache } from '../lib/bankStorage'
import './ModeSelect.css'

interface ModeSelectProps {
  onSolo: () => void
  onMulti: () => void
  onMinigames: () => void
}

export function ModeSelect({ onSolo, onMulti, onMinigames }: ModeSelectProps) {
  const [cacheMsg, setCacheMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleClearCache() {
    const ok = window.confirm(
      'Vider l’historique anti-doublon ?\n\n• Solo : questions déjà vues sur cet appareil\n• Multi : historique serveur des questions déjà posées\n\nLe classement mini-jeux local n’est pas touché.\nLes salles en cours ne sont pas fermées.',
    )
    if (!ok) return

    setBusy(true)
    setCacheMsg(null)
    try {
      const local = clearLocalQuizCache()
      const remote = await clearMultiQuestionCache()
      const multiN = remote.multiHistoriesCleared
      setCacheMsg(
        local.histories + multiN === 0
          ? 'Historique déjà vide.'
          : `Historique vidé — solo : ${local.histories} · multi : ${multiN} thème(s).`,
      )
    } catch (e) {
      setCacheMsg(
        e instanceof Error
          ? `Solo vidé, multi en erreur : ${e.message}`
          : 'Solo vidé, multi en erreur.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mode-select">
      <h1 className="mode-select__title">Quizz By IA</h1>
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

      <button
        type="button"
        className="mode-card mode-card--arcade"
        onClick={onMinigames}
      >
        <span className="mode-card__icon" aria-hidden>
          🎮
        </span>
        <span className="mode-card__label">Mini-jeux</span>
        <span className="mode-card__hint">
          Frappe · Flappy — joue librement
        </span>
      </button>

      <button
        type="button"
        className="mode-select__cache"
        onClick={() => void handleClearCache()}
        disabled={busy}
      >
        {busy ? 'Vidage…' : 'Vider le cache'}
      </button>
      {cacheMsg && (
        <p className="mode-select__cache-msg" role="status">
          {cacheMsg}
        </p>
      )}
    </section>
  )
}
