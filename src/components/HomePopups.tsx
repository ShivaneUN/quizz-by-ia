import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { loadArcadeScores } from '../lib/arcadeStorage'
import { loadDisplayName, saveDisplayName, useSharedDisplayName } from '../lib/displayName'
import { listActiveRooms, type MultiRoomSummary } from '../lib/multiApi'
import { randomPseudo } from './MultiGate'
import type { WaitGameId } from './WaitMiniGames'
import './HomePopups.css'
import './MultiGate.css'

export type HomePopupId = 'profil' | 'minijeux' | 'multi'

function useDesktopPopup() {
  const [desktop, setDesktop] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 721px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 721px)')
    const onChange = () => setDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return desktop
}

function IconChevron() {
  return (
    <svg className="qz-sheet-chevron" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SheetRow({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: ReactNode
  label: string
  sub?: string
  onClick: () => void
}) {
  return (
    <button type="button" className="qz-sheet-row" onClick={onClick}>
      {icon}
      <div style={{ flex: 1 }}>
        <div className="qz-sheet-row-label">{label}</div>
        {sub && <div className="qz-sheet-row-sub">{sub}</div>}
      </div>
      <IconChevron />
    </button>
  )
}

function HomePopupShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const desktop = useDesktopPopup()
  const body = (
    <>
      <button type="button" className="qz-popup-back" onClick={onClose}>
        Fermer
      </button>
      <div className="qz-sheet-title">{title}</div>
      {children}
    </>
  )

  return createPortal(
    desktop ? (
      <div
        className="qz-modal-overlay"
        onClick={onClose}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div
          className="qz-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal
          aria-labelledby="qz-popup-title"
        >
          <div id="qz-popup-title" className="visually-hidden">
            {title}
          </div>
          {body}
        </div>
      </div>
    ) : (
      <>
        <div className="qz-overlay" onClick={onClose} />
        <div
          className="qz-sheet"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal
        >
          {body}
        </div>
      </>
    ),
    document.body,
  )
}

function IconUserPlus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M15 12a4 4 0 1 0-3.2-6.4A4 4 0 0 0 15 12ZM4 20v-1.2C4 16.2 8.5 15 12 15c.7 0 1.4.05 2.1.14A5 5 0 0 0 14 17.5V20H4Zm14.5-6v-2h-2v2h-2v2h2v2h2v-2h2v-2h-2Z"
      />
    </svg>
  )
}

function IconKey() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7.5 13.5A4.5 4.5 0 1 1 12 18H22v-3h-2v-2h-2v-2h-2.1A4.5 4.5 0 0 1 7.5 13.5Zm0 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
      />
    </svg>
  )
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M5 19V9h3v10H5Zm5.5 0V5h3v14h-3ZM16 19v-7h3v7h-3Z"
      />
    </svg>
  )
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2 4 5v6.5c0 5.25 3.4 10.15 8 11.5 4.6-1.35 8-6.25 8-11.5V5l-8-3Z"
      />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9H7V9Z"
      />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"
      />
    </svg>
  )
}

function IconDoor() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M10 5h9v14h-9V5Zm-5 0h3v14H5V5Zm8 6.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z"
      />
    </svg>
  )
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z"
      />
    </svg>
  )
}

function IconKeyboard() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M3 6h18v12H3V6Zm4 3h2v2H7V9Zm4 0h2v2h-2V9Zm4 0h2v2h-2V9ZM7 13h10v2H7v-2Z"
      />
    </svg>
  )
}

function IconBird() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M3 14c4-1 7-5 8-9 3 2 6 6 6 10 0 4-3 7-8 7-4 0-6-3-6-8Zm11-8 5 3-1 2-4-2V6Z"
      />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z"
      />
    </svg>
  )
}

export function PopupProfil({
  onClose,
  onOpenAdmin,
  onClearCache,
  cacheBusy,
  cacheMsg,
}: {
  onClose: () => void
  onOpenAdmin: () => void
  onClearCache: () => void
  cacheBusy?: boolean
  cacheMsg?: string | null
}) {
  const [view, setView] = useState<'menu' | 'create' | 'recover' | 'stats'>(
    'menu',
  )
  const [name, setName] = useState(() => loadDisplayName())
  const [msg, setMsg] = useState<string | null>(null)
  const scores = loadArcadeScores()
  const saved = loadDisplayName()

  function submitName(e: FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    const next = saveDisplayName(name)
    if (next.length < 2) {
      setMsg('Choisis un pseudo (2 caractères min.)')
      return
    }
    setMsg(
      view === 'recover'
        ? `Pseudo repris : ${next}`
        : `Profil enregistré : ${next}`,
    )
    setView('menu')
  }

  return (
    <HomePopupShell title="Profil" onClose={onClose}>
      {view === 'menu' && (
        <>
          <SheetRow
            icon={<IconUserPlus />}
            label="Créer un profil"
            sub="Choisis juste un pseudo"
            onClick={() => {
              setMsg(null)
              setView('create')
            }}
          />
          <SheetRow
            icon={<IconKey />}
            label="Récupérer un profil"
            sub="Avec le pseudo déjà utilisé"
            onClick={() => {
              setMsg(null)
              setView('recover')
            }}
          />
          <SheetRow
            icon={<IconChart />}
            label="Mon profil"
            sub={saved ? saved : 'Statistiques et historique'}
            onClick={() => setView('stats')}
          />
          <div className="qz-sheet-divider" />
          <SheetRow
            icon={<IconShield />}
            label="Espace admin"
            sub="Profil administrateur"
            onClick={() => {
              onClose()
              onOpenAdmin()
            }}
          />
          <SheetRow
            icon={<IconTrash />}
            label={cacheBusy ? 'Vidage…' : 'Vider le cache'}
            onClick={onClearCache}
          />
          {(msg || cacheMsg) && (
            <p className="qz-sheet-row-sub">{msg || cacheMsg}</p>
          )}
        </>
      )}
      {(view === 'create' || view === 'recover') && (
        <form className="qz-popup-form" onSubmit={submitName}>
          <button
            type="button"
            className="qz-popup-back"
            onClick={() => setView('menu')}
          >
            ← Retour
          </button>
          <label htmlFor="qz-profile-name">
            {view === 'recover'
              ? 'Pseudo déjà utilisé sur cet appareil'
              : 'Choisis un pseudo'}
          </label>
          <input
            id="qz-profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. TurboPanda42"
            maxLength={24}
            autoComplete="nickname"
          />
          <div className="qz-popup-actions">
            <button type="submit" className="btn btn--primary">
              Enregistrer
            </button>
          </div>
          {msg && <p className="qz-sheet-row-sub">{msg}</p>}
        </form>
      )}
      {view === 'stats' && (
        <div className="qz-popup-stats">
          <button
            type="button"
            className="qz-popup-back"
            onClick={() => setView('menu')}
          >
            ← Retour
          </button>
          <p>
            Pseudo : <strong>{saved || 'pas encore défini'}</strong>
          </p>
          <p>
            Frappe : <strong>{scores.typingBest}</strong>
          </p>
          <p>
            Flappy : <strong>{scores.flappyBest}</strong>
          </p>
          <p>
            Pendu : <strong>{scores.penduBest}</strong>
          </p>
        </div>
      )}
    </HomePopupShell>
  )
}

export function PopupMulti({
  onClose,
  onCreateRoom,
  onJoinRoom,
  onReturnToRoom,
  inRoom,
  roomCode,
  busy,
  error,
}: {
  onClose: () => void
  onCreateRoom: (playerName: string) => void
  onJoinRoom: (code: string, playerName: string) => void
  onReturnToRoom?: () => void
  inRoom?: boolean
  roomCode?: string | null
  busy?: boolean
  error?: string | null
}) {
  const [view, setView] = useState<'menu' | 'create' | 'join' | 'list'>('menu')
  const { name, setName, commit } = useSharedDisplayName()
  const [code, setCode] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [rooms, setRooms] = useState<MultiRoomSummary[]>([])
  const [listStatus, setListStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  )

  useEffect(() => {
    if (view !== 'list') return
    let cancelled = false
    setListStatus('loading')
    void (async () => {
      try {
        const res = await listActiveRooms()
        if (cancelled) return
        setRooms(res.rooms)
        setListStatus('ready')
      } catch (e) {
        if (cancelled) return
        setRooms([])
        setListStatus('error')
        setLocalError(e instanceof Error ? e.message : 'Impossible de lister les salles')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view])

  const trimmedName = name.trim()

  function submitCreate(e: FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    if (trimmedName.length < 2) {
      setLocalError('Choisis un pseudo (2 caractères min.)')
      return
    }
    setLocalError(null)
    commit(trimmedName)
    onCreateRoom(trimmedName)
  }

  function submitJoin(e: FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    if (trimmedName.length < 2) {
      setLocalError('Choisis un pseudo (2 caractères min.)')
      return
    }
    if (code.trim().length < 4) {
      setLocalError('Entre le code de la salle')
      return
    }
    setLocalError(null)
    commit(trimmedName)
    onJoinRoom(code.trim().toUpperCase(), trimmedName)
  }

  function joinListed(listed: MultiRoomSummary) {
    if (busy) return
    if (inRoom && roomCode === listed.code && onReturnToRoom) {
      onClose()
      onReturnToRoom()
      return
    }
    const pseudo =
      trimmedName.length >= 2 ? trimmedName : randomPseudo()
    if (trimmedName.length < 2) setName(pseudo)
    setLocalError(null)
    commit(pseudo)
    onJoinRoom(listed.code, pseudo)
  }

  function roomStatusLabel(status: MultiRoomSummary['status']) {
    if (status === 'generating') return 'Génération'
    if (status === 'playing') return 'En jeu'
    if (status === 'finished') return 'Terminé'
    if (status === 'error') return 'Erreur'
    return 'Lobby'
  }

  const title =
    view === 'create'
      ? 'Créer une partie'
      : view === 'join'
        ? 'Rejoindre une partie'
        : view === 'list'
          ? 'Parties en cours'
          : 'Multijoueur'

  return (
    <HomePopupShell title={title} onClose={onClose}>
      {view === 'menu' && (
        <>
          <SheetRow
            icon={<IconPlus />}
            label="Créer une partie"
            sub="Invite jusqu'à 8 joueurs"
            onClick={() => {
              setLocalError(null)
              setView('create')
            }}
          />
          <SheetRow
            icon={<IconDoor />}
            label="Rejoindre une partie"
            sub="Avec un code de salon"
            onClick={() => {
              setLocalError(null)
              setView('join')
            }}
          />
          <SheetRow
            icon={<IconList />}
            label="Parties en cours"
            sub="Salles ouvertes, un clic pour rejoindre"
            onClick={() => {
              setLocalError(null)
              setView('list')
            }}
          />
        </>
      )}

      {view !== 'menu' && (
        <button
          type="button"
          className="qz-popup-back"
          onClick={() => {
            setLocalError(null)
            setView('menu')
          }}
        >
          ← Retour
        </button>
      )}

      {view === 'create' && (
        <form className="multi-gate__form" onSubmit={submitCreate}>
          <div className="multi-gate__name">
            <label htmlFor="qz-multi-pseudo">
              <span>Pseudo (obligatoire)</span>
              <input
                id="qz-multi-pseudo"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (localError) setLocalError(null)
                }}
                placeholder="Ex. Alex"
                maxLength={24}
                autoComplete="nickname"
                required
                minLength={2}
              />
            </label>
            <button
              type="button"
              className="multi-gate__random"
              disabled={busy}
              onClick={() => {
                setName(randomPseudo())
                setLocalError(null)
              }}
            >
              Pseudo aléatoire
            </button>
          </div>
          {localError && (
            <p className="multi-gate__error" role="alert">
              {localError}
            </p>
          )}
          <button type="submit" className="btn btn--primary" disabled={busy || trimmedName.length < 2}>
            {busy ? '…' : 'Choisir le thème'}
          </button>
        </form>
      )}

      {view === 'join' && (
        <form className="multi-gate__form" onSubmit={submitJoin}>
          <div className="multi-gate__name">
            <label htmlFor="qz-multi-join-pseudo">
              <span>Pseudo (obligatoire)</span>
              <input
                id="qz-multi-join-pseudo"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (localError) setLocalError(null)
                }}
                placeholder="Ex. Alex"
                maxLength={24}
                autoComplete="nickname"
                required
                minLength={2}
              />
            </label>
            <button
              type="button"
              className="multi-gate__random"
              disabled={busy}
              onClick={() => {
                setName(randomPseudo())
                setLocalError(null)
              }}
            >
              Pseudo aléatoire
            </button>
          </div>
          <label>
            <span>Code de la salle</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
          <p className="multi-gate__hint">
            Tu peux rejoindre même si la partie a déjà commencé.
          </p>
          {(localError || error) && (
            <p className="multi-gate__error" role="alert">
              {localError || error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy || trimmedName.length < 2 || code.trim().length < 4}
          >
            {busy ? '…' : 'Rejoindre'}
          </button>
        </form>
      )}

      {view === 'list' && (
        <div className="qz-room-list" aria-live="polite">
          {listStatus === 'loading' && (
            <p className="multi-gate__hint">Recherche des salles…</p>
          )}
          {listStatus === 'ready' && rooms.length === 0 && (
            <p className="multi-gate__hint">Aucune partie en cours.</p>
          )}
          {rooms.map((listed) => {
            const mine = Boolean(inRoom && roomCode === listed.code)
            const full = listed.playerCount >= 8 && !mine
            return (
              <div key={listed.code} className="qz-room-card">
                <div className="qz-room-card__top">
                  <p className="qz-room-card__code">{listed.code}</p>
                  <span className="qz-room-card__status">
                    {roomStatusLabel(listed.status)}
                  </span>
                </div>
                <p className="qz-room-card__meta">
                  {listed.theme || 'Thème à venir'}
                  {' · '}
                  {listed.playerCount} joueur{listed.playerCount > 1 ? 's' : ''}
                  {listed.hostName ? ` · ${listed.hostName}` : ''}
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy || full}
                  onClick={() => joinListed(listed)}
                >
                  {busy
                    ? '…'
                    : mine
                      ? 'Retour à la salle'
                      : full
                        ? 'Salle pleine'
                        : 'Rejoindre'}
                </button>
              </div>
            )
          })}
          {(localError || error) && (
            <p className="multi-gate__error" role="alert">
              {localError || error}
            </p>
          )}
        </div>
      )}
    </HomePopupShell>
  )
}

export function PopupMiniJeux({
  onClose,
  onPickGame,
}: {
  onClose: () => void
  onPickGame: (game: WaitGameId) => void
}) {
  const [view, setView] = useState<'menu' | 'scores'>('menu')
  const scores = loadArcadeScores()

  return (
    <HomePopupShell
      title={view === 'scores' ? 'Scores' : 'Mini-jeux'}
      onClose={onClose}
    >
      {view === 'menu' && (
        <>
          <SheetRow
            icon={<IconKeyboard />}
            label="Duel de frappe"
            sub="Tape les mots le plus vite possible"
            onClick={() => {
              onClose()
              onPickGame('typing')
            }}
          />
          <SheetRow
            icon={<IconBird />}
            label="Flappy"
            sub="Tape pour voler entre les tuyaux"
            onClick={() => {
              onClose()
              onPickGame('flappy')
            }}
          />
          <SheetRow
            icon={<IconGrid />}
            label="Morpion"
            sub="Vs IA — un joueur peut rejoindre"
            onClick={() => {
              onClose()
              onPickGame('morpion')
            }}
          />
          <div className="qz-sheet-divider" />
          <SheetRow
            icon={<IconChart />}
            label="Tous les mini-jeux"
            sub="Scores et records locaux"
            onClick={() => setView('scores')}
          />
        </>
      )}
      {view === 'scores' && (
        <div className="qz-popup-stats">
          <button
            type="button"
            className="qz-popup-back"
            onClick={() => setView('menu')}
          >
            ← Retour
          </button>
          <div className="qz-score-row">
            <span>Duel de frappe</span>
            <strong>
              {scores.typingBest > 0 ? scores.typingBest : '—'}
            </strong>
          </div>
          <div className="qz-score-row">
            <span>Flappy</span>
            <strong>
              {scores.flappyBest > 0 ? scores.flappyBest : '—'}
            </strong>
          </div>
          <div className="qz-score-row">
            <span>Pendu</span>
            <strong>
              {scores.penduBest > 0 ? scores.penduBest : '—'}
            </strong>
          </div>
          <div className="qz-score-row">
            <span>Morpion</span>
            <strong>—</strong>
          </div>
        </div>
      )}
    </HomePopupShell>
  )
}
