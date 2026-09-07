import { useState, type ReactNode } from 'react'
import { loadArcadeScores } from '../lib/arcadeStorage'
import { isAdminProfile, isClientAdminCode, rememberAdminProfileId, rememberLocalAdminUnlock } from '../lib/adminCode'
import { useProfile, type MiniGameStats, type QuizScoreEntry } from '../hooks/useProfile'
import { DIFFICULTY_LABELS, type Difficulty } from '../types'

function difficultyLabel(value: string): string {
  if (value === 'easy' || value === 'medium' || value === 'hard') {
    return DIFFICULTY_LABELS[value as Difficulty]
  }
  return value
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return ''
  }
}

function MiniStat({
  label,
  stats,
}: {
  label: string
  stats: MiniGameStats
}) {
  return (
    <div className="qz-score-row">
      <span>{label}</span>
      <strong>
        {stats.parties > 0
          ? `${stats.victoires}/${stats.parties}`
          : '—'}
        {stats.meilleurScore != null && stats.meilleurScore > 0
          ? ` · ${stats.meilleurScore}`
          : ''}
      </strong>
    </div>
  )
}

function recentQuiz(entries: QuizScoreEntry[]): QuizScoreEntry[] {
  return [...entries].sort((a, b) => b.date - a.date).slice(0, 8)
}

export function ProfileSpace({
  listFooter,
  onClose,
}: {
  listFooter?: ReactNode
  onClose?: () => void
}) {
  const {
    profiles,
    activeProfileId,
    activeProfile,
    loading,
    createProfile,
    recoverProfile,
    switchProfile,
    playWithoutProfile,
    updatePseudo,
    removeFromDevice,
    deleteForever,
  } = useProfile()

  const [mode, setMode] = useState<'list' | 'create' | 'recover' | 'detail'>(
    'list',
  )
  const [pseudoInput, setPseudoInput] = useState('')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null)
  const [editingPseudo, setEditingPseudo] = useState(false)
  const [pseudoEdit, setPseudoEdit] = useState('')
  const [copied, setCopied] = useState(false)
  const arcade = loadArcadeScores()

  const handleCreate = async () => {
    setError(null)
    if (pseudoInput.trim().length < 2) {
      setError('Choisis un pseudo (2 caractères min.)')
      return
    }
    setBusy(true)
    try {
      const profile = await createProfile(pseudoInput.trim())
      setNewRecoveryCode(profile.recoveryCode)
      setPseudoInput('')
      setMode('detail')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création')
    } finally {
      setBusy(false)
    }
  }

  const handleRecover = async () => {
    setError(null)
    const code = recoveryInput.trim()
    if (!code) {
      setError('Entre un code de récupération')
      return
    }
    if (isClientAdminCode(code)) {
      setBusy(true)
      try {
        rememberLocalAdminUnlock()
        const profile = await recoverProfile(code)
        rememberAdminProfileId(profile.profileId)
        setRecoveryInput('')
        window.dispatchEvent(
          new CustomEvent('quizz:open-admin', { detail: { unlock: true } }),
        )
        onClose?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Code invalide')
      } finally {
        setBusy(false)
      }
      return
    }
    setBusy(true)
    try {
      await recoverProfile(code)
      setNewRecoveryCode(null)
      setRecoveryInput('')
      setMode('detail')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Code invalide')
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteForever = async (profileId: string) => {
    if (
      !confirm(
        'Cette action est irréversible. Le profil et ses scores seront perdus définitivement. Continuer ?',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await deleteForever(profileId)
      setNewRecoveryCode(null)
      setMode('list')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible')
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveFromDevice = (profileId: string) => {
    if (
      !confirm(
        'Retirer ce profil de cet appareil ? Tu pourras le récupérer plus tard avec son code.',
      )
    ) {
      return
    }
    removeFromDevice(profileId)
    setNewRecoveryCode(null)
    setMode('list')
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Impossible de copier le code')
    }
  }

  if (loading) {
    return <p className="qz-sheet-row-sub">Chargement des profils…</p>
  }

  if (mode === 'create') {
    return (
      <form
        className="qz-popup-form"
        onSubmit={(e) => {
          e.preventDefault()
          void handleCreate()
        }}
      >
        <button
          type="button"
          className="qz-popup-back"
          onClick={() => {
            setError(null)
            setMode('list')
          }}
        >
          ← Retour
        </button>
        <label htmlFor="qz-profile-create">Choisis un pseudo</label>
        <input
          id="qz-profile-create"
          value={pseudoInput}
          onChange={(e) => setPseudoInput(e.target.value)}
          placeholder="Ex. TurboPanda42"
          maxLength={24}
          autoComplete="nickname"
        />
        {error && (
          <p className="qz-sheet-row-sub" role="alert">
            {error}
          </p>
        )}
        <div className="qz-popup-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy}
          >
            {busy ? '…' : 'Créer'}
          </button>
        </div>
      </form>
    )
  }

  if (mode === 'recover') {
    return (
      <form
        className="qz-popup-form"
        onSubmit={(e) => {
          e.preventDefault()
          void handleRecover()
        }}
      >
        <button
          type="button"
          className="qz-popup-back"
          onClick={() => {
            setError(null)
            setMode('list')
          }}
        >
          ← Retour
        </button>
        <label htmlFor="qz-profile-recover">Code de récupération</label>
        <input
          id="qz-profile-recover"
          value={recoveryInput}
          onChange={(e) => setRecoveryInput(e.target.value.toUpperCase())}
          placeholder="XXXXXX"
          autoCapitalize="characters"
          spellCheck={false}
        />
        {error && (
          <p className="qz-sheet-row-sub" role="alert">
            {error}
          </p>
        )}
        <div className="qz-popup-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy}
          >
            {busy ? '…' : 'Récupérer'}
          </button>
        </div>
      </form>
    )
  }

  if (mode === 'detail' && activeProfile) {
    const isAdmin = isAdminProfile(activeProfile)
    const quiz = isAdmin ? [] : recentQuiz(activeProfile.scores.quiz)
    return (
      <div className="qz-popup-stats">
        <button
          type="button"
          className="qz-popup-back"
          onClick={() => {
            setEditingPseudo(false)
            setMode('list')
          }}
        >
          ← Retour
        </button>

        {!isAdmin && newRecoveryCode && (
          <p className="qz-profile-notice">
            Note ce code, il permet de récupérer le profil sur un autre
            appareil : <strong>{newRecoveryCode}</strong>
          </p>
        )}

        {editingPseudo ? (
          <form
            className="qz-popup-form"
            onSubmit={(e) => {
              e.preventDefault()
              void updatePseudo(pseudoEdit)
                .then(() => setEditingPseudo(false))
                .catch((err: unknown) => {
                  setError(
                    err instanceof Error ? err.message : 'Pseudo invalide',
                  )
                })
            }}
          >
            <label htmlFor="qz-profile-edit">Pseudo</label>
            <input
              id="qz-profile-edit"
              value={pseudoEdit}
              onChange={(e) => {
                setPseudoEdit(e.target.value)
                if (error) setError(null)
              }}
              maxLength={24}
            />
            {error && (
              <p className="qz-sheet-row-sub" role="alert">
                {error}
              </p>
            )}
            <div className="qz-popup-actions">
              <button type="submit" className="btn btn--primary">
                Valider
              </button>
            </div>
          </form>
        ) : (
          <div className="qz-score-row">
            <span>Pseudo</span>
            <strong>
              {activeProfile.pseudo}{' '}
              <button
                type="button"
                className="qz-profile-inline"
                onClick={() => {
                  setError(null)
                  setPseudoEdit(activeProfile.pseudo)
                  setEditingPseudo(true)
                }}
              >
                Modifier
              </button>
            </strong>
          </div>
        )}

        {!isAdmin && (
          <>
            <div className="qz-score-row">
              <span>Code</span>
              <strong>
                {activeProfile.recoveryCode}{' '}
                <button
                  type="button"
                  className="qz-profile-inline"
                  onClick={() => void copyCode(activeProfile.recoveryCode)}
                >
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </strong>
            </div>

            <MiniStat label="Drapeaux" stats={activeProfile.scores.flagQuiz} />
            <div className="qz-score-row">
              <span>Frappe (local)</span>
              <strong>
                {arcade.typingBest > 0 ? arcade.typingBest : '—'}
              </strong>
            </div>
            <div className="qz-score-row">
              <span>Flappy (local)</span>
              <strong>
                {arcade.flappyBest > 0 ? arcade.flappyBest : '—'}
              </strong>
            </div>

            {quiz.length > 0 && (
              <div className="qz-profile-quiz">
                <p className="qz-sheet-row-label">Derniers quiz</p>
                {quiz.map((entry, i) => (
                  <div
                    key={`${entry.date}-${entry.theme}-${i}`}
                    className="qz-score-row"
                  >
                    <span>
                      {entry.theme}
                      <small className="qz-profile-quiz-meta">
                        {' '}
                        · {difficultyLabel(entry.difficulty)} ·{' '}
                        {formatDate(entry.date)}
                      </small>
                    </span>
                    <strong>{entry.score}</strong>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {error && (
          <p className="qz-sheet-row-sub" role="alert">
            {error}
          </p>
        )}

        <div className="qz-popup-actions qz-profile-actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => handleRemoveFromDevice(activeProfile.profileId)}
            disabled={busy}
          >
            Retirer de cet appareil
          </button>
          {!isAdminProfile(activeProfile) && (
            <button
              type="button"
              className="btn qz-profile-danger"
              onClick={() => void handleDeleteForever(activeProfile.profileId)}
              disabled={busy}
            >
              Supprimer définitivement
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {profiles.length === 0 && (
        <p className="qz-sheet-row-sub">Aucun profil sur cet appareil.</p>
      )}
      <button
        type="button"
        className={`qz-sheet-row${!activeProfileId ? ' is-on' : ''}`}
        onClick={() => {
          playWithoutProfile()
          setNewRecoveryCode(null)
        }}
      >
        <div style={{ flex: 1 }}>
          <div className="qz-sheet-row-label">Jouer sans profil</div>
          <div className="qz-sheet-row-sub">
            {!activeProfileId
              ? 'Actif — pseudo demandé seulement si besoin'
              : 'Pseudo demandé au chat, multi, morpion…'}
          </div>
        </div>
      </button>
      {profiles.map((p) => {
        const isActive = p.profileId === activeProfileId
        return (
          <div
            key={p.profileId}
            className={`qz-sheet-row qz-profile-pick${isActive ? ' is-on' : ''}`}
          >
            <button
              type="button"
              className="qz-profile-pick__main"
              onClick={() => {
                switchProfile(p.profileId)
                setNewRecoveryCode(null)
              }}
            >
              <div className="qz-sheet-row-label">{p.pseudo}</div>
              <div className="qz-sheet-row-sub">
                {isActive ? 'Profil actif' : 'Appuie pour choisir'}
              </div>
            </button>
            <button
              type="button"
              className="qz-profile-pick__open"
              onClick={() => {
                switchProfile(p.profileId)
                setNewRecoveryCode(null)
                setMode('detail')
              }}
            >
              Ouvrir
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="qz-sheet-row"
        onClick={() => {
          setError(null)
          setMode('create')
        }}
      >
        <div style={{ flex: 1 }}>
          <div className="qz-sheet-row-label">Créer un profil</div>
          <div className="qz-sheet-row-sub">
            Pseudo + code de récupération
          </div>
        </div>
      </button>
      <button
        type="button"
        className="qz-sheet-row"
        onClick={() => {
          setError(null)
          setMode('recover')
        }}
      >
        <div style={{ flex: 1 }}>
          <div className="qz-sheet-row-label">Récupérer un profil</div>
          <div className="qz-sheet-row-sub">Avec le code XXXXXX</div>
        </div>
      </button>
      {listFooter}
    </>
  )
}
