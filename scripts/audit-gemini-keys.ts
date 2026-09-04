/**
 * Audit Gemini keys — masque les valeurs, signale anomalies.
 */
import { readFileSync } from 'node:fs'

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i <= 0) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      out[k] = v
    }
  } catch {
    /* optional */
  }
  return out
}

function mask(v: string): string {
  if (v.length <= 10) return `(trop court len=${v.length})`
  return `${v.slice(0, 6)}…${v.slice(-4)} (len=${v.length})`
}

function listGeminiKeys(env: Record<string, string>): { source: string; value: string }[] {
  const out: { source: string; value: string }[] = []
  const seen = new Set<string>()
  const push = (source: string, raw: string | undefined) => {
    const k = String(raw ?? '').trim()
    if (!k) return
    if (seen.has(k)) {
      out.push({ source: `${source} [DOUBLON]`, value: k })
      return
    }
    seen.add(k)
    out.push({ source, value: k })
  }

  push('GEMINI_API_KEY', env.GEMINI_API_KEY)
  for (let i = 2; i <= 8; i++) {
    push(`GEMINI_API_KEY_${i}`, env[`GEMINI_API_KEY_${i}`])
  }
  if (env.GEMINI_API_KEYS) {
    const parts = env.GEMINI_API_KEYS.split(/[,;\s]+/).filter(Boolean)
    parts.forEach((p, idx) => push(`GEMINI_API_KEYS[${idx}]`, p))
  }
  return out
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local') }
const keys = listGeminiKeys(env)

console.log(`Total entrées listées (avec doublons signalés): ${keys.length}`)

const unique = new Map<string, string[]>()
for (const { source, value } of keys) {
  const arr = unique.get(value) ?? []
  arr.push(source)
  unique.set(value, arr)
}

console.log(`Uniques: ${unique.size}`)
console.log('')

let i = 0
for (const [value, sources] of unique) {
  i++
  const issues: string[] = []
  if (!value.startsWith('AIza')) issues.push('préfixe ≠ AIza (attendu Google)')
  if (value.length < 35 || value.length > 45) issues.push(`longueur inhabituelle (${value.length}, souvent ~39)`)
  if (/\s/.test(value)) issues.push('contient un espace')
  if (/[<>"]/.test(value)) issues.push('caractères suspects')
  if (sources.length > 1) issues.push(`répétée dans: ${sources.join(', ')}`)

  const status = issues.length ? 'ANOMALIE' : 'ok'
  console.log(
    `#${i} ${status} ${mask(value)} | sources: ${sources.join(' + ')}${issues.length ? ' | ' + issues.join('; ') : ''}`,
  )
}

// Comparer numbered vs CSV
const numbered = [
  env.GEMINI_API_KEY,
  ...Array.from({ length: 7 }, (_, j) => env[`GEMINI_API_KEY_${j + 2}`]),
].filter(Boolean) as string[]
const csv = (env.GEMINI_API_KEYS ?? '').split(/[,;\s]+/).filter(Boolean)
console.log('')
console.log(`Numbered (KEY + _2.._8): ${numbered.length}`)
console.log(`CSV GEMINI_API_KEYS parts: ${csv.length}`)
const onlyNumbered = numbered.filter((k) => !csv.includes(k))
const onlyCsv = csv.filter((k) => !numbered.includes(k))
if (onlyNumbered.length) console.log(`Dans numbered mais pas CSV: ${onlyNumbered.length}`)
if (onlyCsv.length) console.log(`Dans CSV mais pas numbered (clés 9–16 attendues): ${onlyCsv.length}`)

// Ce que listApiKeys lit vraiment (même logique que aiRotate)
function listApiKeysLikeApp(): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | undefined) => {
    const k = String(raw ?? '').trim()
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(k)
  }
  push(env.GEMINI_API_KEY)
  for (let i = 2; i <= 8; i++) push(env[`GEMINI_API_KEY_${i}`])
  if (env.GEMINI_API_KEYS) {
    for (const p of env.GEMINI_API_KEYS.split(/[,;\s]+/)) push(p)
  }
  return out
}
const app = listApiKeysLikeApp()
console.log('')
console.log(`App listApiKeys('gemini') → ${app.length} clés uniques`)
