import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { clearChatAll } from '../lib/chatApi'
import { ADMIN_PANEL_CODE, hasLocalAdminUnlock, rememberLocalAdminUnlock } from '../lib/adminCode'
import { ProfilesAdminPanel } from './ProfilesAdminPanel'
import './AdminPanel.css'

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
  review?: number
  report?: number
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
  sourceType?: string
  reportTarget?: string
  verdict?: string
  answerVerdict?: string
  sourceVerdict?: string
  verifyTitle?: string
  verifyNote?: string
  verifyProvider?: string
}

type ErrorEvent = {
  at: number
  scope: string
  message: string
  instead?: string
  status?: number
  theme?: string
  detail?: string
  path?: string
}

type PenduAiLogEvent = {
  id: string
  at: number
  difficulty: string
  words: string[]
  source: string
  mode?: string
}

type PenduAiLogPayload = {
  count: number
  wordCount: number
  events: PenduAiLogEvent[]
  dump: string[]
}

type RedisQuota = {
  backend: 'redis' | 'memory'
  usedBytes: number | null
  maxBytes: number | null
  keyCount: number | null
  families?: { id: string; label: string; count: number }[]
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
  errors?: {
    count: number
    summary: { total: number; byScope: Record<string, number> }
    events: ErrorEvent[]
  }
  curated?: {
    ingestEnabled: boolean
    questionsIngestEnabled?: boolean
    count: number
    summary: {
      total: number
      byDifficulty: Record<string, number>
      themeCount: number
      groupCount?: number
      catalogCount?: number
      customCount?: number
      byTheme?: Record<string, number>
      ingestEnabled: boolean
    }
    themeSlots?: {
      groupKey: string
      placementKind: 'catalog' | 'custom'
      themeId?: string
      theme: string
      subTheme?: string
      customKey?: string
      subIsCustom: boolean
      questionCount: number
      path: string
    }[]
    events?: CuratedBankEvent[]
  }
  storage?: RedisQuota
}

type CuratedBankEvent = {
  id: string
  at: number
  theme: string
  placementKind: 'catalog' | 'custom'
  themeId?: string
  subTheme?: string
  subIsCustom?: boolean
  customKey?: string
  groupKey: string
  rawTheme?: string
  difficulty: string
  scope?: string
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  correctAnswer: string
  explanation?: string
  sourceType?: string
  mode?: string
  playMode?: string
}

type AiCapacityRow = {
  engine: string
  keyCount: number
  maxPerKey: number
  capacity: number
  inflight: number
  freeSlots: number
}

type AiGenTotals = {
  calls: number
  questions: number
  tiersApprox: number
  tokensIn: number
  tokensOut: number
  tokensTotal: number
}

type AiGenModelRow = {
  engine: string
  model: string
  mode: 'full' | 'topup' | 'legacy'
  calls: number
  questions: number
  tokensIn: number
  tokensOut: number
  tokensTotal: number
  tiersApprox: number
}

type AiModelHealthRow = {
  engine: string
  model: string
  configured: boolean
  ok: number
  fail: number
  questions: number
  tokensTotal: number
  tokensLimitDay?: number
  tokensLimitNote?: 'official_tpd' | 'soft_estimate'
  lastErrorKind: string | null
  lastError: string | null
  lastErrorAt: number | null
  status: 'ok' | 'warn' | 'down' | 'idle'
}

type AiGenSnapshot = {
  rows: AiGenModelRow[]
  totals: AiGenTotals
  byMode?: {
    full: AiGenTotals
    topup: AiGenTotals
    legacy: AiGenTotals
  }
  byEngine?: Array<{
    engine: string
    full: AiGenTotals
    topup: AiGenTotals
    tokensTotal: number
  }>
  models?: AiModelHealthRow[]
  failTotal?: number
  tokensLimitDayTotal?: number
}

type AiGenHistoryEntry = {
  key: string
  kind: 'day' | 'month'
  updatedAt: number
  ok: number
  fail: number
  tokensIn: number
  tokensOut: number
  tokensTotal: number
  principalCalls: number
  principalTokens: number
  topupCalls: number
  topupTokens: number
  byEngine: Record<string, { ok: number; fail: number; tokens: number }>
}

type AiGenHistoryPayload = {
  days: AiGenHistoryEntry[]
  months: AiGenHistoryEntry[]
}

type AiGenPayload = AiGenSnapshot & {
  keys?: { day: string; month: string }
  day?: AiGenSnapshot
  month?: AiGenSnapshot
  all?: AiGenSnapshot
}

function statusLabel(s: AiModelHealthRow['status']) {
  if (s === 'down') return 'HS'
  if (s === 'warn') return '⚠'
  if (s === 'ok') return 'OK'
  return '—'
}

function errorKindLabel(kind: string | null) {
  if (!kind) return '—'
  if (kind === 'model_gone') return 'modèle HS'
  if (kind === 'rate_limit') return '429'
  if (kind === 'timeout') return 'timeout'
  if (kind === 'json_invalid') return 'JSON'
  if (kind === 'filtered') return 'filtré'
  return 'autre'
}

function engineLabel(engine: string) {
  if (engine === 'gemini') return 'Gemini'
  if (engine === 'groq') return 'Groq'
  if (engine === 'openrouter') return 'OpenRouter'
  return engine
}

const AI_ENGINE_ORDER = ['gemini', 'groq', 'openrouter'] as const

function groupModelsByEngine(models: AiModelHealthRow[]) {
  const map = new Map<string, AiModelHealthRow[]>()
  for (const eng of AI_ENGINE_ORDER) map.set(eng, [])
  for (const m of models) {
    const list = map.get(m.engine) ?? []
    list.push(m)
    map.set(m.engine, list)
  }
  for (const [, list] of map) {
    list.sort(
      (a, b) =>
        b.ok + b.fail - (a.ok + a.fail) || a.model.localeCompare(b.model),
    )
  }
  return AI_ENGINE_ORDER.map((engine) => ({
    engine,
    models: map.get(engine) ?? [],
  })).filter((g) => g.models.length > 0)
}

function fmtNum(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.max(0, Math.floor(n)))
}

/** 1234 → 1,2K ; 500000 → 500K ; 1_200_000 → 1,2M */
function fmtTok(n: number): string {
  const v = Math.max(0, Math.floor(n))
  if (v >= 1_000_000) {
    const m = v / 1_000_000
    return `${m.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}M`
  }
  if (v >= 1_000) {
    const k = v / 1_000
    return `${k.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}K`
  }
  return fmtNum(v)
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

function fmtMo(bytes: number): string {
  const mo = bytes / (1024 * 1024)
  if (mo < 10) return mo.toFixed(1).replace('.', ',')
  return String(Math.round(mo))
}

function quotaLabel(q: RedisQuota): string {
  if (q.backend === 'memory') return 'mémoire locale (pas Redis)'
  if (q.usedBytes == null || q.maxBytes == null || q.maxBytes <= 0) {
    return 'quota Redis indisponible'
  }
  return `${fmtMo(q.usedBytes)} Mo / ${fmtMo(q.maxBytes)} Mo`
}

function quotaChipLabel(q: RedisQuota): string {
  if (q.backend === 'memory') return 'RAM locale'
  if (q.usedBytes == null || q.maxBytes == null || q.maxBytes <= 0) {
    return 'Redis —'
  }
  return `${fmtMo(q.usedBytes)} / ${fmtMo(q.maxBytes)} Mo`
}

function quotaPct(q: RedisQuota): number | null {
  if (q.usedBytes == null || q.maxBytes == null || q.maxBytes <= 0) return null
  return (100 * q.usedBytes) / q.maxBytes
}

/**
 * Engrenage accueil — code Quizzyosh → logs calib/feedback + clear chat global.
 */
export function AdminPanel({ hideGear = false }: { hideGear?: boolean }) {
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(hasLocalAdminUnlock)
  const [code, setCode] = useState('')
  const [gateError, setGateError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogsPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [clearMsg, setClearMsg] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [tab, setTab] = useState<
    | 'summary'
    | 'hands'
    | 'feedback'
    | 'errors'
    | 'curated'
    | 'ai'
    | 'pendu'
    | 'profiles'
  >('summary')
  const [aiRows, setAiRows] = useState<AiCapacityRow[] | null>(null)
  const [aiGen, setAiGen] = useState<AiGenPayload | null>(null)
  const [aiHistory, setAiHistory] = useState<AiGenHistoryPayload | null>(null)
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [resettingAi, setResettingAi] = useState(false)
  const [aiPeriod, setAiPeriod] = useState<'day' | 'month' | 'all'>('day')
  const [aiHistoryKind, setAiHistoryKind] = useState<'day' | 'month'>('day')
  const [curatedOpen, setCuratedOpen] = useState<Record<string, boolean>>({})
  const [curatedBusyId, setCuratedBusyId] = useState<string | null>(null)
  const [penduLog, setPenduLog] = useState<PenduAiLogPayload | null>(null)
  const [penduLogBusy, setPenduLogBusy] = useState(false)
  const [panelSize, setPanelSize] = useState(() => {
    try {
      const w = Number(localStorage.getItem('quizz:admin:w'))
      const h = Number(localStorage.getItem('quizz:admin:h'))
      return {
        w: Number.isFinite(w) && w >= 280 ? w : 420,
        h: Number.isFinite(h) && h >= 320 ? h : 560,
      }
    } catch {
      return { w: 420, h: 560 }
    }
  })
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(
    () => {
      try {
        const x = Number(localStorage.getItem('quizz:admin:x'))
        const y = Number(localStorage.getItem('quizz:admin:y'))
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }
      } catch {
        /* ignore */
      }
      return null
    },
  )
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem('quizz:admin:pinned') === '1'
    } catch {
      return false
    }
  })
  const resizeRef = useRef<{
    startX: number
    startY: number
    startW: number
    startH: number
  } | null>(null)
  const moveRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  const tabsScrollRef = useRef<HTMLDivElement | null>(null)
  const tabsDragRef = useRef<{
    startX: number
    scrollLeft: number
    moved: boolean
  } | null>(null)

  function pickAiSnapshot(gen: AiGenPayload | null): AiGenSnapshot | null {
    if (!gen) return null
    if (aiPeriod === 'day' && gen.day) return gen.day
    if (aiPeriod === 'month' && gen.month) return gen.month
    if (aiPeriod === 'all' && gen.all) return gen.all
    return gen
  }

  async function loadLogs(secret: string, opts?: { silent?: boolean }) {
    const silent = Boolean(opts?.silent)
    if (!silent) {
      setLoading(true)
      setLoadError(null)
    }
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
      if (!silent) {
        setLogs(null)
        setLoadError(e instanceof Error ? e.message : 'Chargement impossible')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function loadAiCapacity(secret: string, opts?: { silent?: boolean }) {
    const silent = Boolean(opts?.silent)
    if (!silent) setLoadError(null)
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
      setAiGen(
        data.gen && typeof data.gen === 'object'
          ? (data.gen as AiGenPayload)
          : null,
      )
      setAiHistory(
        data.history && typeof data.history === 'object'
          ? (data.history as AiGenHistoryPayload)
          : null,
      )
      setAiNote(typeof data.note === 'string' ? data.note : null)
    } catch (e) {
      if (silent) return
      setAiRows(null)
      setAiGen(null)
      setAiHistory(null)
      setLoadError(e instanceof Error ? e.message : 'Chargement IA impossible')
    }
  }

  async function handleResetAiGen(scope: 'day' | 'month' | 'all') {
    const msg =
      scope === 'day'
        ? 'Reset le compteur du JOUR seulement ?\nMois + global restent.'
        : scope === 'month'
          ? 'Reset le compteur du MOIS seulement ?\nJour + global restent.'
          : 'Reset TOUT (jour + mois + global) ?\nIrréversible.'
    const ok = window.confirm(msg)
    if (!ok) return
    setResettingAi(true)
    setClearMsg(null)
    try {
      const action =
        scope === 'day'
          ? 'resetGenDayStats'
          : scope === 'month'
            ? 'resetGenMonthStats'
            : 'resetGenStats'
      const res = await fetch('/api/ai-capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          secret: ADMIN_PANEL_CODE,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Erreur ${res.status}`,
        )
      }
      await loadAiCapacity(ADMIN_PANEL_CODE)
      setClearMsg(
        scope === 'day'
          ? `Compteur jour réinitialisé (${typeof data.day === 'string' ? data.day : 'aujourd’hui'}).`
          : scope === 'month'
            ? `Compteur mois réinitialisé (${typeof data.month === 'string' ? data.month : 'ce mois'}).`
            : 'Compteur IA (tout) réinitialisé.',
      )
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Reset IA impossible')
    } finally {
      setResettingAi(false)
    }
  }

  async function downloadAiHistory(format: 'history-csv' | 'history-json') {
    setLoadError(null)
    try {
      const res = await fetch(
        `/api/ai-capacity?secret=${encodeURIComponent(ADMIN_PANEL_CODE)}&format=${format}`,
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          typeof data.error === 'string' ? data.error : `Erreur ${res.status}`,
        )
      }
      const blob = await res.blob()
      const ext = format === 'history-csv' ? 'csv' : 'json'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `quizz-ai-history-${new Date().toISOString().slice(0, 10)}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      setClearMsg(`Logs IA ${ext.toUpperCase()} téléchargés.`)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Téléchargement impossible')
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

  async function downloadErrors(format: 'errors-csv' | 'errors-json') {
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
      const ext = format === 'errors-csv' ? 'csv' : 'json'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `quizz-errors-${new Date().toISOString().slice(0, 10)}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      setClearMsg(`Erreurs ${ext.toUpperCase()} téléchargées.`)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Téléchargement impossible')
    }
  }

  async function loadPenduLog(secret: string, opts?: { silent?: boolean }) {
    const silent = Boolean(opts?.silent)
    if (!silent) setPenduLogBusy(true)
    try {
      const res = await fetch(
        `/api/pendu-words?secret=${encodeURIComponent(secret)}`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Erreur ${res.status}`,
        )
      }
      setPenduLog(data as PenduAiLogPayload)
    } catch (e) {
      if (!silent) {
        setPenduLog(null)
        setLoadError(e instanceof Error ? e.message : 'Log pendu impossible')
      }
    } finally {
      if (!silent) setPenduLogBusy(false)
    }
  }

  async function handleClearPenduLog() {
    const ok = window.confirm(
      'Vider le log des mots pendu générés par l’IA ?\nLa banque officielle ne change pas.',
    )
    if (!ok) return
    setPenduLogBusy(true)
    setClearMsg(null)
    try {
      const res = await fetch('/api/pendu-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear',
          secret: ADMIN_PANEL_CODE,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Erreur ${res.status}`,
        )
      }
      setPenduLog({ count: 0, wordCount: 0, events: [], dump: [] })
      setClearMsg('Log pendu vidé.')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Reset pendu impossible')
    } finally {
      setPenduLogBusy(false)
    }
  }

  async function handleResetLogs() {
    const ok = window.confirm(
      'Reset TOUS les logs (manches + feedback + erreurs + banque curatée) sur le serveur ?\nIrréversible.',
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
          summary: { up: 0, down: 0, verify: 0, review: 0, report: 0, total: 0 },
          events: [],
        },
        errors: {
          count: 0,
          summary: { total: 0, byScope: {} },
          events: [],
        },
        curated: {
          ingestEnabled: false,
          count: 0,
          summary: {
            total: 0,
            byDifficulty: { easy: 0, medium: 0, hard: 0 },
            themeCount: 0,
            ingestEnabled: false,
          },
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

  async function deleteCuratedEvent(e: CuratedBankEvent) {
    const ok = window.confirm(
      `Supprimer cette question de la banque ?\n\n${e.question.slice(0, 120)}`,
    )
    if (!ok) return
    const busyKey = `${e.groupKey}::${e.id}`
    setCuratedBusyId(busyKey)
    setLoadError(null)
    try {
      const res = await fetch('/api/curated-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          secret: ADMIN_PANEL_CODE,
          id: e.id,
          question: e.question,
          correctAnswer: e.correctAnswer,
          difficulty: e.difficulty,
          placementKind: e.placementKind,
          themeId: e.themeId,
          subTheme: e.subTheme,
          customKey: e.customKey,
          theme: e.theme,
          rawTheme: e.rawTheme,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Erreur ${res.status}`,
        )
      }
      setLogs((prev) => {
        if (!prev?.curated) return prev
        const events = (prev.curated.events ?? []).filter(
          (x) =>
            !(
              x.id === e.id &&
              x.question === e.question &&
              x.correctAnswer === e.correctAnswer &&
              x.difficulty === e.difficulty
            ),
        )
        return {
          ...prev,
          curated: {
            ...prev.curated,
            count: events.length,
            events,
          },
        }
      })
      setClearMsg('Question retirée de la banque.')
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Suppression impossible',
      )
    } finally {
      setCuratedBusyId(null)
    }
  }

  useEffect(() => {
    if (!open || !unlocked) return
    void loadLogs(ADMIN_PANEL_CODE)
    void loadAiCapacity(ADMIN_PANEL_CODE)
    const id = window.setInterval(() => {
      void loadLogs(ADMIN_PANEL_CODE, { silent: true })
      void loadAiCapacity(ADMIN_PANEL_CODE, { silent: true })
    }, 4000)
    return () => window.clearInterval(id)
  }, [open, unlocked])

  useEffect(() => {
    function onOpen(e: Event) {
      setOpen(true)
      const unlock = Boolean(
        (e as CustomEvent<{ unlock?: boolean }>).detail?.unlock,
      )
      if (unlock || hasLocalAdminUnlock()) {
        rememberLocalAdminUnlock()
        setUnlocked(true)
        setGateError(null)
        setCode('')
      }
    }
    window.addEventListener('quizz:open-admin', onOpen)
    return () => window.removeEventListener('quizz:open-admin', onOpen)
  }, [])

  useEffect(() => {
    const el = tabsScrollRef.current
    if (!el || !open || !unlocked) return
    const onWheel = (ev: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return
      el.scrollLeft += ev.deltaY
      ev.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open, unlocked])

  function handleUnlock(e: FormEvent) {
    e.preventDefault()
    if (code.trim() !== ADMIN_PANEL_CODE) {
      setGateError('Code incorrect')
      return
    }
    rememberLocalAdminUnlock()
    setGateError(null)
    setUnlocked(true)
    setCode('')
  }

  function handleClose() {
    setOpen(false)
    setGateError(null)
    setClearMsg(null)
    setCode('')
    // Garde la session déverrouillée → réouverture rapide pendant un quiz
  }

  function persistPinned(next: boolean) {
    try {
      localStorage.setItem('quizz:admin:pinned', next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  function handleTogglePin() {
    setPinned((prev) => {
      const next = !prev
      persistPinned(next)
      return next
    })
  }

  function clampPos(x: number, y: number, w: number, h: number) {
    const maxX = Math.max(0, window.innerWidth - w)
    const maxY = Math.max(0, window.innerHeight - h)
    return {
      x: Math.min(maxX, Math.max(0, x)),
      y: Math.min(maxY, Math.max(0, y)),
    }
  }

  function defaultPos(w: number, h: number) {
    return clampPos(
      window.innerWidth - w - 12,
      window.innerHeight - h - 12,
      w,
      h,
    )
  }

  function persistPanel(next: {
    w?: number
    h?: number
    x?: number
    y?: number
  }) {
    try {
      if (next.w != null) localStorage.setItem('quizz:admin:w', String(next.w))
      if (next.h != null) localStorage.setItem('quizz:admin:h', String(next.h))
      if (next.x != null) localStorage.setItem('quizz:admin:x', String(next.x))
      if (next.y != null) localStorage.setItem('quizz:admin:y', String(next.y))
    } catch {
      /* ignore */
    }
  }

  function onResizePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: panelSize.w,
      startH: panelSize.h,
    }
  }

  function onResizePointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = resizeRef.current
    if (!s) return
    const maxW = Math.max(280, window.innerWidth - 16)
    const maxH = Math.max(320, window.innerHeight - 16)
    const w = Math.min(maxW, Math.max(280, s.startW + (e.clientX - s.startX)))
    const h = Math.min(maxH, Math.max(320, s.startH + (e.clientY - s.startY)))
    setPanelSize({ w, h })
    setPanelPos((pos) => {
      const base = pos ?? defaultPos(w, h)
      return clampPos(base.x, base.y, w, h)
    })
  }

  function onResizePointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return
    resizeRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    setPanelSize((size) => {
      setPanelPos((pos) => {
        const nextPos = pos
          ? clampPos(pos.x, pos.y, size.w, size.h)
          : defaultPos(size.w, size.h)
        persistPanel({ w: size.w, h: size.h, x: nextPos.x, y: nextPos.y })
        return nextPos
      })
      return size
    })
  }

  function onMovePointerDown(e: PointerEvent<HTMLElement>) {
    if (!unlocked) return
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('button, a, input, textarea, select')) return
    e.preventDefault()
    const card = cardRef.current
    const rect = card?.getBoundingClientRect()
    const w = panelSize.w
    const h = panelSize.h
    const origin =
      panelPos ??
      (rect
        ? { x: rect.left, y: rect.top }
        : defaultPos(w, h))
    moveRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: origin.x,
      originY: origin.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onMovePointerMove(e: PointerEvent<HTMLElement>) {
    const m = moveRef.current
    if (!m) return
    const next = clampPos(
      m.originX + (e.clientX - m.startX),
      m.originY + (e.clientY - m.startY),
      panelSize.w,
      panelSize.h,
    )
    setPanelPos(next)
  }

  function onMovePointerUp(e: PointerEvent<HTMLElement>) {
    if (!moveRef.current) return
    moveRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    setPanelPos((pos) => {
      if (!pos) return pos
      persistPanel({ x: pos.x, y: pos.y })
      return pos
    })
  }

  function onTabsPointerDown(e: PointerEvent<HTMLDivElement>) {
    const el = tabsScrollRef.current
    if (!el || e.button !== 0) return
    // Clic sur un onglet → laisser le click normal (pas de capture)
    if ((e.target as HTMLElement).closest('button')) return
    tabsDragRef.current = {
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false,
    }
    el.setPointerCapture(e.pointerId)
  }

  function onTabsPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = tabsDragRef.current
    const el = tabsScrollRef.current
    if (!drag || !el) return
    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > 6) drag.moved = true
    if (drag.moved) el.scrollLeft = drag.scrollLeft - dx
  }

  function onTabsPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!tabsDragRef.current) return
    tabsDragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
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
  const errCount = logs?.errors?.count ?? 0

  const ui = (
    <>
      {!hideGear && (
        <button
          type="button"
          className="admin-gear"
          onClick={() => setOpen(true)}
          aria-label="Administration"
          title="Admin"
        >
          ⚙
        </button>
      )}

      {open && (
        <div
          className={`admin-panel${unlocked ? ' admin-panel--float' : ''}${
            unlocked && pinned ? ' admin-panel--pinned' : ''
          }`}
          role="dialog"
          aria-modal={!unlocked}
          aria-label="Admin"
        >
          {!unlocked && (
            <div className="admin-panel__backdrop" onClick={handleClose} />
          )}
          <section
            ref={cardRef}
            className={`admin-panel__card${!unlocked ? ' admin-panel__card--gate' : ' admin-panel__card--sized'}${
              unlocked && pinned ? ' admin-panel__card--pinned' : ''
            }`}
            style={
              unlocked
                ? (() => {
                    const w = Math.min(panelSize.w, window.innerWidth - 16)
                    const h = Math.min(panelSize.h, window.innerHeight - 16)
                    const pos = panelPos
                      ? clampPos(panelPos.x, panelPos.y, w, h)
                      : defaultPos(w, h)
                    return {
                      width: w,
                      height: h,
                      left: pos.x,
                      top: pos.y,
                    }
                  })()
                : undefined
            }
          >
            <header
              className={`admin-panel__head${unlocked ? ' admin-panel__head--drag' : ''}`}
              onPointerDown={onMovePointerDown}
              onPointerMove={onMovePointerMove}
              onPointerUp={onMovePointerUp}
              onPointerCancel={onMovePointerUp}
              title={unlocked ? 'Glisser pour déplacer' : undefined}
            >
              <div className="admin-panel__title-wrap">
                <h2 className="admin-panel__title">
                  {unlocked
                    ? pinned
                      ? 'Logs & outils · épinglé'
                      : 'Logs & outils'
                    : 'Accès admin'}
                </h2>
                {unlocked && logs?.storage && (
                  <p className="admin-panel__quota-chip" title="Quota Redis">
                    {quotaChipLabel(logs.storage)}
                  </p>
                )}
              </div>
              <div className="admin-panel__head-actions">
                {unlocked && (
                  <button
                    type="button"
                    className={`admin-panel__lock${pinned ? ' is-on' : ''}`}
                    onClick={handleTogglePin}
                    aria-label={
                      pinned
                        ? 'Désépingler le panneau'
                        : 'Épingler au premier plan'
                    }
                    aria-pressed={pinned}
                    title={
                      pinned
                        ? 'Épinglé — clic pour libérer'
                        : 'Épingler au premier plan (reste ouvert pendant le jeu)'
                    }
                  >
                    🔒
                  </button>
                )}
                <button
                  type="button"
                  className="admin-panel__close"
                  onClick={handleClose}
                  aria-label="Fermer"
                  title={unlocked ? 'Réduire (reste déverrouillé)' : 'Fermer'}
                >
                  ✕
                </button>
              </div>
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
                <div className="admin-panel__err-guide" aria-label="Codes erreur">
                  <p className="admin-panel__err-guide-title">
                    Codes erreur → ce que fait l’app
                  </p>
                  <ul className="admin-panel__err-guide-list">
                    <li>
                      <strong>429</strong> — quota / rate limit → bascule autre
                      clé ou autre IA
                    </li>
                    <li>
                      <strong>404</strong> — modèle mort / inexistant → modèle
                      suivant dans la pile
                    </li>
                    <li>
                      <strong>503</strong> — surcharge provider → modèle suivant
                    </li>
                    <li>
                      <strong>504 / timeout</strong> — délai dépassé → message
                      « réessaie » au joueur
                    </li>
                    <li>
                      <strong>422 JSON</strong> — réponse IA illisible → autre
                      modèle ou rattrapage partiel
                    </li>
                    <li>
                      <strong>filtré</strong> — questions rejetées (qualité) →
                      autre modèle
                    </li>
                    <li>
                      <strong>401 / 403</strong> — clé invalide → autre slot /
                      autre provider
                    </li>
                    <li>
                      <strong>500</strong> — erreur serveur → message d’erreur
                      au joueur
                    </li>
                  </ul>
                </div>

                <div className="admin-panel__toolbar">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      void loadLogs(ADMIN_PANEL_CODE)
                      void loadAiCapacity(ADMIN_PANEL_CODE)
                    }}
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

                <div
                  ref={tabsScrollRef}
                  className="admin-panel__tabs"
                  role="tablist"
                  onPointerDown={onTabsPointerDown}
                  onPointerMove={onTabsPointerMove}
                  onPointerUp={onTabsPointerUp}
                  onPointerCancel={onTabsPointerUp}
                >
                  {(
                    [
                      ['summary', 'Résumé'],
                      ['hands', 'Manches'],
                      ['feedback', 'Feedback'],
                      ['errors', 'Erreurs'],
                      ['curated', 'Banque'],
                      ['pendu', 'Pendu'],
                      ['profiles', 'Profils'],
                      ['ai', 'IA'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      className={`admin-panel__tab${tab === id ? ' is-on' : ''}`}
                      aria-selected={tab === id}
                      onClick={() => {
                        setTab(id)
                        if (id === 'pendu') {
                          void loadPenduLog(ADMIN_PANEL_CODE)
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === 'summary' && logs && (
                  <div className="admin-panel__section">
                    {logs.storage && (
                      <div
                        className={`admin-quota${
                          (quotaPct(logs.storage) ?? 0) >= 90
                            ? ' admin-quota--hot'
                            : (quotaPct(logs.storage) ?? 0) >= 70
                              ? ' admin-quota--warn'
                              : ''
                        }`}
                      >
                        <div className="admin-bar__label">
                          <span>Stockage Redis</span>
                          <span>{quotaLabel(logs.storage)}</span>
                        </div>
                        <div className="admin-bar__track">
                          <div
                            className="admin-bar__fill"
                            style={{
                              width: barWidth(quotaPct(logs.storage)),
                            }}
                          />
                        </div>
                        <p className="admin-quota__hint">
                          {fmtMo(logs.storage.usedBytes ?? 0)} Mo occupés sur{' '}
                          {fmtMo(logs.storage.maxBytes ?? 0)} Mo (plafond de
                          cette base).
                          {logs.storage.keyCount != null
                            ? ` ${logs.storage.keyCount} clés.`
                            : ''}
                        </p>
                        {logs.storage.families &&
                          logs.storage.families.length > 0 && (
                            <ul className="admin-quota__families">
                              {logs.storage.families.map((fam) => (
                                <li key={fam.id}>
                                  {fam.label} · {fam.count}
                                </li>
                              ))}
                            </ul>
                          )}
                      </div>
                    )}
                    <p className="admin-panel__tab-help">
                      % de bonnes réponses agrégé par niveau — utile pour voir
                      si easy / medium / hard sont bien calibrés.
                    </p>
                    <p className="admin-panel__meta">
                      {logs.count} manches · {logs.feedback?.count ?? 0} feedback
                      · {errCount} erreurs
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
                        <span>⚠️ {fb.review ?? 0}</span>
                        <span>🚩 {fb.report ?? 0}</span>
                        <span>⛔ {errCount}</span>
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
                      👍 OK · 👎 mauvaise · 🔍 vérif · ⚠️ à revoir · 🚩 signalé
                      (question / réponse / les deux).
                    </p>
                    {(logs.feedback?.events ?? []).slice(0, 80).map((e, i) => (
                      <article key={`${e.at}-${i}`} className="admin-log-row">
                        <header>
                          <strong>
                            {e.kind === 'up'
                              ? '👍'
                              : e.kind === 'down'
                                ? '👎'
                                : e.kind === 'review'
                                  ? '⚠️'
                                  : e.kind === 'report'
                                    ? '🚩'
                                    : '🔍'}{' '}
                            {e.theme ?? '—'}
                            {e.kind === 'review' && e.verdict
                              ? ` · ${e.verdict}`
                              : ''}
                            {e.kind === 'report' && e.reportTarget
                              ? ` · ${
                                  e.reportTarget === 'question'
                                    ? 'question'
                                    : e.reportTarget === 'answer'
                                      ? 'réponse'
                                      : 'les deux'
                                }`
                              : ''}
                          </strong>
                          <time>{fmtTime(e.at)}</time>
                        </header>
                        <p>{e.question}</p>
                        <p className="admin-log-row__ans">
                          → {e.correctAnswer}
                          {e.sourceType ? ` · ${e.sourceType}` : ''}
                        </p>
                        {e.kind === 'review' && (e.verifyNote || e.verifyTitle) && (
                          <p className="admin-log-row__ans">
                            {e.answerVerdict
                              ? `Réponse: ${e.answerVerdict}`
                              : ''}
                            {e.sourceVerdict
                              ? ` · Source: ${e.sourceVerdict}`
                              : ''}
                            {e.verifyProvider ? ` · ${e.verifyProvider}` : ''}
                            {e.verifyTitle ? ` · « ${e.verifyTitle} »` : ''}
                            {e.verifyNote ? ` — ${e.verifyNote}` : ''}
                          </p>
                        )}
                      </article>
                    ))}
                    {(logs.feedback?.events ?? []).length === 0 && (
                      <p className="admin-panel__empty">Aucun feedback</p>
                    )}
                  </div>
                )}

                {tab === 'errors' && logs && (
                  <div className="admin-panel__log">
                    <p className="admin-panel__tab-help">
                      Toutes les erreurs + ce que l’app a fait à la place
                      (bascule modèle, timeout, lot partiel, message joueur…).
                    </p>
                    <div className="admin-panel__toolbar">
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => void downloadErrors('errors-csv')}
                        title="Télécharger uniquement les erreurs en CSV"
                      >
                        CSV erreurs
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => void downloadErrors('errors-json')}
                        title="Télécharger uniquement les erreurs en JSON"
                      >
                        JSON erreurs
                      </button>
                    </div>
                    {logs.errors?.summary?.byScope &&
                      Object.keys(logs.errors.summary.byScope).length > 0 && (
                        <div className="admin-panel__fb-stats">
                          {Object.entries(logs.errors.summary.byScope).map(
                            ([scope, n]) => (
                              <span key={scope}>
                                {scope}: {n}
                              </span>
                            ),
                          )}
                          <span>total: {errCount}</span>
                        </div>
                      )}

                    {(aiGen?.models ?? [])
                      .filter((m) => m.fail > 0)
                      .map((m) => (
                        <article
                          key={`ai-err-${m.engine}-${m.model}`}
                          className="admin-log-row admin-log-row--ai"
                        >
                          <header>
                            <strong>
                              modèle · {m.engine} · {m.model}
                              {` · ${m.fail} err`}
                            </strong>
                            <time>
                              {m.lastErrorAt ? fmtTime(m.lastErrorAt) : '—'}
                            </time>
                          </header>
                          <p>
                            <span className="admin-log-row__label">Erreur</span>
                            {m.lastError ?? errorKindLabel(m.lastErrorKind)}
                          </p>
                          <p className="admin-log-row__instead">
                            <span className="admin-log-row__label">
                              À la place
                            </span>
                            {m.lastErrorKind === 'model_gone'
                              ? 'Modèle HS → suivant dans la pile'
                              : m.lastErrorKind === 'rate_limit'
                                ? '429 → autre clé / autre provider'
                                : m.lastErrorKind === 'json_invalid'
                                  ? 'JSON invalide → modèle suivant ou rattrapage'
                                  : m.lastErrorKind === 'timeout'
                                    ? 'Timeout → autre modèle / provider'
                                    : m.lastErrorKind === 'filtered'
                                      ? 'Questions filtrées → modèle suivant'
                                      : 'Bascule vers un autre modèle si possible'}
                          </p>
                        </article>
                      ))}

                    {(logs.errors?.events ?? []).slice(0, 150).map((e, i) => (
                      <article key={`${e.at}-${i}`} className="admin-log-row">
                        <header>
                          <strong>
                            {e.scope}
                            {e.status != null ? ` · ${e.status}` : ''}
                            {e.theme ? ` · ${e.theme}` : ''}
                          </strong>
                          <time>{fmtTime(e.at)}</time>
                        </header>
                        <p>
                          <span className="admin-log-row__label">Erreur</span>
                          {e.message}
                        </p>
                        <p className="admin-log-row__instead">
                          <span className="admin-log-row__label">
                            À la place
                          </span>
                          {e.instead ??
                            'Erreur renvoyée au joueur (pas de secours enregistré)'}
                        </p>
                        {(e.detail || e.path) && (
                          <p className="admin-log-row__ans">
                            {e.path ? `${e.path}` : ''}
                            {e.path && e.detail ? ' · ' : ''}
                            {e.detail ?? ''}
                          </p>
                        )}
                      </article>
                    ))}
                    {(logs.errors?.events ?? []).length === 0 &&
                      (aiGen?.models ?? []).every((m) => m.fail === 0) && (
                        <p className="admin-panel__empty">
                          Aucune erreur loggée
                        </p>
                      )}
                  </div>
                )}

                {tab === 'curated' && logs && (
                  <div className="admin-panel__section">
                    <p className="admin-panel__tab-help">
                      Pour l’instant : thèmes / sous-thèmes custom seulement
                      (ex. DOFUS → Jeux vidéo). Les questions en fichier ne sont
                      pas servies en jeu — bouton « Banque » grisé côté joueur.
                    </p>
                    <p className="admin-panel__meta">
                      {(logs.curated?.themeSlots ?? []).length} slots custom ·{' '}
                      {logs.curated?.count ?? 0} questions en fichiers
                    </p>
                    {(logs.curated?.themeSlots ?? []).length > 0 && (
                      <ul className="admin-curated-group__list">
                        {(logs.curated?.themeSlots ?? []).map((slot) => (
                          <li key={slot.groupKey} className="admin-curated-q">
                            <div className="admin-curated-q__body">
                              <p className="admin-curated-q__text">
                                {slot.placementKind === 'catalog'
                                  ? `${slot.theme}${
                                      slot.subTheme &&
                                      slot.subTheme !== 'Général'
                                        ? ` — ${slot.subTheme}`
                                        : ''
                                    }`
                                  : `Custom — ${slot.subTheme || slot.theme}`}
                                {slot.subIsCustom ? ' · custom' : ''}
                              </p>
                              <p className="admin-curated-q__meta">
                                {slot.questionCount} Q · {slot.path}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="admin-panel__fb-stats">
                      <span>
                        easy: {logs.curated?.summary?.byDifficulty?.easy ?? 0}
                      </span>
                      <span>
                        medium:{' '}
                        {logs.curated?.summary?.byDifficulty?.medium ?? 0}
                      </span>
                      <span>
                        hard: {logs.curated?.summary?.byDifficulty?.hard ?? 0}
                      </span>
                    </div>
                    {(logs.curated?.events ?? []).length === 0 ? (
                      <p className="admin-panel__empty">
                        Aucune question en fichier pour le moment.
                      </p>
                    ) : (
                      <div className="admin-curated-tree">
                        {(() => {
                          const groups = new Map<
                            string,
                            { label: string; items: CuratedBankEvent[] }
                          >()
                          for (const ev of logs.curated?.events ?? []) {
                            const label =
                              ev.placementKind === 'catalog'
                                ? `${ev.theme}${
                                    ev.subTheme && ev.subTheme !== 'Général'
                                      ? ` — ${ev.subTheme}`
                                      : ''
                                  }${ev.subIsCustom ? ' · custom' : ''}`
                                : `Custom — ${ev.subTheme || ev.theme}`
                            const key = ev.groupKey || label
                            const g = groups.get(key) ?? {
                              label,
                              items: [],
                            }
                            g.items.push(ev)
                            groups.set(key, g)
                          }
                          return [...groups.entries()]
                            .sort((a, b) =>
                              a[1].label.localeCompare(b[1].label, 'fr'),
                            )
                            .map(([key, g]) => {
                              const openGroup = curatedOpen[key] ?? false
                              return (
                                <section
                                  key={key}
                                  className="admin-curated-group"
                                >
                                  <button
                                    type="button"
                                    className="admin-curated-group__head"
                                    onClick={() =>
                                      setCuratedOpen((prev) => ({
                                        ...prev,
                                        [key]: !openGroup,
                                      }))
                                    }
                                  >
                                    <span>
                                      {openGroup ? '▾' : '▸'} {g.label}
                                    </span>
                                    <small>{g.items.length}</small>
                                  </button>
                                  {openGroup && (
                                    <ul className="admin-curated-group__list">
                                      {g.items.map((ev) => {
                                        const busyKey = `${ev.groupKey}::${ev.id}`
                                        return (
                                          <li
                                            key={busyKey}
                                            className="admin-curated-q"
                                          >
                                            <div className="admin-curated-q__body">
                                              <p className="admin-curated-q__text">
                                                {ev.question}
                                              </p>
                                              <p className="admin-curated-q__meta">
                                                {ev.difficulty} ·{' '}
                                                {ev.correctAnswer}
                                                {ev.sourceType
                                                  ? ` · ${ev.sourceType}`
                                                  : ''}
                                              </p>
                                            </div>
                                            <button
                                              type="button"
                                              className="btn btn--ghost admin-curated-q__del"
                                              disabled={
                                                curatedBusyId === busyKey
                                              }
                                              onClick={() =>
                                                void deleteCuratedEvent(ev)
                                              }
                                            >
                                              {curatedBusyId === busyKey
                                                ? '…'
                                                : 'Supprimer'}
                                            </button>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  )}
                                </section>
                              )
                            })
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'profiles' && (
                  <ProfilesAdminPanel secret={ADMIN_PANEL_CODE} />
                )}

                {tab === 'pendu' && (
                  <div className="admin-panel__section">
                    <p className="admin-panel__tab-help">
                      Mots générés par l’IA quand un palier a tout joué. À
                      copier plus tard dans la banque (penduWords). Ils sont
                      déjà jouables en filet.
                    </p>
                    <div className="admin-panel__toolbar">
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={penduLogBusy}
                        onClick={() => void loadPenduLog(ADMIN_PANEL_CODE)}
                      >
                        {penduLogBusy ? '…' : 'Rafraîchir'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={
                          penduLogBusy ||
                          !penduLog?.dump.length
                        }
                        onClick={() => {
                          const text = (penduLog?.dump ?? [])
                            .map((w) => `  '${w}',`)
                            .join('\n')
                          void navigator.clipboard.writeText(text).then(
                            () => setClearMsg('Liste copiée.'),
                            () => setLoadError('Copie impossible'),
                          )
                        }}
                      >
                        Copier la liste
                      </button>
                      <button
                        type="button"
                        className="admin-panel__danger"
                        disabled={penduLogBusy}
                        onClick={() => void handleClearPenduLog()}
                      >
                        Vider le log
                      </button>
                    </div>
                    <p className="admin-panel__meta">
                      {penduLog?.count ?? 0} lots · {penduLog?.wordCount ?? 0}{' '}
                      mots uniques
                    </p>
                    {(penduLog?.events ?? []).length === 0 ? (
                      <p className="admin-panel__empty">
                        Aucun mot IA pour l’instant — la banque locale suffit.
                      </p>
                    ) : (
                      <ul className="admin-curated-group__list">
                        {(penduLog?.events ?? []).map((ev) => (
                          <li key={ev.id} className="admin-curated-q">
                            <div className="admin-curated-q__body">
                              <p className="admin-curated-q__text">
                                {ev.words.join(' · ')}
                              </p>
                              <p className="admin-curated-q__meta">
                                {ev.difficulty === 'easy'
                                  ? 'Facile'
                                  : ev.difficulty === 'hard'
                                    ? 'Difficile'
                                    : 'Moyen'}
                                {ev.mode ? ` · ${ev.mode}` : ''} ·{' '}
                                {ev.source} ·{' '}
                                {ev.at
                                  ? new Date(ev.at).toLocaleString('fr-FR')
                                  : ''}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {tab === 'ai' && (
                  <div className="admin-panel__section">
                    <p className="admin-panel__tab-help">
                      Compteurs Jour (Paris) / Mois / Global. Le détail des
                      modèles suit la période sélectionnée.
                    </p>
                    {aiNote && (
                      <p className="admin-panel__meta">{aiNote}</p>
                    )}
                    <div className="admin-panel__toolbar">
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => void loadAiCapacity(ADMIN_PANEL_CODE)}
                        title="Recharger capacité + compteur"
                      >
                        Rafraîchir
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={resettingAi}
                        onClick={() => void handleResetAiGen('day')}
                      >
                        {resettingAi ? 'Reset…' : 'Reset jour'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={resettingAi}
                        onClick={() => void handleResetAiGen('month')}
                      >
                        {resettingAi ? 'Reset…' : 'Reset mois'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={resettingAi}
                        onClick={() => void handleResetAiGen('all')}
                      >
                        {resettingAi ? 'Reset…' : 'Reset tout'}
                      </button>
                      <button
                        type="button"
                        className="admin-panel__file"
                        onClick={() => void downloadAiHistory('history-json')}
                        title="Télécharger le journal IA (jours + mois)"
                      >
                        Télécharger logs
                      </button>
                    </div>

                    {aiGen && (
                      <div className="admin-panel__ai-periods">
                        {(
                          [
                            ['day', 'Jour', aiGen.day, aiGen.keys?.day],
                            ['month', 'Mois', aiGen.month, aiGen.keys?.month],
                            ['all', 'Global', aiGen.all ?? aiGen, null],
                          ] as const
                        ).map(([id, label, snap, key]) => (
                          <button
                            key={id}
                            type="button"
                            className={`admin-panel__ai-period${
                              aiPeriod === id ? ' is-on' : ''
                            }`}
                            onClick={() => setAiPeriod(id)}
                          >
                            <strong>
                              {label}
                              {key ? ` ${key}` : ''}
                            </strong>
                            <span>
                              {fmtNum(snap?.totals.calls ?? 0)} OK ·{' '}
                              {fmtNum(snap?.failTotal ?? 0)} err
                            </span>
                            <span>
                              {fmtNum(snap?.totals.tokensTotal ?? 0)} tok
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {(() => {
                      const snap = pickAiSnapshot(aiGen)
                      if (!snap) return null
                      return (
                        <>
                          <div className="admin-panel__ai-totals">
                            <span>
                              Période:{' '}
                              <strong>
                                {aiPeriod === 'day'
                                  ? `Jour ${aiGen?.keys?.day ?? ''}`
                                  : aiPeriod === 'month'
                                    ? `Mois ${aiGen?.keys?.month ?? ''}`
                                    : 'Global'}
                              </strong>
                            </span>
                            <span>
                              OK:{' '}
                              <strong>{fmtNum(snap.totals.calls)}</strong>
                            </span>
                            <span>
                              Erreurs:{' '}
                              <strong>{fmtNum(snap.failTotal ?? 0)}</strong>
                            </span>
                            <span>
                              Tokens:{' '}
                              <strong>
                                {fmtTok(snap.totals.tokensTotal)}
                              </strong>
                              {aiPeriod === 'day' &&
                              (snap.tokensLimitDayTotal ?? 0) > 0
                                ? ` / ${fmtTok(snap.tokensLimitDayTotal ?? 0)}`
                                : ''}
                            </span>
                          </div>
                          {aiPeriod === 'day' && (
                            <p className="admin-panel__tab-help">
                              Plafonds jour : Groq gpt-oss = 200K TPD officiels ;
                              Compound / Gemini / OpenRouter = budgets soft de
                              suivi (pas de TPD officiel).
                            </p>
                          )}

                          {groupModelsByEngine(snap.models ?? []).map(
                            (group) => {
                              const okSum = group.models.reduce(
                                (s, m) => s + m.ok,
                                0,
                              )
                              const failSum = group.models.reduce(
                                (s, m) => s + m.fail,
                                0,
                              )
                              const engStats = (snap.byEngine ?? []).find(
                                (e) => e.engine === group.engine,
                              )
                              const topupCalls = engStats?.topup.calls ?? 0
                              const topupTok =
                                engStats?.topup.tokensTotal ?? 0
                              return (
                                <div
                                  key={group.engine}
                                  className="admin-panel__ai-engine"
                                >
                                  <h3 className="admin-panel__ai-engine-title">
                                    {engineLabel(group.engine)}
                                    <small>
                                      {fmtNum(okSum)} OK · {fmtNum(failSum)}{' '}
                                      err · {group.models.length} modèles
                                    </small>
                                  </h3>
                                  <p className="admin-panel__ai-engine-topup">
                                    Rattrapage :{' '}
                                    <strong>{fmtNum(topupCalls)}</strong> fois
                                    {' · '}
                                    <strong>{fmtTok(topupTok)}</strong> tok
                                    {engStats ? (
                                      <>
                                        {' · '}Principal :{' '}
                                        <strong>
                                          {fmtNum(engStats.full.calls)}
                                        </strong>{' '}
                                        ·{' '}
                                        <strong>
                                          {fmtTok(engStats.full.tokensTotal)}
                                        </strong>{' '}
                                        tok
                                      </>
                                    ) : null}
                                  </p>
                                  <div className="admin-panel__ai-table-wrap">
                                    <table className="admin-panel__ai-table">
                                      <thead>
                                        <tr>
                                          <th>Modèle</th>
                                          <th>Tokens jour</th>
                                          <th>Appels OK</th>
                                          <th>Erreurs</th>
                                          <th>Type</th>
                                          <th>Statut</th>
                                          <th>Dernière erreur</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {group.models.map((m) => {
                                          const lim = m.tokensLimitDay ?? 0
                                          const used = m.tokensTotal
                                          const over =
                                            lim > 0 && used >= lim
                                          return (
                                          <tr
                                            key={`health:${m.engine}:${m.model}`}
                                            className={
                                              m.status === 'down'
                                                ? 'admin-panel__ai-row--down'
                                                : m.status === 'warn' || over
                                                  ? 'admin-panel__ai-row--warn'
                                                  : undefined
                                            }
                                          >
                                            <td className="admin-panel__ai-model">
                                              {m.model}
                                              {m.tokensLimitNote ===
                                              'official_tpd' ? (
                                                <small> · TPD</small>
                                              ) : null}
                                            </td>
                                            <td
                                              title={
                                                lim > 0
                                                  ? `${fmtNum(used)} / ${fmtNum(lim)}`
                                                  : undefined
                                              }
                                            >
                                              <strong>
                                                {fmtTok(used)}
                                                {lim > 0
                                                  ? ` / ${fmtTok(lim)}`
                                                  : ''}
                                              </strong>
                                            </td>
                                            <td>{fmtNum(m.ok)}</td>
                                            <td>{fmtNum(m.fail)}</td>
                                            <td>
                                              {errorKindLabel(m.lastErrorKind)}
                                            </td>
                                            <td>
                                              <strong>
                                                {over
                                                  ? 'plafond'
                                                  : statusLabel(m.status)}
                                              </strong>
                                            </td>
                                            <td
                                              className="admin-panel__ai-err"
                                              title={m.lastError ?? undefined}
                                            >
                                              {m.lastError
                                                ? `${m.lastError.slice(0, 70)}${
                                                    m.lastError.length > 70
                                                      ? '…'
                                                      : ''
                                                  }`
                                                : '—'}
                                              {m.lastErrorAt
                                                ? ` · ${fmtTime(m.lastErrorAt)}`
                                                : ''}
                                            </td>
                                          </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )
                            },
                          )}

                          {(snap.models?.length ?? 0) === 0 && (
                            <p className="admin-panel__empty">
                              Aucun modèle listé — rafraîchis ou génère un quiz.
                            </p>
                          )}

                          {snap.byMode && (
                            <div className="admin-panel__ai-totals admin-panel__ai-totals--modes">
                              <span>
                                Principal:{' '}
                                <strong>
                                  {fmtNum(snap.byMode.full.calls)}
                                </strong>{' '}
                                ·{' '}
                                <strong>
                                  {fmtNum(snap.byMode.full.tokensTotal)}
                                </strong>{' '}
                                tok
                              </span>
                              <span>
                                Rattrapage:{' '}
                                <strong>
                                  {fmtNum(snap.byMode.topup.calls)}
                                </strong>{' '}
                                ·{' '}
                                <strong>
                                  {fmtNum(snap.byMode.topup.tokensTotal)}
                                </strong>{' '}
                                tok
                              </span>
                              <span>
                                Total:{' '}
                                <strong>
                                  {fmtNum(
                                    snap.byMode.full.calls +
                                      snap.byMode.topup.calls +
                                      (snap.byMode.legacy?.calls ?? 0),
                                  )}
                                </strong>{' '}
                                ·{' '}
                                <strong>
                                  {fmtNum(
                                    snap.byMode.full.tokensTotal +
                                      snap.byMode.topup.tokensTotal +
                                      (snap.byMode.legacy?.tokensTotal ?? 0),
                                  )}
                                </strong>{' '}
                                tok
                              </span>
                            </div>
                          )}
                        </>
                      )
                    })()}

                    <div className="admin-panel__ai-history">
                      <p className="admin-panel__meta">
                        Journal auto (sauvegardé à chaque gen — survit aux
                        resets)
                      </p>
                      <div className="admin-panel__toolbar">
                        <button
                          type="button"
                          className={`btn ${
                            aiHistoryKind === 'day'
                              ? 'btn--primary'
                              : 'btn--ghost'
                          }`}
                          onClick={() => setAiHistoryKind('day')}
                        >
                          Jours
                        </button>
                        <button
                          type="button"
                          className={`btn ${
                            aiHistoryKind === 'month'
                              ? 'btn--primary'
                              : 'btn--ghost'
                          }`}
                          onClick={() => setAiHistoryKind('month')}
                        >
                          Mois
                        </button>
                      </div>
                      {(aiHistoryKind === 'day'
                        ? aiHistory?.days ?? []
                        : aiHistory?.months ?? []
                      ).length > 0 ? (
                        <div className="admin-panel__ai-table-wrap">
                          <table className="admin-panel__ai-table">
                            <thead>
                              <tr>
                                <th>
                                  {aiHistoryKind === 'day' ? 'Jour' : 'Mois'}
                                </th>
                                <th>OK</th>
                                <th>Err</th>
                                <th>Tokens</th>
                                <th>Principal</th>
                                <th>Rattrapage</th>
                                <th>Maj</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(aiHistoryKind === 'day'
                                ? aiHistory?.days ?? []
                                : aiHistory?.months ?? []
                              )
                                .slice(0, 40)
                                .map((h) => (
                                  <tr key={`${h.kind}:${h.key}`}>
                                    <td>{h.key}</td>
                                    <td>{fmtNum(h.ok)}</td>
                                    <td>{fmtNum(h.fail)}</td>
                                    <td>
                                      <strong>
                                        {fmtNum(h.tokensTotal)}
                                      </strong>
                                    </td>
                                    <td>
                                      {fmtNum(h.principalCalls)} ·{' '}
                                      {fmtNum(h.principalTokens)} tok
                                    </td>
                                    <td>
                                      {fmtNum(h.topupCalls)} ·{' '}
                                      {fmtNum(h.topupTokens)} tok
                                    </td>
                                    <td>{fmtTime(h.updatedAt)}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="admin-panel__empty">
                          Journal vide — se remplit à la prochaine génération.
                        </p>
                      )}
                    </div>

                    <p className="admin-panel__meta" style={{ marginTop: '0.75rem' }}>
                      Slots parallèles (capacité live)
                    </p>
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
            {unlocked && (
              <div
                className="admin-panel__resize"
                onPointerDown={onResizePointerDown}
                onPointerMove={onResizePointerMove}
                onPointerUp={onResizePointerUp}
                onPointerCancel={onResizePointerUp}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Redimensionner le panneau"
                title="Redimensionner"
              />
            )}
          </section>
        </div>
      )}
    </>
  )

  return createPortal(ui, document.body)
}
