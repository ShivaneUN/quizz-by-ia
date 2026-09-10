import { useCallback, useEffect, useState } from 'react'
import {
  closeRoom,
  listActiveRooms,
  type MultiRoomSummary,
} from '../lib/multiApi'

export function RoomsAdminPanel({ secret }: { secret: string }) {
  const [rooms, setRooms] = useState<MultiRoomSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listActiveRooms({ secret })
      setRooms(res.rooms)
    } catch (e) {
      setRooms([])
      setError(e instanceof Error ? e.message : 'Impossible de lister')
    } finally {
      setLoading(false)
    }
  }, [secret])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleDelete(code: string) {
    if (!window.confirm(`Supprimer la salle ${code} ?`)) return
    setBusyCode(code)
    setError(null)
    try {
      await closeRoom({ code, secret })
      setRooms((prev) => prev.filter((r) => r.code !== code))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible')
    } finally {
      setBusyCode(null)
    }
  }

  function statusLabel(status: MultiRoomSummary['status']) {
    if (status === 'generating') return 'Génération'
    if (status === 'playing') return 'En jeu'
    if (status === 'finished') return 'Terminé'
    if (status === 'error') return 'Erreur'
    return 'Lobby'
  }

  return (
    <div className="admin-panel__section">
      <p className="admin-panel__tab-help">
        Seul l’hôte ou l’admin peut fermer une salle. Vide depuis 60&nbsp;s →
        suppression auto.
      </p>
      <div className="admin-panel__toolbar">
        <button
          type="button"
          className="btn btn--primary"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? '…' : 'Rafraîchir'}
        </button>
      </div>
      <p className="admin-panel__meta">{rooms.length} salle(s)</p>
      {error && (
        <p className="admin-panel__error" role="alert">
          {error}
        </p>
      )}
      {rooms.length === 0 && !loading ? (
        <p className="admin-panel__empty">Aucune salle active</p>
      ) : (
        <ul className="admin-curated-group__list">
          {rooms.map((r) => (
            <li key={r.code} className="admin-curated-q">
              <div className="admin-curated-q__body">
                <p className="admin-curated-q__text">
                  <code>{r.code}</code> · {r.theme || '—'}
                </p>
                <p className="admin-curated-q__meta">
                  {statusLabel(r.status)} · {r.playerCount} joueur
                  {r.playerCount === 1 ? '' : 's'} · hôte {r.hostName}
                  {r.quizMode === 'pendu'
                    ? ' · Pendu'
                    : r.quizMode === 'audio'
                      ? ' · Deezer'
                      : ''}
                </p>
              </div>
              <button
                type="button"
                className="admin-panel__danger"
                disabled={busyCode === r.code}
                onClick={() => void handleDelete(r.code)}
              >
                {busyCode === r.code ? '…' : 'Supprimer'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
