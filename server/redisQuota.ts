/**
 * Quota stockage Redis (Upstash / Vercel KV).
 * L’utilisé vient de INFO memory ; le max du plan n’est en général pas
 * dans Redis (maxmemory=0) → 256 Mo free, surchargeable via REDIS_MAX_MB.
 */

import { redisCommand, redisConfigured } from './rooms.js'

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024

export type RedisQuotaFamily = {
  id: string
  label: string
  count: number
}

export type RedisQuota = {
  backend: 'redis' | 'memory'
  usedBytes: number | null
  maxBytes: number | null
  keyCount: number | null
  families?: RedisQuotaFamily[]
}

const KEY_FAMILIES: { prefix: string; id: string; label: string }[] = [
  { prefix: 'quizz:qhist:', id: 'qhist', label: 'historique thèmes' },
  { prefix: 'quizz:tts:', id: 'tts', label: 'ancien cache voix' },
  { prefix: 'quizz:room:', id: 'rooms', label: 'salles' },
  { prefix: 'quizz:genlock:', id: 'genlock', label: 'verrous salles' },
  { prefix: 'quizz:chat:', id: 'chat', label: 'chat' },
  { prefix: 'quizz:ai:', id: 'ai', label: 'stats IA' },
  { prefix: 'quizz:calib:', id: 'calib', label: 'logs manches' },
  { prefix: 'quizz:error:', id: 'errors', label: 'logs erreurs' },
  { prefix: 'quizz:curated:', id: 'curated', label: 'banque retirée' },
  { prefix: 'quizz:partial:', id: 'partial', label: 'lots incomplets' },
  { prefix: 'quizz:genprog:', id: 'genprog', label: 'génération' },
  { prefix: 'quizz:genstats:', id: 'genstats', label: 'ETA génération' },
  { prefix: 'quizz:presence:', id: 'presence', label: 'présence' },
  { prefix: 'quizz:morpion:', id: 'morpion', label: 'salles morpion' },
]

function classifyKey(key: string): { id: string; label: string } {
  for (const fam of KEY_FAMILIES) {
    if (key.startsWith(fam.prefix)) return { id: fam.id, label: fam.label }
  }
  if (key.startsWith('quizz:')) return { id: 'quizz', label: 'autres Quizz' }
  return { id: 'other', label: 'hors app' }
}

async function countKeyFamilies(): Promise<RedisQuotaFamily[]> {
  const raw = await redisCommand<unknown>('KEYS', '*')
  const keys = Array.isArray(raw)
    ? raw.filter((k): k is string => typeof k === 'string')
    : []
  const tally = new Map<string, RedisQuotaFamily>()
  for (const key of keys) {
    const { id, label } = classifyKey(key)
    const cur = tally.get(id)
    if (cur) cur.count += 1
    else tally.set(id, { id, label, count: 1 })
  }
  return [...tally.values()].sort((a, b) => b.count - a.count)
}

function maxBytesFromEnv(): number {
  const raw = Number(process.env.REDIS_MAX_MB)
  if (Number.isFinite(raw) && raw > 0) {
    return Math.round(raw * 1024 * 1024)
  }
  return DEFAULT_MAX_BYTES
}

function asInfoText(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw)) {
    const joined = raw
      .filter((x): x is string => typeof x === 'string')
      .join('\n')
    return joined.trim() ? joined : null
  }
  return null
}

function parseUsedMemory(raw: string): { used: number; max: number } | null {
  const used = /used_memory:(\d+)/i.exec(raw)
  if (!used) return null
  const max = /maxmemory:(\d+)/i.exec(raw)
  return {
    used: Number(used[1]),
    max: max ? Number(max[1]) : 0,
  }
}

async function readInfoMemory(): Promise<string | null> {
  const section = asInfoText(await redisCommand('INFO', 'memory'))
  if (section) return section
  return asInfoText(await redisCommand('INFO'))
}

export async function getRedisQuota(): Promise<RedisQuota> {
  if (!redisConfigured()) {
    return {
      backend: 'memory',
      usedBytes: null,
      maxBytes: null,
      keyCount: null,
    }
  }

  const planMax = maxBytesFromEnv()
  try {
    const [info, dbsize, families] = await Promise.all([
      readInfoMemory(),
      redisCommand<number | string | null>('DBSIZE').catch(() => null),
      countKeyFamilies().catch(() => [] as RedisQuotaFamily[]),
    ])
    const parsed = info ? parseUsedMemory(info) : null
    const keyN =
      typeof dbsize === 'number'
        ? dbsize
        : typeof dbsize === 'string' && /^\d+$/.test(dbsize)
          ? Number(dbsize)
          : null
    return {
      backend: 'redis',
      usedBytes: parsed && Number.isFinite(parsed.used) ? parsed.used : null,
      maxBytes: parsed && parsed.max > 0 ? parsed.max : planMax,
      keyCount: keyN != null && Number.isFinite(keyN) ? keyN : null,
      families,
    }
  } catch {
    return {
      backend: 'redis',
      usedBytes: null,
      maxBytes: planMax,
      keyCount: null,
    }
  }
}
