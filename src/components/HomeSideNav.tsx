import { useState } from 'react'
import { clearMultiQuestionCache } from '../lib/api'
import { clearLocalQuizCache } from '../lib/bankStorage'
import './HomeSideNav.css'

interface HomeSideNavProps {
  onMulti: () => void
  onMinigames: () => void
  /** Salle multi encore ouverte */
  inRoom?: boolean
  roomCode?: string | null
  onReturnToRoom?: () => void
  /** Mise en page barre icônes (accueil) */
  variant?: 'dock' | 'side'
}

function IconAdmin() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2 4 5v6.5c0 5.25 3.4 10.15 8 11.5 4.6-1.35 8-6.25 8-11.5V5l-8-3Zm0 2.18 6 2.25v5.07c0 4.1-2.55 8.05-6 9.3-3.45-1.25-6-5.2-6-9.3V6.43l6-2.25ZM11 8h2v5h-2V8Zm0 6h2v2h-2v-2Z"
      />
    </svg>
  )
}

function IconPad() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M17 4H7C4.24 4 2 6.24 2 9v6c0 2.76 2.24 5 5 5h10c2.76 0 5-2.24 5-5V9c0-2.76-2.24-5-5-5Zm-8.5 9.5H7v1.5H5.5V13.5H4V12h1.5V10.5H7V12h1.5v1.5Zm7.25.75a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm2.5-2.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"
      />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9H7V9Zm2 13c-1.1 0-2-.9-2-2V8h10v12c0 1.1-.9 2-2 2H9Z"
      />
    </svg>
  )
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
      />
    </svg>
  )
}

function IconMulti() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M16 11a4 4 0 1 0-3.2-6.4A4 4 0 0 0 16 11ZM8 12a4 4 0 1 0-3.2-6.4A4 4 0 0 0 8 12Zm0 2c-2.67 0-8 1.34-8 4v2h10v-2c0-1.5.7-2.7 1.8-3.6C10.4 14.1 9.1 14 8 14Zm8 0c-.4 0-.85.03-1.3.08 1.5.8 2.3 2 2.3 3.92V20h9v-2c0-2.66-5.33-4-10-4Z"
      />
    </svg>
  )
}

/**
 * Navigation accueil — barre icônes (Réglages · Mini-jeux · Cache · Chat · Multi)
 */
export function HomeSideNav({
  onMulti,
  onMinigames,
  inRoom = false,
  roomCode = null,
  onReturnToRoom,
  variant = 'dock',
}: HomeSideNavProps) {
  const [cacheMsg, setCacheMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  async function handleClearCache() {
    const ok = window.confirm(
      'Vider l’historique anti-doublon ?\n\n• Solo : questions déjà vues sur cet appareil\n• Multi : historique serveur des questions déjà posées\n\nLe classement mini-jeux local n’est pas touché.\nLes salles en cours ne sont pas fermées.',
    )
    if (!ok) return

    setBusy(true)
    setCacheMsg(null)
    setActive('cache')
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

  function openAdmin() {
    setActive('admin')
    window.dispatchEvent(new CustomEvent('quizz:open-admin'))
  }

  function openChat() {
    setActive('chat')
    window.dispatchEvent(new CustomEvent('quizz:open-chat'))
  }

  if (variant === 'side') {
    return (
      <aside className="home-side-nav home-side-nav--side" aria-label="Navigation">
        {inRoom && roomCode && (
          <div className="home-side-nav__room">
            <p className="home-side-nav__room-code">Salle {roomCode}</p>
            {onReturnToRoom && (
              <button
                type="button"
                className="home-side-nav__btn home-side-nav__btn--room"
                onClick={onReturnToRoom}
              >
                Retour salle
              </button>
            )}
          </div>
        )}
        <button type="button" className="home-side-nav__btn" onClick={onMulti}>
          Multi
        </button>
        <button type="button" className="home-side-nav__btn" onClick={onMinigames}>
          Mini-jeux
        </button>
        <button
          type="button"
          className="home-side-nav__btn home-side-nav__btn--cache"
          onClick={() => void handleClearCache()}
          disabled={busy}
        >
          {busy ? 'Vidage…' : 'Vider cache'}
        </button>
        {cacheMsg && (
          <p className="home-side-nav__cache-msg" role="status">
            {cacheMsg}
          </p>
        )}
      </aside>
    )
  }

  return (
    <nav className="home-dock" aria-label="Navigation">
      {inRoom && roomCode && (
        <div className="home-dock__room">
          <span>Salle {roomCode}</span>
          {onReturnToRoom && (
            <button type="button" onClick={onReturnToRoom}>
              Retour
            </button>
          )}
        </div>
      )}
      <div className="home-dock__bar">
        <button
          type="button"
          className={`home-dock__item${active === 'admin' ? ' is-on' : ''}`}
          onClick={openAdmin}
        >
          <span className="home-dock__icon">
            <IconAdmin />
          </span>
          <span className="home-dock__label">Admin</span>
        </button>
        <button
          type="button"
          className={`home-dock__item${active === 'minigames' ? ' is-on' : ''}`}
          onClick={() => {
            setActive('minigames')
            onMinigames()
          }}
        >
          <span className="home-dock__icon">
            <IconPad />
          </span>
          <span className="home-dock__label">Mini-jeux</span>
        </button>
        <button
          type="button"
          className={`home-dock__item home-dock__item--danger${active === 'cache' ? ' is-on' : ''}`}
          onClick={() => void handleClearCache()}
          disabled={busy}
        >
          <span className="home-dock__icon">
            <IconTrash />
          </span>
          <span className="home-dock__label">{busy ? '…' : 'Cache'}</span>
        </button>
        <button
          type="button"
          className={`home-dock__item${active === 'chat' ? ' is-on' : ''}`}
          onClick={openChat}
        >
          <span className="home-dock__icon">
            <IconChat />
          </span>
          <span className="home-dock__label">Chat</span>
        </button>
        <button
          type="button"
          className={`home-dock__item${active === 'multi' ? ' is-on' : ''}`}
          onClick={() => {
            setActive('multi')
            onMulti()
          }}
        >
          <span className="home-dock__icon">
            <IconMulti />
          </span>
          <span className="home-dock__label">Multi</span>
        </button>
      </div>
      {cacheMsg && (
        <p className="home-dock__msg" role="status">
          {cacheMsg}
        </p>
      )}
    </nav>
  )
}
