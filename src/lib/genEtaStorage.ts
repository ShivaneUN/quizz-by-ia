/** Historique local des durées de génération — pour ETA côté client */

const KEY = 'quizz:genEta:samples'
const MAX = 12
const DEFAULT = { solo: 18, multi: 25 } as const

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!
}

function readSamples(): number[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n >= 800 && n <= 90_000)
      .slice(0, MAX)
  } catch {
    return []
  }
}

/** Enregistre une durée mesurée (ms) après une génération réussie. */
export function recordLocalGenMs(ms: number): void {
  if (!Number.isFinite(ms)) return
  const n = Math.round(ms)
  if (n < 800 || n > 90_000) return
  const next = [n, ...readSamples()].slice(0, MAX)
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function getLocalEstimateSec(kind: 'solo' | 'multi'): number {
  const med = median(readSamples())
  const base =
    med != null
      ? Math.max(5, Math.min(55, Math.ceil(med / 1000)))
      : DEFAULT[kind]
  return kind === 'multi' ? Math.min(55, base + 3) : base
}

/** Fusionne estimation serveur + locale (préfère serveur si samples > 0). */
export async function resolveEstimateSec(
  kind: 'solo' | 'multi',
): Promise<number> {
  const local = getLocalEstimateSec(kind)
  try {
    const res = await fetch(`/api/gen-status?kind=${kind}`)
    if (!res.ok) return local
    const data = (await res.json()) as {
      estimateSec?: number
      samples?: number
    }
    const sec = Number(data.estimateSec)
    if (!Number.isFinite(sec) || sec < 5) return local
    // Si le serveur a de l’historique, on le privilégie ; sinon locale
    if ((data.samples ?? 0) > 0) {
      return Math.max(5, Math.min(55, Math.round(sec)))
    }
    return local
  } catch {
    return local
  }
}
