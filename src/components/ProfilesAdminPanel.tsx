import { useCallback, useEffect, useState } from 'react'

interface ProfileSummary {
  profileId: string
  pseudo: string
  recoveryCode: string
  createdAt: number
  lastUsedAt: number
  usageCount: number
  hasStats: boolean
  isAdmin?: boolean
}

function formatAge(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24))
  if (days < 1) return "aujourd'hui"
  if (days === 1) return '1 jour'
  return `${days} jours`
}

export function ProfilesAdminPanel({ secret }: { secret: string }) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'createdAt' | 'usageCount'>('createdAt')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/calib-stats?secret=${encodeURIComponent(secret)}&action=profiles&limit=200`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Erreur ${res.status}`,
        )
      }
      setProfiles(Array.isArray(data.profiles) ? data.profiles : [])
    } catch (e) {
      setProfiles([])
      setError(e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [secret])

  useEffect(() => {
    void load()
  }, [load])

  const handleDelete = async (profileId: string) => {
    if (!confirm('Supprimer définitivement ce profil ?')) return
    const res = await fetch('/api/calib-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'deleteProfile',
        secret,
        profileId,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(
        typeof data.error === 'string' ? data.error : 'Suppression impossible',
      )
      return
    }
    void load()
  }

  const visible = profiles.filter((p) => !p.isAdmin && p.pseudo.trim().toLowerCase() !== 'admin')
  const sorted = [...visible].sort((a, b) =>
    sortBy === 'createdAt' ? a.createdAt - b.createdAt : a.usageCount - b.usageCount,
  )

  if (loading) return <p className="admin-panel__empty">Chargement…</p>

  return (
    <div className="admin-panel__section">
      <p className="admin-panel__tab-help">
        Tous les profils et leur code de récupération. Un profil inactif n’a
        aucune partie enregistrée.
      </p>
      <p className="admin-panel__meta">{sorted.length} profil(s)</p>
      <div className="admin-panel__toolbar">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setSortBy('createdAt')}
        >
          Ancienneté
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setSortBy('usageCount')}
        >
          Utilisation
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => void load()}>
          Rafraîchir
        </button>
      </div>
      {error && (
        <p className="admin-panel__error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-panel__ai-table-wrap">
        <table className="admin-panel__ai-table">
          <thead>
            <tr>
              <th>Pseudo</th>
              <th>Code</th>
              <th>Créé</th>
              <th>Vu</th>
              <th>Usage</th>
              <th>Stats</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.profileId}
                className={p.usageCount === 0 ? 'profile-row-dead' : ''}
              >
                <td>
                  <strong>{p.pseudo}</strong>
                </td>
                <td>
                  <code className="admin-profile-code">
                    {p.recoveryCode || '—'}
                  </code>
                </td>
                <td>{formatAge(p.createdAt)}</td>
                <td>{formatAge(p.lastUsedAt)}</td>
                <td>{p.usageCount}</td>
                <td>{p.hasStats ? 'Oui' : 'Non'}</td>
                <td>
                  <button
                    type="button"
                    className="admin-panel__danger"
                    onClick={() => void handleDelete(p.profileId)}
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && !error && (
        <p className="admin-panel__empty">Aucun profil</p>
      )}
    </div>
  )
}
