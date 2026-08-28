/**
 * Rotation IA : 1 génération → 1 provider (Groq / Gemini / OpenRouter).
 * Si plusieurs gens en même temps : RR + slots (clés) pour répartir la charge.
 * File invisible courte (~1,5s) puis slot le moins chargé.
 * Les 429/timeout basculent vers une autre IA (pas d’autre modèle du même provider).
 */

import { redisCommand, redisConfigured } from './rooms.js'

export type RotateEngine = 'groq' | 'gemini' | 'openrouter'

const AUTO_ORDER: RotateEngine[] = ['gemini', 'groq']
const RR_KEY = 'quizz:ai:rr'
const INFLIGHT_PREFIX = 'quizz:ai:inflight:'
/** Attente invisible max pour un slot libre */
const QUEUE_WAIT_MS = 1_500
const QUEUE_POLL_MS = 200

/** Concurrence max par clé (TPM free serré). Multi-clés = multi slots. */
const MAX_PER_KEY: Record<RotateEngine, number> = {
  groq: 1,
  gemini: 1,
  openrouter: 1,
}

const memoryInflight = new Map<string, number>()
let memoryRr = 0

function slotId(engine: RotateEngine, keyIndex: number): string {
  return `${engine}#${keyIndex}`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Lit GROQ_API_KEY, GROQ_API_KEY_2… et GROQ_API_KEYS=a,b */
export function listApiKeys(engine: RotateEngine): string[] {
  const prefix =
    engine === 'groq'
      ? 'GROQ_API_KEY'
      : engine === 'gemini'
        ? 'GEMINI_API_KEY'
        : 'OPENROUTER_API_KEY'
  const out: string[] = []
  const seen = new Set<string>()

  const push = (raw: string | undefined) => {
    const k = String(raw ?? '').trim()
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(k)
  }

  push(process.env[prefix])
  // Gemini : jusqu’à 16 clés numérotées ; Groq reste en pratique ≤ 8
  for (let i = 2; i <= 16; i++) push(process.env[`${prefix}_${i}`])

  const csv = process.env[`${prefix}S`]
  if (csv) {
    for (const part of csv.split(/[,;\s]+/)) push(part)
  }

  return out
}

export function enginesWithKeys(): RotateEngine[] {
  return AUTO_ORDER.filter((e) => listApiKeys(e).length > 0)
}

function capacity(engine: RotateEngine): number {
  return listApiKeys(engine).length * MAX_PER_KEY[engine]
}

async function getInflight(id: string): Promise<number> {
  if (redisConfigured()) {
    try {
      const n = await redisCommand<number | string | null>(
        'GET',
        INFLIGHT_PREFIX + id,
      )
      const v = Number(n)
      return Number.isFinite(v) && v > 0 ? v : 0
    } catch {
      /* memory */
    }
  }
  return memoryInflight.get(id) ?? 0
}

async function addInflight(id: string, delta: number): Promise<void> {
  const next = Math.max(0, (memoryInflight.get(id) ?? 0) + delta)
  memoryInflight.set(id, next)
  if (!redisConfigured()) return
  try {
    if (next <= 0) {
      await redisCommand('DEL', INFLIGHT_PREFIX + id)
    } else {
      await redisCommand('SET', INFLIGHT_PREFIX + id, String(next))
      await redisCommand('EXPIRE', INFLIGHT_PREFIX + id, 180)
    }
  } catch {
    /* ignore */
  }
}

async function nextRoundRobinIndex(mod: number): Promise<number> {
  if (mod <= 0) return 0
  if (redisConfigured()) {
    try {
      const n = await redisCommand<number>('INCR', RR_KEY)
      if (typeof n === 'number' && Number.isFinite(n)) {
        await redisCommand('EXPIRE', RR_KEY, 60 * 60 * 24)
        return ((n % mod) + mod) % mod
      }
    } catch {
      /* memory */
    }
  }
  memoryRr += 1
  return memoryRr % mod
}

export interface PickedAi {
  engine: RotateEngine
  apiKey: string
  keyIndex: number
  slot: string
}

type Cand = {
  engine: RotateEngine
  keyIndex: number
  apiKey: string
  slot: string
  inflight: number
  free: number
  capacity: number
}

async function buildCandidates(): Promise<Cand[]> {
  const engines = enginesWithKeys()
  const cands: Cand[] = []
  for (const engine of engines) {
    const keys = listApiKeys(engine)
    const maxPer = MAX_PER_KEY[engine]
    for (let i = 0; i < keys.length; i++) {
      const slot = slotId(engine, i)
      const inflight = await getInflight(slot)
      const free = Math.max(0, maxPer - inflight)
      cands.push({
        engine,
        keyIndex: i,
        apiKey: keys[i],
        slot,
        inflight,
        free,
        capacity: capacity(engine),
      })
    }
  }
  return cands
}

async function claim(c: Cand): Promise<PickedAi> {
  await addInflight(c.slot, 1)
  return {
    engine: c.engine,
    apiKey: c.apiKey,
    keyIndex: c.keyIndex,
    slot: c.slot,
  }
}

/** Ordre RR : preferred, puis les autres (Gemini ↔ Groq en alternance). */
function enginesFromRr(engines: RotateEngine[], rr: number): RotateEngine[] {
  if (engines.length === 0) return []
  const i = ((rr % engines.length) + engines.length) % engines.length
  return [...engines.slice(i), ...engines.slice(0, i)]
}

async function pickFreeInOrder(
  cands: Cand[],
  order: RotateEngine[],
): Promise<PickedAi | null> {
  for (const eng of order) {
    const free = cands
      .filter((c) => c.engine === eng && c.free > 0)
      .sort((a, b) => a.inflight - b.inflight || a.keyIndex - b.keyIndex)
    if (free[0]) return claim(free[0])
  }
  return null
}

/** Moins chargé, en gardant la préférence RR (pas de biais « plus de clés Gemini »). */
async function claimLeastLoaded(order: RotateEngine[]): Promise<PickedAi | null> {
  const cands = await buildCandidates()
  if (cands.length === 0) return null
  const least = [...cands].sort((a, b) => {
    const ai = order.indexOf(a.engine)
    const bi = order.indexOf(b.engine)
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    return a.inflight - b.inflight || a.keyIndex - b.keyIndex
  })[0]
  return claim(least)
}

/**
 * Choisit 1 IA. Attend invisiblement jusqu’à ~1,5s un slot libre ;
 * sinon prend le moins chargé (plusieurs joueurs en parallèle).
 * Auto = alternance stricte Gemini ↔ Groq (1 gén → 1 provider).
 */
export async function pickAiForGeneration(): Promise<PickedAi | null> {
  const engines = enginesWithKeys()
  if (engines.length === 0) return null

  const rr = await nextRoundRobinIndex(engines.length)
  const order = enginesFromRr(engines, rr)

  let cands = await buildCandidates()
  const first = await pickFreeInOrder(cands, order)
  if (first) return first

  const deadline = Date.now() + QUEUE_WAIT_MS
  while (Date.now() < deadline) {
    await sleep(QUEUE_POLL_MS)
    cands = await buildCandidates()
    const again = await pickFreeInOrder(cands, order)
    if (again) return again
  }

  return claimLeastLoaded(order)
}

export async function releaseAiSlot(slot: string | undefined): Promise<void> {
  if (!slot) return
  await addInflight(slot, -1)
}

/**
 * Réserve un slot du même provider (ex. rattrapage) — ne change pas d’IA.
 * Si saturé : file courte puis least-loaded de ce provider.
 */
export async function pickAiForEngine(
  engine: RotateEngine,
): Promise<PickedAi | null> {
  if (listApiKeys(engine).length === 0) return null
  const order: RotateEngine[] = [engine]

  let cands = await buildCandidates()
  const first = await pickFreeInOrder(cands, order)
  if (first) return first

  const deadline = Date.now() + QUEUE_WAIT_MS
  while (Date.now() < deadline) {
    await sleep(QUEUE_POLL_MS)
    cands = await buildCandidates()
    const again = await pickFreeInOrder(cands, order)
    if (again) return again
  }

  return claimLeastLoaded(order)
}

/** Ordre de fallback après l’IA choisie (les autres free). */
export function fallbackEngines(
  primary: RotateEngine,
  available: RotateEngine[],
): RotateEngine[] {
  return [primary, ...available.filter((e) => e !== primary)]
}

export type AiCapacityRow = {
  engine: RotateEngine
  keyCount: number
  maxPerKey: number
  capacity: number
  inflight: number
  freeSlots: number
}

/** Snapshot admin : capacité dispo par provider (sans exposer les clés). */
export async function getAiCapacitySnapshot(): Promise<AiCapacityRow[]> {
  const rows: AiCapacityRow[] = []
  for (const engine of AUTO_ORDER) {
    const keys = listApiKeys(engine)
    const keyCount = keys.length
    const maxPerKey = MAX_PER_KEY[engine]
    const cap = keyCount * maxPerKey
    let inflight = 0
    for (let i = 0; i < keyCount; i++) {
      const slot = slotId(engine, i)
      inflight += await getInflight(slot)
    }
    rows.push({
      engine,
      keyCount,
      maxPerKey,
      capacity: cap,
      inflight,
      freeSlots: Math.max(0, cap - inflight),
    })
  }
  return rows
}
