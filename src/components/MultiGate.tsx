import { useEffect, useState, type FormEvent } from 'react'
import { pollRoom } from '../lib/multiApi'
import { useSharedDisplayName } from '../lib/displayName'
import {
  clearLastMultiRoom,
  loadLastMultiRoom,
  type LastMultiRoom,
} from '../lib/multiSession'
import './MultiGate.css'

const RANDOM_ADJECTIVES = [
  'Rapide',
  'Fou',
  'Cool',
  'Sauvage',
  'Éclair',
  'Royal',
  'Ninja',
  'Turbo',
  'Lucky',
  'Cosmic',
  'Funky',
  'Sharp',
  'Brave',
  'Magic',
  'Ultra',
  'Pixel',
  'Golden',
  'Silent',
  'Crazy',
  'Epic',
]

const RANDOM_NOUNS = [
  'Panda',
  'Tigre',
  'Falcon',
  'Dragon',
  'Lynx',
  'Phoenix',
  'Wolf',
  'Fox',
  'Shark',
  'Eagle',
  'Comet',
  'Viper',
  'Lion',
  'Bear',
  'Owl',
  'Raven',
  'Bolt',
  'Storm',
  'Nova',
  'Ace',
]

export function randomPseudo(): string {
  const adj =
    RANDOM_ADJECTIVES[Math.floor(Math.random() * RANDOM_ADJECTIVES.length)]!
  const noun =
    RANDOM_NOUNS[Math.floor(Math.random() * RANDOM_NOUNS.length)]!
  const n = Math.floor(Math.random() * 90) + 10
  return `${adj}${noun}${n}`.slice(0, 24)
}

interface MultiGateProps {
  onCreate: (playerName: string) => void
  onJoin: (code: string, playerName: string) => void
  onBack: () => void
  busy?: boolean
  error?: string | null
}

type LastStatus = 'idle' | 'checking' | 'active' | 'gone'

export function MultiGate({
  onCreate,
  onJoin,
  onBack,
  busy,
  error,
}: MultiGateProps) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const { name, setName, commit } = useSharedDisplayName()
  const [code, setCode] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [lastRoom, setLastRoom] = useState<LastMultiRoom | null>(null)
  const [lastStatus, setLastStatus] = useState<LastStatus>('idle')

  useEffect(() => {
    const saved = loadLastMultiRoom()
    if (!saved) return
    setLastRoom(saved)
    setLastStatus('checking')
    let cancelled = false
    ;(async () => {
      try {
        await pollRoom(saved.code)
        if (!cancelled) setLastStatus('active')
      } catch {
        if (!cancelled) setLastStatus('gone')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const trimmedName = name.trim()
  const canSubmit =
    !busy &&
    trimmedName.length >= 2 &&
    (tab === 'create' || code.trim().length >= 4)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (trimmedName.length < 2) {
      setLocalError('Choisis un pseudo (2 caractères min.)')
      return
    }
    setLocalError(null)
    commit(trimmedName)
    if (tab === 'create') onCreate(trimmedName)
    else onJoin(code.trim().toUpperCase(), trimmedName)
  }

  function rejoinLast() {
    if (!lastRoom || busy || lastStatus !== 'active') return
    const pseudo = trimmedName.length >= 2 ? trimmedName : lastRoom.playerName
    setLocalError(null)
    commit(pseudo)
    onJoin(lastRoom.code, pseudo)
  }

  function dismissLast() {
    clearLastMultiRoom()
    setLastRoom(null)
    setLastStatus('idle')
  }

  return (
    <section className="multi-gate">
      <button type="button" className="multi-gate__back" onClick={onBack}>
        ← Retour
      </button>
      <h2 className="multi-gate__title">Multijoueur</h2>

      {lastRoom && (
        <div className="multi-gate__last" aria-live="polite">
          <p className="multi-gate__last-label">Dernière salle</p>
          <p className="multi-gate__last-code">{lastRoom.code}</p>
          {lastRoom.theme && (
            <p className="multi-gate__last-theme">{lastRoom.theme}</p>
          )}
          {lastStatus === 'checking' && (
            <p className="multi-gate__hint">Vérification…</p>
          )}
          {lastStatus === 'active' && (
            <>
              <p className="multi-gate__hint">
                La salle est encore active — tu peux y retourner.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={rejoinLast}
              >
                {busy ? '…' : `Rejoindre ${lastRoom.code}`}
              </button>
            </>
          )}
          {lastStatus === 'gone' && (
            <>
              <p className="multi-gate__error" role="alert">
                Cette salle n’existe plus ou n’est plus active.
              </p>
              <button
                type="button"
                className="multi-gate__last-dismiss"
                disabled={busy}
                onClick={dismissLast}
              >
                Effacer
              </button>
            </>
          )}
        </div>
      )}

      <div className="multi-gate__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === 'create' ? 'is-active' : ''}
          aria-selected={tab === 'create'}
          onClick={() => setTab('create')}
        >
          Créer une salle
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'join' ? 'is-active' : ''}
          aria-selected={tab === 'join'}
          onClick={() => setTab('join')}
        >
          Rejoindre
        </button>
      </div>

      <form className="multi-gate__form" onSubmit={submit}>
        <div className="multi-gate__name">
          <label htmlFor="multi-pseudo">
            <span>Pseudo (obligatoire)</span>
            <input
              id="multi-pseudo"
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

        {tab === 'join' && (
          <>
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
          </>
        )}

        {(localError || error) && (
          <p className="multi-gate__error" role="alert">
            {localError || error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn--primary"
          disabled={!canSubmit}
        >
          {busy
            ? '…'
            : tab === 'create'
              ? 'Choisir le thème'
              : 'Rejoindre'}
        </button>
      </form>
    </section>
  )
}
