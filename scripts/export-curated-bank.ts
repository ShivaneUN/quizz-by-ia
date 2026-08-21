/**
 * Exporte la banque Redis vers un JSON (+ CSV) local.
 * Usage: npx tsx scripts/export-curated-bank.ts [dossier-sortie]
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  listCuratedQuestions,
  summarizeCuratedBank,
} from '../server/curatedBank.ts'
import { redisConfigured } from '../server/rooms.ts'

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(resolve(process.cwd(), name), 'utf8')
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const i = t.indexOf('=')
        if (i <= 0) continue
        const key = t.slice(0, i).trim()
        let val = t.slice(i + 1).trim()
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        if (!(key in process.env)) process.env[key] = val
      }
    } catch {
      /* optional */
    }
  }
}

function csvEscape(s: string) {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function main() {
  loadEnv()
  const outDir =
    process.argv[2] ||
    'c:/Users/S_UN/Documents/log quizz/20.08.2026'
  mkdirSync(outDir, { recursive: true })
  const day = new Date().toISOString().slice(0, 10)
  const items = await listCuratedQuestions(5000)
  const summary = summarizeCuratedBank(items)
  const payload = {
    exportedAt: new Date().toISOString(),
    redis: redisConfigured(),
    key: 'data/curated (fichiers)',
    count: items.length,
    summary,
    questions: items,
  }
  const jsonPath = resolve(outDir, `quizz-curated-${day}.json`)
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8')

  const headers = [
    'theme',
    'placementKind',
    'subTheme',
    'customKey',
    'difficulty',
    'question',
    'correctAnswer',
    'answers',
    'sourceType',
    'verifiedOk',
    'liked',
  ]
  const lines = [headers.join(',')]
  for (const q of items) {
    lines.push(
      [
        q.theme,
        q.placementKind,
        q.subTheme ?? '',
        q.customKey ?? '',
        q.difficulty,
        q.question,
        q.correctAnswer,
        q.answers.join(' | '),
        q.sourceType ?? '',
        String(q.verifiedOk),
        String(q.liked),
      ]
        .map((c) => csvEscape(String(c)))
        .join(','),
    )
  }
  const csvPath = resolve(outDir, `quizz-curated-${day}.csv`)
  writeFileSync(csvPath, lines.join('\n'), 'utf8')

  console.log(`JSON: ${jsonPath}`)
  console.log(`CSV:  ${csvPath}`)
  console.log(`count: ${items.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
