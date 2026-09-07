import { useEffect, useState } from 'react'
import { randomPseudo } from './MultiGate'
import { useSharedDisplayName } from '../lib/displayName'
import { useLockedPseudo } from '../hooks/useProfile'
import {
  createMorpionRoom,
  joinMorpionRoom,
  listMorpionRooms,
  type MorpionSummary,
} from '../lib/morpionApi'
import './MorpionLobby.css'

export interface MorpionEnterPayload {
  room: import('../lib/morpionApi').MorpionRoom
  playerId: string
  playerName: string
}

interface MorpionLobbyProps {
  onEnter: (payload: MorpionEnterPayload) => void
  resume?: MorpionEnterPayload | null
  onResume?: () => void
  defaultName?: string
}

export function MorpionLobby({
  onEnter,
  resume,
  onResume,
  defaultName,
}: MorpionLobbyProps) {
  const lockedPseudo = useLockedPseudo()
  const { name, setName, commit } = useSharedDisplayName(
    lockedPseudo || resume?.playerName || defaultName || '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joinable, setJoinable] = useState<MorpionSummary[]>([])
  const [active, setActive] = useState<MorpionSummary[]>([])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const lists = await listMorpionRooms()
        if (cancelled) return
        setJoinable(lists.joinable)
        setActive(lists.active)
      } catch {
        /* poll best-effort */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 1500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const trimmed = (lockedPseudo ?? name).trim()
  const canPlay = !busy && trimmed.length >= 2

  async function handleCreate() {
    if (!canPlay) {
      setError('Choisis un pseudo (2 caractères min.)')
      return
    }
    setBusy(true)
    setError(null)
    try {
      commit(trimmed)
      const res = await createMorpionRoom(trimmed)
      onEnter({
        room: res.room,
        playerId: res.playerId,
        playerName: trimmed,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(code: string) {
    if (!canPlay) {
      setError('Choisis un pseudo (2 caractères min.)')
      return
    }
    setBusy(true)
    setError(null)
    try {
      commit(trimmed)
      const res = await joinMorpionRoom(code, trimmed)
      onEnter({
        room: res.room,
        playerId: res.playerId,
        playerName: trimmed,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="morpion-lobby">
      {resume && onResume && (
        <button
          type="button"
          className="morpion-lobby__resume"
          onClick={onResume}
        >
          Reprendre {resume.room.code}
        </button>
      )}

      <label className="morpion-lobby__name">
        <span>Pseudo</span>
        {lockedPseudo ? (
          <p className="morpion-lobby__locked">{lockedPseudo}</p>
        ) : (
          <div className="morpion-lobby__name-row">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError(null)
              }}
              placeholder="Ex. Alex"
              maxLength={24}
              autoComplete="nickname"
              minLength={2}
            />
            <button
              type="button"
              className="morpion-lobby__random"
              disabled={busy}
              onClick={() => {
                setName(randomPseudo())
                setError(null)
              }}
            >
              Aléatoire
            </button>
          </div>
        )}
      </label>

      <button
        type="button"
        className="btn btn--primary morpion-lobby__create"
        disabled={!canPlay}
        onClick={() => void handleCreate()}
      >
        {busy ? '…' : 'Nouvelle partie vs IA'}
      </button>

      {error && (
        <p className="morpion-lobby__error" role="alert">
          {error}
        </p>
      )}

      <section className="morpion-lobby__list" aria-live="polite">
        <h3>Rejoindre</h3>
        {joinable.length === 0 ? (
          <p className="morpion-lobby__empty">Aucune salle vs IA pour l’instant.</p>
        ) : (
          <ul>
            {joinable.map((s) => (
              <li key={s.code}>
                <div>
                  <span className="morpion-lobby__code">{s.code}</span>
                  <span className="morpion-lobby__meta">
                    {s.hostName} vs IA
                    {s.status === 'en_cours' ? ' · en cours' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="morpion-lobby__join"
                  disabled={!canPlay}
                  onClick={() => void handleJoin(s.code)}
                >
                  Rejoindre
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {active.length > 0 && (
        <section className="morpion-lobby__list morpion-lobby__list--busy">
          <h3>En cours</h3>
          <ul>
            {active.map((s) => (
              <li key={s.code}>
                <div>
                  <span className="morpion-lobby__code">{s.code}</span>
                  <span className="morpion-lobby__meta">
                    {s.hostName} vs {s.opponentLabel} · complète
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
