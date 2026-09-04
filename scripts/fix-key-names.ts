/**
 * Corrige les noms de clés Gemini/Groq pour listApiKeys().
 * N'affiche jamais les valeurs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const path = '.env'
const raw = readFileSync(path, 'utf8')
const lines = raw.split(/\r?\n/)

const map = new Map<string, string>()
const other: string[] = []

function unquote(v: string): string {
  const t = v.trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1)
  }
  return t
}

for (const line of lines) {
  const t = line.trim()
  if (!t || t.startsWith('#')) {
    other.push(line)
    continue
  }
  const i = t.indexOf('=')
  if (i <= 0) {
    other.push(line)
    continue
  }
  const k = t.slice(0, i).trim()
  const v = unquote(t.slice(i + 1))
  map.set(k, v)
}

const gemini: string[] = []
const seenG = new Set<string>()
const pushG = (v: string | undefined) => {
  const k = String(v ?? '').trim()
  if (!k || seenG.has(k)) return
  seenG.add(k)
  gemini.push(k)
}

// Anciens noms (sun) / (yowshi) — ordre compte 1 puis compte 2
for (const account of ['sun', 'yowshi']) {
  for (let i = 1; i <= 8; i++) {
    pushG(map.get(`GEMINI_API_KEY(${account})${i}`))
  }
}
// Noms standards déjà présents
pushG(map.get('GEMINI_API_KEY'))
for (let i = 2; i <= 8; i++) pushG(map.get(`GEMINI_API_KEY_${i}`))
if (map.get('GEMINI_API_KEYS')) {
  for (const p of map.get('GEMINI_API_KEYS')!.split(/[,;\s]+/)) pushG(p)
}

const groq: string[] = []
const seenQ = new Set<string>()
const pushQ = (v: string | undefined) => {
  const k = String(v ?? '').trim()
  if (!k || seenQ.has(k)) return
  seenQ.add(k)
  groq.push(k)
}
pushQ(map.get('GROQ_API_KEY'))
for (let i = 2; i <= 8; i++) {
  pushQ(map.get(`GROQ_API_KEY_${i}`))
  pushQ(map.get(`GROQ_API_KEY${i}`)) // ancien nom sans underscore
}

const openrouter = map.get('OPENROUTER_API_KEY')?.trim() ?? ''

// Supprime les anciennes clés du map pour réécriture propre
for (const k of [...map.keys()]) {
  if (/^GEMINI_API_KEY/.test(k) || /^GROQ_API_KEY/.test(k)) map.delete(k)
}

const out: string[] = []
out.push('# Clés IA — noms lus par server/aiRotate.ts (listApiKeys)')
out.push('# Gemini: jusqu’à 16+ via GEMINI_API_KEYS (CSV)')
if (gemini.length > 0) {
  out.push(`GEMINI_API_KEY=${gemini[0]}`)
  for (let i = 1; i < Math.min(8, gemini.length); i++) {
    out.push(`GEMINI_API_KEY_${i + 1}=${gemini[i]}`)
  }
  if (gemini.length > 0) {
    out.push(`GEMINI_API_KEYS=${gemini.join(',')}`)
  }
}
out.push('')
out.push('# Groq: GROQ_API_KEY + GROQ_API_KEY_2 … _8')
if (groq.length > 0) {
  out.push(`GROQ_API_KEY=${groq[0]}`)
  for (let i = 1; i < Math.min(8, groq.length); i++) {
    out.push(`GROQ_API_KEY_${i + 1}=${groq[i]}`)
  }
}
out.push('')
if (openrouter) out.push(`OPENROUTER_API_KEY=${openrouter}`)
out.push('')

// Conserve le reste du fichier (autres vars) sans doublons IA
const skip = /^(GEMINI_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY)/
for (const line of lines) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i <= 0) continue
  const k = t.slice(0, i).trim()
  if (skip.test(k)) continue
  out.push(`${k}=${unquote(t.slice(i + 1))}`)
}

writeFileSync(path, out.join('\n') + '\n', 'utf8')
console.log(
  JSON.stringify({
    geminiCount: gemini.length,
    groqCount: groq.length,
    openrouter: Boolean(openrouter),
    wrote: path,
  }),
)
