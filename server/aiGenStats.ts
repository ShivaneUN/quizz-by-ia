/**
 * Compteur générations IA + tokens + erreurs par modèle.
 * Périodes : jour (Europe/Paris) · mois · global.
 * Redis (prod) / mémoire (dev).
 */

import { redisCommand, redisConfigured } from './rooms.js'
import {
  getModelDayTokenCap,
  sumDayTokenCaps,
} from './aiTokenQuotas.js'

const REDIS_HASH = 'quizz:ai:gen:stats'
const REDIS_ERR = 'quizz:ai:gen:errors'

export type AiGenMode = 'full' | 'topup'
export type AiGenPeriod = 'day' | 'month' | 'all'

export type AiErrorKind =
  | 'model_gone'
  | 'rate_limit'
  | 'timeout'
  | 'json_invalid'
  | 'filtered'
  | 'other'

export interface AiGenRecordInput {
  engine: string
  model: string
  mode?: AiGenMode
  tokensIn: number
  tokensOut: number
  questions: number
}

export interface AiGenErrorInput {
  engine: string
  model: string
  kind: AiErrorKind
  message: string
}

export interface AiGenModelRow {
  engine: string
  model: string
  mode: AiGenMode | 'legacy'
  calls: number
  questions: number
  tokensIn: number
  tokensOut: number
  tokensTotal: number
  tiersApprox: number
}

export interface AiModelHealthRow {
  engine: string
  model: string
  configured: boolean
  ok: number
  fail: number
  questions: number
  tokensTotal: number
  /** Plafond tokens / jour (réf. free tier ou soft). */
  tokensLimitDay: number
  /** official_tpd = Groq publié ; soft_estimate = suivi app. */
  tokensLimitNote: 'official_tpd' | 'soft_estimate'
  lastErrorKind: AiErrorKind | null
  lastError: string | null
  lastErrorAt: number | null
  status: 'ok' | 'warn' | 'down' | 'idle'
}

export type AiGenTotals = {
  calls: number
  questions: number
  tiersApprox: number
  tokensIn: number
  tokensOut: number
  tokensTotal: number
}

export type AiGenSnapshot = {
  rows: AiGenModelRow[]
  totals: AiGenTotals
  byMode: {
    full: AiGenTotals
    topup: AiGenTotals
    legacy: AiGenTotals
  }
  /** Agrégat par provider (Gemini / Groq / …) — principal vs rattrapage. */
  byEngine: AiEngineModeStats[]
  models: AiModelHealthRow[]
  failTotal: number
  /** Somme des plafonds jour de tous les modèles configurés. */
  tokensLimitDayTotal: number
}

export type AiEngineModeStats = {
  engine: string
  full: AiGenTotals
  topup: AiGenTotals
  tokensTotal: number
}

type Bucket = {
  calls: number
  questions: number
  tokensIn: number
  tokensOut: number
}

type ErrBucket = {
  fail: number
  lastKind: AiErrorKind
  lastMsg: string
  lastAt: number
}

/** mémoire : `${periodTag}\x1e${bucketId}` */
const memory = new Map<string, Bucket>()
const errMemory = new Map<string, ErrBucket>()

let configuredModels: Array<{ engine: string; model: string }> = [
  { engine: 'gemini', model: 'gemini-flash-lite-latest' },
  { engine: 'gemini', model: 'gemini-flash-latest' },
  { engine: 'gemini', model: 'gemini-3.5-flash' },
  { engine: 'gemini', model: 'gemini-3.1-flash-lite' },
  { engine: 'groq', model: 'openai/gpt-oss-20b' },
  { engine: 'groq', model: 'openai/gpt-oss-120b' },
  { engine: 'groq', model: 'groq/compound-mini' },
  { engine: 'groq', model: 'groq/compound' },
  { engine: 'openrouter', model: 'google/gemma-4-31b-it:free' },
  { engine: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
  { engine: 'openrouter', model: 'nvidia/nemotron-3.5-lightning:free' },
  { engine: 'openrouter', model: 'google/gemma-4-26b-a4b-it:free' },
  {
    engine: 'openrouter',
    model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  },
  { engine: 'openrouter', model: 'z-ai/glm-5.2:free' },
  { engine: 'openrouter', model: 'liquid/lfm-2.5-2.6b:free' },
  { engine: 'openrouter', model: 'openrouter/free' },
]

export function setConfiguredAiModels(
  models: Array<{ engine: string; model: string }>,
): void {
  configuredModels = models.map((m) => ({
    engine: String(m.engine).trim().slice(0, 24),
    model: String(m.model).trim().slice(0, 80),
  }))
}

export function classifyAiError(msg: string): AiErrorKind {
  if (/\b404\b|no longer available|does not exist|not found|unsupported/i.test(msg)) {
    return 'model_gone'
  }
  if (/\b429\b|rate limit|too many requests|quota|resource.exhausted|resource_exhausted/i.test(msg)) {
    return 'rate_limit'
  }
  if (/504|503|524|502|délai dépassé|timeout|timed out|gateway|abort|high demand/i.test(msg)) {
    return 'timeout'
  }
  if (/json invalide|failed to validate json/i.test(msg)) {
    return 'json_invalid'
  }
  if (/aucune question valide|filtrées/i.test(msg)) {
    return 'filtered'
  }
  return 'other'
}

/** Jour / mois calendaire Europe/Paris. */
export function parisPeriodKeys(now = Date.now()): { day: string; month: string } {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
  return { day, month: day.slice(0, 7) }
}

function periodTags(now = Date.now()): string[] {
  const { day, month } = parisPeriodKeys(now)
  return ['all', `day:${day}`, `month:${month}`]
}

function redisStatHash(tag: string): string {
  return tag === 'all' ? REDIS_HASH : `${REDIS_HASH}:${tag}`
}

function redisErrHash(tag: string): string {
  return tag === 'all' ? REDIS_ERR : `${REDIS_ERR}:${tag}`
}

function normalizeMode(raw: unknown): AiGenMode {
  return raw === 'topup' ? 'topup' : 'full'
}

function bucketId(engine: string, model: string, mode: string): string {
  return `${engine}\x1f${model}\x1f${mode}`
}

function errId(engine: string, model: string): string {
  return `${engine}\x1f${model}`
}

function memKey(tag: string, id: string): string {
  return `${tag}\x1e${id}`
}

function statKey(
  engine: string,
  model: string,
  mode: AiGenMode,
  field: keyof Bucket,
): string {
  return `${engine}\x1f${model}\x1f${mode}\x1f${field}`
}

function errFieldKey(engine: string, model: string, field: string): string {
  return `${engine}\x1f${model}\x1f${field}`
}

function parseStatKey(
  key: string,
): { engine: string; model: string; mode: string; field: keyof Bucket } | null {
  const parts = key.split('\x1f')
  const fieldOk = (f: string): f is keyof Bucket =>
    f === 'calls' || f === 'questions' || f === 'tokensIn' || f === 'tokensOut'

  if (parts.length === 4 && fieldOk(parts[3]!)) {
    return {
      engine: parts[0]!,
      model: parts[1]!,
      mode: parts[2]! === 'topup' ? 'topup' : parts[2]! === 'full' ? 'full' : 'legacy',
      field: parts[3]!,
    }
  }
  if (parts.length === 3 && fieldOk(parts[2]!)) {
    return {
      engine: parts[0]!,
      model: parts[1]!,
      mode: 'legacy',
      field: parts[2]!,
    }
  }
  return null
}

function bumpMemoryTag(
  tag: string,
  engine: string,
  model: string,
  mode: AiGenMode,
  input: AiGenRecordInput,
): void {
  const id = memKey(tag, bucketId(engine, model, mode))
  const cur = memory.get(id) ?? {
    calls: 0,
    questions: 0,
    tokensIn: 0,
    tokensOut: 0,
  }
  cur.calls += 1
  cur.questions += Math.max(0, input.questions)
  cur.tokensIn += Math.max(0, input.tokensIn)
  cur.tokensOut += Math.max(0, input.tokensOut)
  memory.set(id, cur)
}

async function incrStatHash(
  tag: string,
  engine: string,
  model: string,
  mode: AiGenMode,
  input: AiGenRecordInput,
): Promise<void> {
  const hash = redisStatHash(tag)
  await redisCommand('HINCRBY', hash, statKey(engine, model, mode, 'calls'), 1)
  await redisCommand(
    'HINCRBY',
    hash,
    statKey(engine, model, mode, 'questions'),
    Math.max(0, Math.floor(input.questions)),
  )
  await redisCommand(
    'HINCRBY',
    hash,
    statKey(engine, model, mode, 'tokensIn'),
    Math.max(0, Math.floor(input.tokensIn)),
  )
  await redisCommand(
    'HINCRBY',
    hash,
    statKey(engine, model, mode, 'tokensOut'),
    Math.max(0, Math.floor(input.tokensOut)),
  )
  if (tag.startsWith('day:')) {
    await redisCommand('EXPIRE', hash, 60 * 60 * 24 * 4)
  } else if (tag.startsWith('month:')) {
    await redisCommand('EXPIRE', hash, 60 * 60 * 24 * 45)
  }
}

export async function recordAiGeneration(input: AiGenRecordInput): Promise<void> {
  const engine = String(input.engine ?? '').trim().slice(0, 24)
  const model = String(input.model ?? '').trim().slice(0, 80)
  const mode = normalizeMode(input.mode)
  if (!engine || !model) return

  const tags = periodTags()
  for (const tag of tags) bumpMemoryTag(tag, engine, model, mode, input)

  if (!redisConfigured()) {
    void import('./aiGenHistory.js').then((m) => m.scheduleAiGenHistorySave())
    return
  }
  try {
    for (const tag of tags) {
      await incrStatHash(tag, engine, model, mode, input)
    }
  } catch {
    /* mémoire OK */
  }
  void import('./aiGenHistory.js').then((m) => m.scheduleAiGenHistorySave())
}

export async function recordAiModelError(input: AiGenErrorInput): Promise<void> {
  const engine = String(input.engine ?? '').trim().slice(0, 24)
  const model = String(input.model ?? '').trim().slice(0, 80)
  if (!engine || !model) return
  const kind = input.kind
  const message = String(input.message ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
  const at = Date.now()
  const id = errId(engine, model)
  const tags = periodTags(at)

  for (const tag of tags) {
    const mk = memKey(tag, id)
    const cur = errMemory.get(mk) ?? {
      fail: 0,
      lastKind: kind,
      lastMsg: message,
      lastAt: at,
    }
    cur.fail += 1
    cur.lastKind = kind
    cur.lastMsg = message
    cur.lastAt = at
    errMemory.set(mk, cur)
  }

  if (!redisConfigured()) {
    void import('./aiGenHistory.js').then((m) => m.scheduleAiGenHistorySave())
    return
  }
  try {
    for (const tag of tags) {
      const hash = redisErrHash(tag)
      await redisCommand('HINCRBY', hash, errFieldKey(engine, model, 'fail'), 1)
      await redisCommand('HSET', hash, errFieldKey(engine, model, 'lastKind'), kind)
      await redisCommand('HSET', hash, errFieldKey(engine, model, 'lastMsg'), message)
      await redisCommand('HSET', hash, errFieldKey(engine, model, 'lastAt'), String(at))
      if (tag.startsWith('day:')) {
        await redisCommand('EXPIRE', hash, 60 * 60 * 24 * 4)
      } else if (tag.startsWith('month:')) {
        await redisCommand('EXPIRE', hash, 60 * 60 * 24 * 45)
      }
    }
  } catch {
    /* mémoire OK */
  }
  void import('./aiGenHistory.js').then((m) => m.scheduleAiGenHistorySave())
}

function emptyTotals(): AiGenTotals {
  return {
    calls: 0,
    questions: 0,
    tiersApprox: 0,
    tokensIn: 0,
    tokensOut: 0,
    tokensTotal: 0,
  }
}

function addRowToTotals(acc: AiGenTotals, r: AiGenModelRow): void {
  acc.calls += r.calls
  acc.questions += r.questions
  acc.tiersApprox += r.tiersApprox
  acc.tokensIn += r.tokensIn
  acc.tokensOut += r.tokensOut
  acc.tokensTotal += r.tokensTotal
}

function rowsFromBuckets(buckets: Map<string, Bucket>): AiGenModelRow[] {
  const rows: AiGenModelRow[] = []
  for (const [id, b] of buckets) {
    const parts = id.split('\x1f')
    if (parts.length < 2) continue
    const engine = parts[0]!
    const model = parts[1]!
    const modeRaw = parts[2]
    const mode: AiGenModelRow['mode'] =
      modeRaw === 'topup' ? 'topup' : modeRaw === 'full' ? 'full' : 'legacy'
    rows.push({
      engine,
      model,
      mode,
      calls: b.calls,
      questions: b.questions,
      tokensIn: b.tokensIn,
      tokensOut: b.tokensOut,
      tokensTotal: b.tokensIn + b.tokensOut,
      tiersApprox: Math.floor(b.questions / 10),
    })
  }
  rows.sort(
    (a, b) =>
      b.tokensTotal - a.tokensTotal ||
      b.calls - a.calls ||
      a.engine.localeCompare(b.engine) ||
      a.model.localeCompare(b.model) ||
      a.mode.localeCompare(b.mode),
  )
  return rows
}

function mergeHashIntoBuckets(
  hash: Record<string, string | number>,
  buckets: Map<string, Bucket>,
): void {
  for (const [key, raw] of Object.entries(hash)) {
    const parsed = parseStatKey(key)
    if (!parsed) continue
    const n = Number(raw)
    if (!Number.isFinite(n)) continue
    const id = bucketId(parsed.engine, parsed.model, parsed.mode)
    const cur = buckets.get(id) ?? {
      calls: 0,
      questions: 0,
      tokensIn: 0,
      tokensOut: 0,
    }
    cur[parsed.field] += n
    buckets.set(id, cur)
  }
}

function parseErrKind(raw: string): AiErrorKind {
  if (
    raw === 'model_gone' ||
    raw === 'rate_limit' ||
    raw === 'timeout' ||
    raw === 'json_invalid' ||
    raw === 'filtered' ||
    raw === 'other'
  ) {
    return raw
  }
  return 'other'
}

function mergeErrHash(
  hash: Record<string, string | number>,
  out: Map<string, ErrBucket>,
): void {
  for (const [key, raw] of Object.entries(hash)) {
    const parts = key.split('\x1f')
    if (parts.length !== 3) continue
    const engine = parts[0]!
    const model = parts[1]!
    const field = parts[2]!
    const id = errId(engine, model)
    const cur = out.get(id) ?? {
      fail: 0,
      lastKind: 'other' as AiErrorKind,
      lastMsg: '',
      lastAt: 0,
    }
    if (field === 'fail') {
      const n = Number(raw)
      if (Number.isFinite(n)) cur.fail += n
    } else if (field === 'lastKind') {
      cur.lastKind = parseErrKind(String(raw))
    } else if (field === 'lastMsg') {
      cur.lastMsg = String(raw)
    } else if (field === 'lastAt') {
      const n = Number(raw)
      if (Number.isFinite(n)) cur.lastAt = n
    }
    out.set(id, cur)
  }
}

function healthStatus(
  ok: number,
  fail: number,
  lastKind: AiErrorKind | null,
): AiModelHealthRow['status'] {
  if (ok === 0 && fail === 0) return 'idle'
  if (lastKind === 'model_gone') return 'down'
  if (fail > 0 && (ok === 0 || fail >= ok)) return 'warn'
  if (fail > 0) return 'warn'
  return 'ok'
}

function buildModelHealth(
  successRows: AiGenModelRow[],
  errs: Map<string, ErrBucket>,
): AiModelHealthRow[] {
  type Agg = { ok: number; questions: number; tokensTotal: number }
  const byModel = new Map<string, Agg>()

  for (const r of successRows) {
    const id = errId(r.engine, r.model)
    const cur = byModel.get(id) ?? { ok: 0, questions: 0, tokensTotal: 0 }
    cur.ok += r.calls
    cur.questions += r.questions
    cur.tokensTotal += r.tokensTotal
    byModel.set(id, cur)
  }

  const ids = new Set<string>()
  for (const m of configuredModels) ids.add(errId(m.engine, m.model))
  for (const id of byModel.keys()) ids.add(id)
  for (const id of errs.keys()) ids.add(id)

  const rows: AiModelHealthRow[] = []
  for (const id of ids) {
    const sep = id.indexOf('\x1f')
    if (sep <= 0) continue
    const engine = id.slice(0, sep)
    const model = id.slice(sep + 1)
    const agg = byModel.get(id) ?? { ok: 0, questions: 0, tokensTotal: 0 }
    const err = errs.get(id)
    const lastKind = err?.lastKind ?? null
    const fail = err?.fail ?? 0
    rows.push({
      engine,
      model,
      configured: configuredModels.some(
        (m) => m.engine === engine && m.model === model,
      ),
      ok: agg.ok,
      fail,
      questions: agg.questions,
      tokensTotal: agg.tokensTotal,
      tokensLimitDay: getModelDayTokenCap(engine, model).limit,
      tokensLimitNote: getModelDayTokenCap(engine, model).note,
      lastErrorKind: fail > 0 ? lastKind : null,
      lastError: fail > 0 && err?.lastMsg ? err.lastMsg : null,
      lastErrorAt: fail > 0 && err?.lastAt ? err.lastAt : null,
      status: healthStatus(agg.ok, fail, fail > 0 ? lastKind : null),
    })
  }

  rows.sort(
    (a, b) =>
      (a.status === 'down' ? 0 : a.status === 'warn' ? 1 : a.status === 'ok' ? 2 : 3) -
        (b.status === 'down' ? 0 : b.status === 'warn' ? 1 : b.status === 'ok' ? 2 : 3) ||
      b.ok + b.fail - (a.ok + a.fail) ||
      a.engine.localeCompare(b.engine) ||
      a.model.localeCompare(b.model),
  )
  return rows
}

function asHash(raw: unknown): Record<string, string | number> {
  if (!raw) return {}
  if (Array.isArray(raw)) {
    const out: Record<string, string | number> = {}
    for (let i = 0; i + 1 < raw.length; i += 2) {
      out[String(raw[i])] = raw[i + 1] as string | number
    }
    return out
  }
  if (typeof raw === 'object') return raw as Record<string, string | number>
  return {}
}

const AI_ENGINE_DISPLAY_ORDER = ['gemini', 'groq', 'openrouter'] as const

function emptySnapshot(): AiGenSnapshot {
  return {
    rows: [],
    totals: emptyTotals(),
    byMode: {
      full: emptyTotals(),
      topup: emptyTotals(),
      legacy: emptyTotals(),
    },
    byEngine: [],
    models: buildModelHealth([], new Map()),
    failTotal: 0,
    tokensLimitDayTotal: sumDayTokenCaps(configuredModels),
  }
}

function buildByEngine(rows: AiGenModelRow[]): AiEngineModeStats[] {
  const map = new Map<string, { full: AiGenTotals; topup: AiGenTotals }>()
  for (const r of rows) {
    const cur = map.get(r.engine) ?? {
      full: emptyTotals(),
      topup: emptyTotals(),
    }
    if (r.mode === 'topup') addRowToTotals(cur.topup, r)
    else addRowToTotals(cur.full, r)
    map.set(r.engine, cur)
  }
  const orderIdx = (engine: string) => {
    const i = AI_ENGINE_DISPLAY_ORDER.indexOf(
      engine as (typeof AI_ENGINE_DISPLAY_ORDER)[number],
    )
    return i >= 0 ? i : 99
  }
  const out: AiEngineModeStats[] = []
  for (const [engine, cur] of map) {
    out.push({
      engine,
      full: cur.full,
      topup: cur.topup,
      tokensTotal: cur.full.tokensTotal + cur.topup.tokensTotal,
    })
  }
  out.sort(
    (a, b) => orderIdx(a.engine) - orderIdx(b.engine) || b.tokensTotal - a.tokensTotal,
  )
  return out
}

async function loadSnapshot(tag: string): Promise<AiGenSnapshot> {
  const buckets = new Map<string, Bucket>()
  const errs = new Map<string, ErrBucket>()
  const prefix = `${tag}\x1e`

  if (redisConfigured()) {
    try {
      const hash = await redisCommand<unknown>('HGETALL', redisStatHash(tag))
      mergeHashIntoBuckets(asHash(hash), buckets)
    } catch {
      /* ignore */
    }
    try {
      const ehash = await redisCommand<unknown>('HGETALL', redisErrHash(tag))
      mergeErrHash(asHash(ehash), errs)
    } catch {
      /* ignore */
    }
  }

  if (buckets.size === 0) {
    for (const [k, b] of memory) {
      if (!k.startsWith(prefix)) continue
      buckets.set(k.slice(prefix.length), { ...b })
    }
  }
  if (errs.size === 0) {
    for (const [k, b] of errMemory) {
      if (!k.startsWith(prefix)) continue
      errs.set(k.slice(prefix.length), { ...b })
    }
  }

  const rows = rowsFromBuckets(buckets)
  const totals = emptyTotals()
  const byMode = {
    full: emptyTotals(),
    topup: emptyTotals(),
    legacy: emptyTotals(),
  }
  for (const r of rows) {
    addRowToTotals(totals, r)
    if (r.mode === 'topup') addRowToTotals(byMode.topup, r)
    else if (r.mode === 'full') addRowToTotals(byMode.full, r)
    else addRowToTotals(byMode.legacy, r)
  }
  const models = buildModelHealth(rows, errs)
  const failTotal = models.reduce((s, m) => s + m.fail, 0)
  return {
    rows,
    totals,
    byMode,
    byEngine: buildByEngine(rows),
    models,
    failTotal,
    tokensLimitDayTotal: sumDayTokenCaps(configuredModels),
  }
}

/** Tokens déjà consommés aujourd’hui (Paris) pour un modèle. */
export async function getDayTokensForModel(
  engine: string,
  model: string,
): Promise<number> {
  const { day } = parisPeriodKeys()
  const snap = await loadSnapshot(`day:${day}`)
  const row = snap.models.find(
    (m) => m.engine === engine && m.model === model,
  )
  return row?.tokensTotal ?? 0
}

/** true si le modèle a déjà atteint son plafond tokens / jour. */
export async function isModelDayTokenCapped(
  engine: string,
  model: string,
): Promise<boolean> {
  const used = await getDayTokensForModel(engine, model)
  const { limit } = getModelDayTokenCap(engine, model)
  return used >= limit
}

export async function getAiGenStats(): Promise<
  AiGenSnapshot & {
    keys: { day: string; month: string }
    day: AiGenSnapshot
    month: AiGenSnapshot
    all: AiGenSnapshot
  }
> {
  const { day, month } = parisPeriodKeys()
  const [daySnap, monthSnap, allSnap] = await Promise.all([
    loadSnapshot(`day:${day}`),
    loadSnapshot(`month:${month}`),
    loadSnapshot('all'),
  ])
  return {
    ...allSnap,
    keys: { day, month },
    day: daySnap,
    month: monthSnap,
    all: allSnap,
  }
}

/** Reset uniquement le compteur du jour (Paris). Global + mois inchangés. */
export async function clearAiGenDayStats(): Promise<{ day: string }> {
  try {
    const hist = await import('./aiGenHistory.js')
    await hist.autoSaveAiGenHistory()
  } catch {
    /* ignore */
  }
  const { day } = parisPeriodKeys()
  const tag = `day:${day}`
  const prefix = `${tag}\x1e`
  for (const k of [...memory.keys()]) {
    if (k.startsWith(prefix)) memory.delete(k)
  }
  for (const k of [...errMemory.keys()]) {
    if (k.startsWith(prefix)) errMemory.delete(k)
  }
  if (redisConfigured()) {
    try {
      await redisCommand('DEL', redisStatHash(tag))
      await redisCommand('DEL', redisErrHash(tag))
    } catch {
      /* ignore */
    }
  }
  return { day }
}

/** Reset uniquement le compteur du mois (Paris). Jour + global inchangés. */
export async function clearAiGenMonthStats(): Promise<{ month: string }> {
  try {
    const hist = await import('./aiGenHistory.js')
    await hist.autoSaveAiGenHistory()
  } catch {
    /* ignore */
  }
  const { month } = parisPeriodKeys()
  const tag = `month:${month}`
  const prefix = `${tag}\x1e`
  for (const k of [...memory.keys()]) {
    if (k.startsWith(prefix)) memory.delete(k)
  }
  for (const k of [...errMemory.keys()]) {
    if (k.startsWith(prefix)) errMemory.delete(k)
  }
  if (redisConfigured()) {
    try {
      await redisCommand('DEL', redisStatHash(tag))
      await redisCommand('DEL', redisErrHash(tag))
    } catch {
      /* ignore */
    }
  }
  return { month }
}

export async function clearAiGenStats(): Promise<void> {
  try {
    const hist = await import('./aiGenHistory.js')
    await hist.autoSaveAiGenHistory()
  } catch {
    /* ignore */
  }
  memory.clear()
  errMemory.clear()
  if (!redisConfigured()) return
  const { day, month } = parisPeriodKeys()
  try {
    await redisCommand('DEL', REDIS_HASH)
    await redisCommand('DEL', REDIS_ERR)
    await redisCommand('DEL', redisStatHash(`day:${day}`))
    await redisCommand('DEL', redisErrHash(`day:${day}`))
    await redisCommand('DEL', redisStatHash(`month:${month}`))
    await redisCommand('DEL', redisErrHash(`month:${month}`))
  } catch {
    /* ignore */
  }
}

export { emptySnapshot }
