import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i <= 0) continue
  let v = t.slice(i + 1).trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1)
  }
  env[t.slice(0, i).trim()] = v
}

const keys: string[] = []
const seen = new Set<string>()
const push = (raw: string | undefined) => {
  const k = String(raw ?? '').trim()
  if (!k || seen.has(k)) return
  seen.add(k)
  keys.push(k)
}
push(env.GEMINI_API_KEY)
for (let i = 2; i <= 8; i++) push(env[`GEMINI_API_KEY_${i}`])
for (const p of String(env.GEMINI_API_KEYS ?? '').split(/[,;\s]+/)) push(p)

async function probe(key: string, idx: number) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models?key=' +
    encodeURIComponent(key)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    const text = await res.text()
    let detail = ''
    try {
      const j = JSON.parse(text) as {
        error?: { message?: string; status?: string }
        models?: unknown[]
      }
      detail =
        j.error?.message ||
        j.error?.status ||
        (Array.isArray(j.models) ? `models=${j.models.length}` : '')
    } catch {
      detail = text.slice(0, 100)
    }
    const prefix = key.slice(0, 6)
    console.log(
      `#${idx + 1} prefix=${prefix} HTTP ${res.status} ${String(detail).slice(0, 140)}`,
    )
  } catch (e) {
    console.log(`#${idx + 1} ERR ${e instanceof Error ? e.message : e}`)
  }
}

console.log(`Probing ${keys.length} unique Gemini keys…`)
for (let i = 0; i < keys.length; i++) {
  await probe(keys[i]!, i)
}
