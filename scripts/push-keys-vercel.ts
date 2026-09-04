/**
 * Pousse les clés corrigées vers Vercel Production (sans log des valeurs).
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {}
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
  return out
}

function setEnv(name: string, value: string): boolean {
  if (!value) return false
  spawnSync('npx', ['vercel', 'env', 'rm', name, 'production', '-y'], {
    encoding: 'utf8',
    shell: true,
  })
  const r = spawnSync(
    'npx',
    ['vercel', 'env', 'add', name, 'production'],
    {
      input: value,
      encoding: 'utf8',
      shell: true,
    },
  )
  const ok = r.status === 0
  console.log(`${name}: ${ok ? 'OK' : 'FAIL'} (len=${value.length})`)
  if (!ok && r.stderr) console.log(String(r.stderr).slice(0, 200))
  return ok
}

const env = loadEnvFile('.env')
const names = [
  'GEMINI_API_KEY',
  ...Array.from({ length: 15 }, (_, i) => `GEMINI_API_KEY_${i + 2}`),
  'GROQ_API_KEY',
  ...Array.from({ length: 7 }, (_, i) => `GROQ_API_KEY_${i + 2}`),
  'OPENROUTER_API_KEY',
]

let ok = 0
let fail = 0
for (const n of names) {
  if (!env[n]) {
    console.log(`${n}: SKIP (absent)`)
    continue
  }
  if (setEnv(n, env[n]!)) ok++
  else fail++
}
console.log(JSON.stringify({ ok, fail }))
