import { useState } from 'react'
import { clearMultiQuestionCache } from '../lib/api'
import { clearLocalQuizCache } from '../lib/bankStorage'
import {
  PopupMiniJeux,
  PopupMulti,
  PopupProfil,
  type HomePopupId,
} from './HomePopups'
import { MiniGameFloat } from './MiniGameFloat'
import type { WaitGameId } from './WaitMiniGames'
import './HomeSideNav.css'

interface HomeSideNavProps {
  onMulti: () => void
  onMinigames: () => void
  onCreateRoom?: (playerName: string) => void
  onJoinRoom?: (code: string, playerName: string) => void
  onPickMiniGame?: (game: WaitGameId) => void
  multiBusy?: boolean
  multiError?: string | null
  /** Salle multi encore ouverte */
  inRoom?: boolean
  roomCode?: string | null
  onReturnToRoom?: () => void
  /** Mise en page barre icônes (accueil) */
  variant?: 'dock' | 'side'
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0-3.2-6.4A4 4 0 0 0 12 12Zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5Z"
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
 * Navigation accueil — barre icônes (Profil · Mini-jeux · Chat · Multi)
 */
export function HomeSideNav({
  onMulti,
  onCreateRoom,
  onJoinRoom,
  multiBusy,
  multiError,
  inRoom = false,
  roomCode = null,
  onReturnToRoom,
  variant = 'dock',
}: HomeSideNavProps) {
  const [cacheMsg, setCacheMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [popup, setPopup] = useState<HomePopupId | null>(null)
  const [floatGame, setFloatGame] = useState<WaitGameId | null>(null)

  async function handleClearCache() {
    const ok = window.confirm(
      'Vider l’historique anti-doublon ?\n\n• Solo : questions déjà vues sur cet appareil\n• Multi : historique serveur des questions déjà posées\n\nLe classement mini-jeux local n’est pas touché.\nLes salles en cours ne sont pas fermées.',
    )
    if (!ok) return

    setBusy(true)
    setCacheMsg(null)
    setActive('profil')
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

  const popups = (
    <>
      {popup === 'profil' && (
        <PopupProfil
          onClose={() => setPopup(null)}
          onOpenAdmin={openAdmin}
          onClearCache={() => void handleClearCache()}
          cacheBusy={busy}
          cacheMsg={cacheMsg}
        />
      )}
      {popup === 'minijeux' && (
        <PopupMiniJeux
          onClose={() => setPopup(null)}
          onPickGame={(game) => {
            setActive('minigames')
            setPopup(null)
            setFloatGame(game)
          }}
        />
      )}
      {floatGame && (
        <MiniGameFloat
          key={floatGame}
          game={floatGame}
          onClose={() => setFloatGame(null)}
        />
      )}
      {popup === 'multi' && (
        <PopupMulti
          onClose={() => setPopup(null)}
          inRoom={inRoom}
          roomCode={roomCode}
          busy={multiBusy}
          error={multiError}
          onReturnToRoom={onReturnToRoom}
          onCreateRoom={(name) => {
            setActive('multi')
            if (onCreateRoom) onCreateRoom(name)
            else onMulti()
          }}
          onJoinRoom={(code, name) => {
            setActive('multi')
            if (onJoinRoom) onJoinRoom(code, name)
            else onMulti()
          }}
        />
      )}
    </>
  )

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
        <button type="button" className="home-side-nav__btn" onClick={() => setPopup('multi')}>
          Multi
        </button>
        <button type="button" className="home-side-nav__btn" onClick={() => setPopup('minijeux')}>
          Mini-jeux
        </button>
        {popups}
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
          className={`home-dock__item${active === 'profil' || popup === 'profil' ? ' is-on' : ''}`}
          onClick={() => {
            setActive('profil')
            setPopup('profil')
          }}
        >
          <span className="home-dock__icon">
            <IconUser />
          </span>
          <span className="home-dock__label">Profil</span>
        </button>
        <button
          type="button"
          className={`home-dock__item${active === 'minigames' || popup === 'minijeux' ? ' is-on' : ''}`}
          onClick={() => {
            setActive('minigames')
            setPopup('minijeux')
          }}
        >
          <span className="home-dock__icon">
            <IconPad />
          </span>
          <span className="home-dock__label">Mini-jeux</span>
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
          className={`home-dock__item${active === 'multi' || popup === 'multi' ? ' is-on' : ''}`}
          onClick={() => {
            setActive('multi')
            setPopup('multi')
          }}
        >
          <span className="home-dock__icon">
            <IconMulti />
          </span>
          <span className="home-dock__label">Multi</span>
        </button>
      </div>
      {popups}
    </nav>
  )
}
