import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { clearChatAll } from '../lib/chatApi'
import './AdminPanel.css'

/** Doit matcher server/adminAuth.ts */
const ADMIN_PANEL_CODE = 'Quizzyosh'

type DiffRow = {
  difficulty: string
  hands: number
  correct: number
  answered: number
  successRatePct: number | null
}

type FeedbackSummary = {
  up: number
  down: number
  verify: number
  total: number
}

type HandEvent = {
  at: number
  mode: string
  theme: string
  difficulty: string
  correct: number
  answered: number
  playMode?: string
  roomCode?: string
}

type FeedbackEvent = {
  at: number
  kind: string
  question: string
  correctAnswer: string
  theme?: string
  difficulty?: string
  mode?: string
}

type LogsPayload = {
  count: number
  summary: DiffRow[]
  events: HandEvent[]
  feedback: {
    count: number
    summary: FeedbackSummary
    events: FeedbackEvent[]
  }
}

type AiCapacityRow = {
  engine: string
  keyCount: number
  maxPerKey: number
  capacity: number
  inflight: number
  freeSlots: number
}

function fmtTime(at: number) {
  try {
    return new Date(at).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function barWidth(pct: number | null) {
  if (pct == null || !Number.isFinite(pct)) return '0%'
  return `${Math.max(0, Math.min(100, pct))}%`
}

/**
 * Engrenage accueil — code Quizzyosh → logs calib/feedback + clear chat global.
 */
export function AdminPanel() {
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [code, setCode] = useState('')
  const [gateError, setGateError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogsPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [clearMsg, setClearMsg] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [tab, setTab] = useState<'summary' | 'hands' | 'feedback' | 'ai'>('summary')
  const [aiRows, setAiRows] = useState<AiCapacityRow[] | null>(null)

  async function loadLogs(secret: string) {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(
        `/api/calib-stats?secret=${encodeURIComponent(secret)}&limit=2000`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Erreur ${res.status}`,
        )
      }
      setLogs(data as LogsPayload)
    } catch (e) {
      setLogs(null)
      setLoadError(e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }

  async function loadAiCapacity(secret: string) {
    setLoadError(null)
    try {
      const res = await fetch(
        `/api/ai-capacity?secret=${encodeURIComponent(secret)}`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Erreur ${res.status}`,
        )
      }
      setAiRows(Array.isArray(data.rows) ? (data.rows as AiCapacityRow[]) : [])
    } catch (e) {
      setAiRows(null)
      setLoadError(e instanceof Error ? e.message : 'Chargement IA impossible')
    }
  }

  async function downloadLogs(format: 'csv' | 'download') {
    setLoadError(null)
    try {
      const res = await fetch(
        `/api/calib-stats?secret=${encodeURIComponent(ADMIN_PANEL_CODE)}&limit=5000&format=${format}`,
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          typeof data.error === 'string' ? data.error : `Erreur ${res.status}`,
        )
      }
      const blob = await res.blob()
      const ext = format === 'csv' ? 'csv' : 'json'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `quizz-logs-${new Date().toISOString().slice(0, 10)}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      setClearMsg(`Fichier ${ext.toUpperCase()} téléchargé.`)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Téléchargement impossible')
    }
  }

  async function handleResetLogs() {
    const ok = window.confirm(
      'Reset TOUS les logs (manches + feedback) sur le serveur ?\nIrréversible.',
    )
    if (!ok) return
    setResetting(true)
    setClearMsg(null)
    try {
      const res = await fetch('/api/calib-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resetLogs',
          secret: ADMIN_PANEL_CODE,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Erreur ${res.status}`,
        )
      }
      setLogs({
        count: 0,
        summary: [],
        events: [],
        feedback: {
          count: 0,
          summary: { up: 0, down: 0, verify: 0, total: 0 },
          events: [],
        },
      })
      setClearMsg('Logs réinitialisés.')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Reset impossible')
    } finally {
      setResetting(false)
    }
  }

  useEffect(() => {
    if (!open || !unlocked) return
    void loadLogs(ADMIN_PANEL_CODE)
    void loadAiCapacity(ADMIN_PANEL_CODE)
  }, [open, unlocked])

  function handleUnlock(e: FormEvent) {
    e.preventDefault()
    if (code.trim() !== ADMIN_PANEL_CODE) {
      setGateError('Code incorrect')
      return
    }
    setGateError(null)
    setUnlocked(true)
    setCode('')
  }

  function handleClose() {
    setOpen(false)
    setUnlocked(false)
    setGateError(null)
    setClearMsg(null)
    setCode('')
  }

  async function handleClearChat() {
    const ok = window.confirm(
      'Effacer le chat pour TOUT LE MONDE ?\n(Général + salles — irréversible)',
    )
    if (!ok) return
    setClearing(true)
    setClearMsg(null)
    try {
      await clearChatAll(ADMIN_PANEL_CODE)
      setClearMsg('Chat vidé pour tout le monde.')
    } catch (e) {
      setClearMsg(e instanceof Error ? e.message : 'Échec du clear')
    } finally {
      setClearing(false)
    }
  }

  const fb = logs?.feedback?.summary

  const ui = (
    <>
      <button
        type="button"
        className="admin-gear"
        onClick={() => setOpen(true)}
        aria-label="Administration"
        title="Admin"
      >
        ⚙
      </button>

      {open && (
        <div className="admin-panel" role="dialog" aria-modal aria-label="Admin">
          <div className="admin-panel__backdrop" onClick={handleClose} />
          <section className="admin-panel__card">
            <header className="admin-panel__head">
              <h2 className="admin-panel__title">
                {unlocked ? 'Logs & outils' : 'Accès admin'}
              </h2>
              <button
                type="button"
                className="admin-panel__close"
                onClick={handleClose}
                aria-label="Fermer"
              >
                ✕
              </button>
            </header>

            {!unlocked ? (
              <form className="admin-panel__gate" onSubmit={handleUnlock}>
                <label>
                  Code
                  <input
                    type="password"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                    autoFocus
                    placeholder="••••••••"
                  />
                </label>
                <button type="submit" className="btn btn--primary">
                  Ouvrir
                </button>
                {gateError && (
                  <p className="admin-panel__error" role="alert">
                    {gateError}
                  </p>
                )}
              </form>
            ) : (
              <div className="admin-panel__body">
                <div className="admin-panel__help">
                  <p>
                    <strong>Rafraîchir</strong> — recharge les stats depuis le
                    serveur (manches jouées + avis sur les questions).
                  </p>
                  <p>
                    <strong>Télécharger logs</strong> — fichier CSV ou JSON
                    (manches + feedback) sur ton PC.
                  </p>
                  <p>
                    <strong>Reset logs</strong> — efface toutes les manches et
                    feedbacks stockés sur le serveur.
                  </p>
                  <p>
                    <strong>Clear chat (tous)</strong> — efface le chat Général
                    et les chats de salles pour <em>tous</em> les joueurs, pas
                    seulement chez toi.
                  </p>
                  <p>
                    <strong>Résumé</strong> — taux de réussite par difficulté
                    (easy / medium / hard) + totaux 👍 👎 🔍.
                  </p>
                  <p>
                    <strong>Manches</strong> — historique des parties (thème,
                    mode, score). Sert à calibrer la difficulté de l’IA.
                  </p>
                  <p>
                    <strong>Feedback</strong> — questions signalées par les
                    joueurs (bien / pas bien / à vérifier).
                  </p>
                  <p>
                    <strong>Capacité IA</strong> — état temps réel des slots
                    disponibles par provider (clés détectées / inflight /
                    slots libres).
                  </p>
                </div>

                <div className="admin-panel__toolbar">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void loadLogs(ADMIN_PANEL_CODE)}
                    disabled={loading}
                    title="Recharger les logs depuis le serveur"
                  >
                    {loading ? 'Chargement…' : 'Rafraîchir'}
                  </button>
                  <button
                    type="button"
                    className="admin-panel__file"
                    onClick={() => void downloadLogs('csv')}
                    title="Télécharger les logs en CSV"
                  >
                    Logs CSV
                  </button>
                  <button
                    type="button"
                    className="admin-panel__file"
                    onClick={() => void downloadLogs('download')}
                    title="Télécharger les logs en JSON"
                  >
                    Logs JSON
                  </button>
                  <button
                    type="button"
                    className="admin-panel__danger"
                    onClick={() => void handleResetLogs()}
                    disabled={resetting}
                    title="Efface manches + feedback sur le serveur"
                  >
                    {resetting ? '…' : 'Reset logs'}
                  </button>
                  <button
                    type="button"
                    className="admin-panel__danger"
                    onClick={() => void handleClearChat()}
                    disabled={clearing}
                    title="Vide le chat pour tous les joueurs du site"
                  >
                    {clearing ? '…' : 'Clear chat (tous)'}
                  </button>
                </div>
                {clearMsg && (
                  <p className="admin-panel__status" role="status">
                    {clearMsg}
                  </p>
                )}
                {loadError && (
                  <p className="admin-panel__error" role="alert">
                    {loadError}
                  </p>
                )}

                <div className="admin-panel__tabs" role="tablist">
                  {(
                    [
                      ['summary', 'Résumé'],
                      ['hands', 'Manches'],
                      ['feedback', 'Feedback'],
                      ['ai', 'Capacité IA'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      className={`admin-panel__tab${tab === id ? ' is-on' : ''}`}
                      aria-selected={tab === id}
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === 'summary' && logs && (
                  <div className="admin-panel__section">
                    <p className="admin-panel__tab-help">
                      % de bonnes réponses agrégé par niveau — utile pour voir
                      si easy / medium / hard sont bien calibrés.
                    </p>
                    <p className="admin-panel__meta">
                      {logs.count} manches · {logs.feedback?.count ?? 0} feedback
                    </p>
                    <div className="admin-panel__bars">
                      {(logs.summary ?? []).map((row) => (
                        <div key={row.difficulty} className="admin-bar">
                          <div className="admin-bar__label">
                            <span>{row.difficulty}</span>
                            <span>
                              {row.successRatePct != null
                                ? `${row.successRatePct}%`
                                : '—'}{' '}
                              · {row.hands} m.
                            </span>
                          </div>
                          <div className="admin-bar__track">
                            <div
                              className="admin-bar__fill"
                              style={{ width: barWidth(row.successRatePct) }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {fb && (
                      <div className="admin-panel__fb-stats">
                        <span>👍 {fb.up}</span>
                        <span>👎 {fb.down}</span>
                        <span>🔍 {fb.verify}</span>
                      </div>
                    )}
                  </div>
                )}

                {tab === 'hands' && logs && (
                  <div className="admin-panel__log">
                    <p className="admin-panel__tab-help">
                      Chaque ligne = une partie terminée (solo ou multi). Score
                      = bonnes réponses / questions.
                    </p>
                    {(logs.events ?? []).slice(0, 80).map((e, i) => {
                      const pct =
                        e.answered > 0
                          ? Math.round((1000 * e.correct) / e.answered) / 10
                          : null
                      return (
                        <article key={`${e.at}-${i}`} className="admin-log-row">
                          <header>
                            <strong>{e.theme}</strong>
                            <time>{fmtTime(e.at)}</time>
                          </header>
                          <p>
                            {e.difficulty} · {e.mode}
                            {e.playMode ? ` · ${e.playMode}` : ''}
                            {e.roomCode ? ` · ${e.roomCode}` : ''} ·{' '}
                            {e.correct}/{e.answered}
                            {pct != null ? ` (${pct}%)` : ''}
                          </p>
                        </article>
                      )
                    })}
                    {(logs.events ?? []).length === 0 && (
                      <p className="admin-panel__empty">Aucune manche</p>
                    )}
                  </div>
                )}

                {tab === 'feedback' && logs && (
                  <div className="admin-panel__log">
                    <p className="admin-panel__tab-help">
                      👍 question OK · 👎 mauvaise / floue · 🔍 à revoir (avec
                      le texte complet pour corriger le prompt plus tard).
                    </p>
                    {(logs.feedback?.events ?? []).slice(0, 80).map((e, i) => (
                      <article key={`${e.at}-${i}`} className="admin-log-row">
                        <header>
                          <strong>
                            {e.kind === 'up'
                              ? '👍'
                              : e.kind === 'down'
                                ? '👎'
                                : '🔍'}{' '}
                            {e.theme ?? '—'}
                          </strong>
                          <time>{fmtTime(e.at)}</time>
                        </header>
                        <p>{e.question}</p>
                        <p className="admin-log-row__ans">→ {e.correctAnswer}</p>
                      </article>
                    ))}
                    {(logs.feedback?.events ?? []).length === 0 && (
                      <p className="admin-panel__empty">Aucun feedback</p>
                    )}
                  </div>
                )}

                {tab === 'ai' && (
                  <div className="admin-panel__section">
                    <p className="admin-panel__tab-help">
                      Tokens restants exacts non fournis par les APIs free :
                      cette vue montre la capacité exploitable (clés, inflight,
                      slots libres) par provider.
                    </p>
                    <div className="admin-panel__toolbar">
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => void loadAiCapacity(ADMIN_PANEL_CODE)}
                        title="Recharger la capacité IA"
                      >
                        Rafraîchir capacité IA
                      </button>
                    </div>
                    <div className="admin-panel__ai-grid">
                      {(aiRows ?? []).map((r) => (
                        <article key={r.engine} className="admin-ai-card">
                          {(() => {
                            const pct =
                              r.capacity > 0
                                ? Math.round((100 * r.freeSlots) / r.capacity)
                                : 0
                            return (
                              <>
                          <header className="admin-ai-card__head">
                            <strong>{r.engine.toUpperCase()}</strong>
                          </header>
                          <p>Clés: {r.keyCount}</p>
                          <p>Slots max: {r.capacity}</p>
                          <p>Inflight: {r.inflight}</p>
                          <p>Slots libres: {r.freeSlots}</p>
                          <p>Disponibilité: {pct}%</p>
                              </>
                            )
                          })()}
                        </article>
                      ))}
                    </div>
                    {(aiRows ?? []).length === 0 && (
                      <p className="admin-panel__empty">Aucune capacité IA détectée</p>
                    )}
                  </div>
                )}

                {!logs && !loading && !loadError && (
                  <p className="admin-panel__empty">Pas encore de données</p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )

  return createPortal(ui, document.body)
}
