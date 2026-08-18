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
}

/**
 * Navigation haut-droite de l’accueil solo :
 * Multi · Mini-jeux · Vider cache
 */
export function HomeSideNav({
  onMulti,
  onMinigames,
  inRoom = false,
  roomCode = null,
  onReturnToRoom,
}: HomeSideNavProps) {
  const [cacheMsg, setCacheMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleClearCache() {
    const ok = window.confirm(
      'Vider le cache des questions ?\n\n• Solo : questions générées + historique sur cet appareil\n• Multi : historique serveur des questions déjà posées\n\nLe classement mini-jeux local n’est pas touché.\nLes salles en cours ne sont pas fermées.',
    )
    if (!ok) return

    setBusy(true)
    setCacheMsg(null)
    try {
      const local = clearLocalQuizCache()
      const remote = await clearMultiQuestionCache()
      const localN = local.banks + local.histories
      const multiN = remote.multiHistoriesCleared
      setCacheMsg(
        localN + multiN === 0
          ? 'Cache déjà vide.'
          : `Cache vidé — solo : ${local.banks} banque(s), ${local.histories} historique(s) · multi : ${multiN} thème(s).`,
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
    <aside className="home-side-nav" aria-label="Navigation">
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
      <button
        type="button"
        className="home-side-nav__btn"
        onClick={onMulti}
      >
        Multi
      </button>
      <button
        type="button"
        className="home-side-nav__btn"
        onClick={onMinigames}
      >
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
