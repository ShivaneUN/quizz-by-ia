import { getOrCreatePlayerId } from './bankStorage'
import {
  ORBIT_THEMES,
  SUBTHEMES,
  formatThemeQuery,
} from './themes'

const STORAGE_KEY = 'quizz:random-theme:bag'
const LAST_KEY = 'quizz:random-theme:last'

export type RandomThemePick = {
  themeId: string
  label: string
  sub: string
  /** Libellé joué (ex. « Histoire — Antiquité ») */
  query: string
}

const EXCLUDED_ORBIT = new Set(['aleatoire', 'custom', 'pregen', 'drapeaux'])

/** Tous les couples thème / sous-thème jouables (hors Custom / bientôt). */
export function listRandomThemePairs(): RandomThemePick[] {
  const out: RandomThemePick[] = []
  for (const tile of ORBIT_THEMES) {
    if (EXCLUDED_ORBIT.has(tile.id) || tile.soon) continue
    const subs = (SUBTHEMES[tile.id] ?? ['Général']).filter(
      (s) => s && s !== 'Custom',
    )
    for (const sub of subs) {
      out.push({
        themeId: tile.id,
        label: tile.label,
        sub,
        query: formatThemeQuery(tile.label, sub),
      })
    }
  }
  return out
}

function pairKey(p: RandomThemePick): string {
  return `${p.themeId}::${p.sub}`
}

function loadBag(): string[] {
  try {
    const id = getOrCreatePlayerId()
    const raw = localStorage.getItem(`${STORAGE_KEY}:${id}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return []
  }
}

function saveBag(keys: string[]) {
  try {
    const id = getOrCreatePlayerId()
    localStorage.setItem(`${STORAGE_KEY}:${id}`, JSON.stringify(keys))
  } catch {
    /* private mode */
  }
}

function loadLast(): string | null {
  try {
    const id = getOrCreatePlayerId()
    return localStorage.getItem(`${LAST_KEY}:${id}`)
  } catch {
    return null
  }
}

function saveLast(key: string) {
  try {
    const id = getOrCreatePlayerId()
    localStorage.setItem(`${LAST_KEY}:${id}`, key)
  } catch {
    /* private mode */
  }
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

/**
 * Tire un thème + sous-thème au hasard.
 * Sac sans remise : on ne rejoue pas le même couple tant que le sac n’est pas vide.
 * Au refill, on évite de retomber immédiatement sur le dernier tiré.
 */
export function drawRandomThemePair(): RandomThemePick {
  const all = listRandomThemePairs()
  const byKey = new Map(all.map((p) => [pairKey(p), p]))
  let bag = loadBag().filter((k) => byKey.has(k))

  if (bag.length === 0) {
    const last = loadLast()
    const refill = all.map(pairKey)
    shuffleInPlace(refill)
    if (last && refill.length > 1 && refill[0] === last) {
      const swap = 1 + Math.floor(Math.random() * (refill.length - 1))
      ;[refill[0], refill[swap]] = [refill[swap]!, refill[0]!]
    }
    bag = refill
  }

  const key = bag.shift()!
  saveBag(bag)
  saveLast(key)
  return byKey.get(key) ?? all[0]!
}
