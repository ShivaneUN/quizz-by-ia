/** Diagnostic clés — n'affiche jamais les valeurs. */
import { readFileSync } from 'node:fs'

for (const name of ['.env', '.env.local']) {
  try {
    for (const line of readFileSync(name, 'utf8').split(/\r?\n/)) {
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
      if (!(k in process.env)) process.env[k] = v
    }
  } catch {
    /* optional */
  }
}

function list(prefix: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | undefined) => {
    const k = String(raw ?? '').trim()
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(k)
  }
  push(process.env[prefix])
  for (let i = 2; i <= 16; i++) push(process.env[`${prefix}_${i}`])
  const csv = process.env[`${prefix}S`]
  if (csv) for (const p of csv.split(/[,;\s]+/)) push(p)
  return out
}

const groqWrong = Object.keys(process.env).filter((k) =>
  /^GROQ_API_KEY\d+$/.test(k),
)
const geminiNames = Object.keys(process.env).filter((k) => /GEMINI/i.test(k))

console.log(
  JSON.stringify(
    {
      appReads: {
        GROQ: list('GROQ_API_KEY').length,
        GEMINI: list('GEMINI_API_KEY').length,
        OPENROUTER: list('OPENROUTER_API_KEY').length,
      },
      wrongGroqNamesWithoutUnderscore: groqWrong,
      geminiEnvNames: geminiNames,
    },
    null,
    2,
  ),
)
