/**
 * Mode Aléatoire : un lot = plusieurs thèmes / sous-thèmes distincts.
 */
import { CATALOG } from './themePlacement.js'
import { FR_SCOPE_THEME_IDS } from './quizScope.js'

/** Thèmes exclus du mix (formats spéciaux / hors catalogue jouable). */
const MIX_EXCLUDED = new Set(['langues'])

export type MixAssignment = { theme: string; sousTheme: string }

export function isAleatoireTheme(theme?: string | null): boolean {
  if (!theme?.trim()) return false
  const n = theme
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  const head = n.split(/\s*[—\-–|]\s*/)[0]?.trim() ?? n
  return head === 'aleatoire' || head === 'random'
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

function catalogForScope(scope: 'fr' | 'international') {
  let themes = CATALOG.filter((t) => !MIX_EXCLUDED.has(t.id))
  if (scope === 'fr') {
    const fr = new Set<string>(FR_SCOPE_THEME_IDS)
    themes = themes.filter((t) => fr.has(t.id))
  }
  return themes
}

function allPairs(scope: 'fr' | 'international'): MixAssignment[] {
  const out: MixAssignment[] = []
  for (const t of catalogForScope(scope)) {
    const subs = (t.subs ?? ['Général']).filter((s) => s && s !== 'Custom')
    for (const sousTheme of subs.length ? subs : ['Général']) {
      out.push({ theme: t.label, sousTheme })
    }
  }
  return out
}

/**
 * Tire `count` couples thème/sous-thème, en maximisant la diversité des thèmes parents.
 */
export function drawMixedThemeAssignments(
  count: number,
  scope: 'fr' | 'international' = 'international',
): MixAssignment[] {
  const n = Math.max(1, Math.min(10, Math.round(count) || 10))
  const themes = catalogForScope(scope)
  if (themes.length === 0) {
    return Array.from({ length: n }, () => ({
      theme: 'Culture générale',
      sousTheme: 'Général',
    }))
  }

  const used = new Set<string>()
  const out: MixAssignment[] = []

  const pickSub = (subs: string[]) => {
    const clean = subs.filter((s) => s && s !== 'Custom')
    const pool = clean.length ? clean : ['Général']
    return pool[Math.floor(Math.random() * pool.length)]!
  }

  // 1) Un sous-thème par thème parent (ordre mélangé)
  const parents = [...themes]
  shuffleInPlace(parents)
  for (const t of parents) {
    if (out.length >= n) break
    const sousTheme = pickSub(t.subs)
    const key = `${t.label}::${sousTheme}`
    if (used.has(key)) continue
    used.add(key)
    out.push({ theme: t.label, sousTheme })
  }

  // 2) Compléter avec d’autres couples sans doublon
  if (out.length < n) {
    const pairs = allPairs(scope)
    shuffleInPlace(pairs)
    for (const p of pairs) {
      if (out.length >= n) break
      const key = `${p.theme}::${p.sousTheme}`
      if (used.has(key)) continue
      used.add(key)
      out.push(p)
    }
  }

  // 3) Filet : réutilise en variant si pool trop petit
  while (out.length < n) {
    const t = themes[out.length % themes.length]!
    out.push({
      theme: t.label,
      sousTheme: pickSub(t.subs),
    })
  }

  shuffleInPlace(out)
  return out.slice(0, n)
}
