/**
 * Numérote GEMINI_API_KEY … _16 à partir de GEMINI_API_KEYS / clés existantes.
 * N'affiche jamais les valeurs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const path = '.env'
const raw = readFileSync(path, 'utf8')
const lines = raw.split(/\r?\n/)

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

const map = new Map<string, string>()
for (const line of lines) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i <= 0) continue
  map.set(t.slice(0, i).trim(), unquote(t.slice(i + 1)))
}

const gemini: string[] = []
const seen = new Set<string>()
const push = (v: string | undefined) => {
  const k = String(v ?? '').trim()
  if (!k || seen.has(k)) return
  seen.add(k)
  gemini.push(k)
}

push(map.get('GEMINI_API_KEY'))
for (let i = 2; i <= 16; i++) push(map.get(`GEMINI_API_KEY_${i}`))
if (map.get('GEMINI_API_KEYS')) {
  for (const p of map.get('GEMINI_API_KEYS')!.split(/[,;\s]+/)) push(p)
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
for (let i = 2; i <= 16; i++) pushQ(map.get(`GROQ_API_KEY_${i}`))

const openrouter = map.get('OPENROUTER_API_KEY')?.trim() ?? ''

const out: string[] = []
out.push('# Clés IA — listApiKeys lit KEY + KEY_2…KEY_16 + KEYS (CSV)')
out.push('# Gemini (16)')
if (gemini[0]) out.push(`GEMINI_API_KEY=${gemini[0]}`)
for (let i = 1; i < gemini.length; i++) {
  out.push(`GEMINI_API_KEY_${i + 1}=${gemini[i]}`)
}
out.push('')
out.push('# Groq (8)')
if (groq[0]) out.push(`GROQ_API_KEY=${groq[0]}`)
for (let i = 1; i < Math.min(8, groq.length); i++) {
  out.push(`GROQ_API_KEY_${i + 1}=${groq[i]}`)
}
out.push('')
if (openrouter) out.push(`OPENROUTER_API_KEY=${openrouter}`)
out.push('')

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
    geminiNumbered: gemini.length,
    groqNumbered: Math.min(8, groq.length),
    wrote: path,
  }),
)
