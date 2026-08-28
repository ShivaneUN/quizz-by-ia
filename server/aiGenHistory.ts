/**
 * Journal auto des compteurs IA (jour / mois).
 * Survit aux resets des compteurs live.
 */

import { redisCommand, redisConfigured } from './rooms.js'
import {
  getAiGenStats,
  parisPeriodKeys,
  type AiGenSnapshot,
} from './aiGenStats.js'

const REDIS_DAYS = 'quizz:ai:gen:history:days'
const REDIS_MONTHS = 'quizz:ai:gen:history:months'
const MAX_DAYS = 120
const MAX_MONTHS = 36

export type AiGenHistoryEntry = {
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

const memDays = new Map<string, AiGenHistoryEntry>()
const memMonths = new Map<string, AiGenHistoryEntry>()

function fromSnapshot(
  kind: 'day' | 'month',
  key: string,
  snap: AiGenSnapshot,
): AiGenHistoryEntry {
  const byEngine: AiGenHistoryEntry['byEngine'] = {}
  for (const m of snap.models ?? []) {
    const cur = byEngine[m.engine] ?? { ok: 0, fail: 0, tokens: 0 }
    cur.ok += m.ok
    cur.fail += m.fail
    cur.tokens += m.tokensTotal
    byEngine[m.engine] = cur
  }
  return {
    key,
    kind,
    updatedAt: Date.now(),
    ok: snap.totals.calls,
    fail: snap.failTotal,
    tokensIn: snap.totals.tokensIn,
    tokensOut: snap.totals.tokensOut,
    tokensTotal: snap.totals.tokensTotal,
    principalCalls: snap.byMode.full.calls,
    principalTokens: snap.byMode.full.tokensTotal,
    topupCalls: snap.byMode.topup.calls,
    topupTokens: snap.byMode.topup.tokensTotal,
    byEngine,
  }
}

function normalizeEntry(raw: unknown): AiGenHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<AiGenHistoryEntry>
  const key = String(o.key ?? '').trim()
  const kind = o.kind === 'month' ? 'month' : o.kind === 'day' ? 'day' : null
  if (!key || !kind) return null
  return {
    key,
    kind,
    updatedAt: Number(o.updatedAt) || Date.now(),
    ok: Math.max(0, Math.floor(Number(o.ok) || 0)),
    fail: Math.max(0, Math.floor(Number(o.fail) || 0)),
    tokensIn: Math.max(0, Math.floor(Number(o.tokensIn) || 0)),
    tokensOut: Math.max(0, Math.floor(Number(o.tokensOut) || 0)),
    tokensTotal: Math.max(0, Math.floor(Number(o.tokensTotal) || 0)),
    principalCalls: Math.max(0, Math.floor(Number(o.principalCalls) || 0)),
    principalTokens: Math.max(0, Math.floor(Number(o.principalTokens) || 0)),
    topupCalls: Math.max(0, Math.floor(Number(o.topupCalls) || 0)),
    topupTokens: Math.max(0, Math.floor(Number(o.topupTokens) || 0)),
    byEngine:
      o.byEngine && typeof o.byEngine === 'object'
        ? (o.byEngine as AiGenHistoryEntry['byEngine'])
        : {},
  }
}

async function writeEntry(
  redisKey: string,
  mem: Map<string, AiGenHistoryEntry>,
  entry: AiGenHistoryEntry,
  maxKeep: number,
): Promise<void> {
  mem.set(entry.key, entry)
  if (!redisConfigured()) return
  try {
    await redisCommand('HSET', redisKey, entry.key, JSON.stringify(entry))
    const keys = await redisCommand<unknown>('HKEYS', redisKey)
    const list = Array.isArray(keys)
      ? keys.map(String)
      : keys && typeof keys === 'object'
        ? Object.keys(keys as object)
        : [...mem.keys()]
    list.sort()
    if (list.length > maxKeep) {
      const drop = list.slice(0, list.length - maxKeep)
      for (const k of drop) {
        await redisCommand('HDEL', redisKey, k)
        mem.delete(k)
      }
    }
  } catch {
    /* mémoire OK */
  }
}

/** Met à jour le journal jour + mois depuis les compteurs live. */
export async function autoSaveAiGenHistory(): Promise<void> {
  try {
    const stats = await getAiGenStats()
    const { day, month } = stats.keys
    await writeEntry(
      REDIS_DAYS,
      memDays,
      fromSnapshot('day', day, stats.day),
      MAX_DAYS,
    )
    await writeEntry(
      REDIS_MONTHS,
      memMonths,
      fromSnapshot('month', month, stats.month),
      MAX_MONTHS,
    )
  } catch {
    /* ignore */
  }
}

/** Fire-and-forget depuis les record*. */
export function scheduleAiGenHistorySave(): void {
  void autoSaveAiGenHistory()
}

async function readHash(
  redisKey: string,
  mem: Map<string, AiGenHistoryEntry>,
): Promise<AiGenHistoryEntry[]> {
  if (redisConfigured()) {
    try {
      const raw = await redisCommand<unknown>('HGETALL', redisKey)
      const hash: Record<string, string> = {}
      if (Array.isArray(raw)) {
        for (let i = 0; i + 1 < raw.length; i += 2) {
          hash[String(raw[i])] = String(raw[i + 1])
        }
      } else if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          hash[k] = String(v)
        }
      }
      const out: AiGenHistoryEntry[] = []
      for (const v of Object.values(hash)) {
        try {
          const parsed = normalizeEntry(JSON.parse(v))
          if (parsed) {
            out.push(parsed)
            mem.set(parsed.key, parsed)
          }
        } catch {
          /* skip */
        }
      }
      if (out.length > 0) {
        out.sort((a, b) => b.key.localeCompare(a.key))
        return out
      }
    } catch {
      /* fallback mem */
    }
  }
  return [...mem.values()].sort((a, b) => b.key.localeCompare(a.key))
}

export async function listAiGenHistory(): Promise<{
  days: AiGenHistoryEntry[]
  months: AiGenHistoryEntry[]
}> {
  const [days, months] = await Promise.all([
    readHash(REDIS_DAYS, memDays),
    readHash(REDIS_MONTHS, memMonths),
  ])
  // Garantit une entrée pour aujourd’hui / ce mois même avant 1ère gen
  const { day, month } = parisPeriodKeys()
  if (!days.some((d) => d.key === day) || !months.some((m) => m.key === month)) {
    await autoSaveAiGenHistory()
    return {
      days: await readHash(REDIS_DAYS, memDays),
      months: await readHash(REDIS_MONTHS, memMonths),
    }
  }
  return { days, months }
}

export async function clearAiGenHistory(): Promise<void> {
  memDays.clear()
  memMonths.clear()
  if (!redisConfigured()) return
  try {
    await redisCommand('DEL', REDIS_DAYS)
    await redisCommand('DEL', REDIS_MONTHS)
  } catch {
    /* ignore */
  }
}
