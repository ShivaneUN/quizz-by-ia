/**
 * Sync Redis → data/curated/ puis vide Redis (fichiers = banque unique).
 * Usage: npx tsx scripts/sync-redis-to-files.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeCuratedForSync } from '../server/curatedBank.ts'
import {
  appendQuestionToFile,
  curatedDataRoot,
  loadCuratedFromFiles,
  scaffoldCuratedFolders,
} from '../server/curatedFiles.ts'
import { redisCommand, redisConfigured } from '../server/rooms.ts'

const REDIS_KEY = 'quizz:curated:bank'

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

async function main() {
  loadEnv()
  scaffoldCuratedFolders()
  console.log('Dossier:', curatedDataRoot())

  if (!redisConfigured()) {
    console.log('Redis non configuré — rien à sync.')
    console.log('Fichiers:', loadCuratedFromFiles().length)
    return
  }

  const raw = await redisCommand<string[] | null>(
    'LRANGE',
    REDIS_KEY,
    0,
    -1,
  )
  const rows = Array.isArray(raw) ? raw : []
  console.log('Redis:', rows.length)

  let added = 0
  let dup = 0
  let bad = 0
  for (const row of rows) {
    try {
      const parsed = normalizeCuratedForSync(
        JSON.parse(row) as Record<string, unknown>,
      )
      if (!parsed) {
        bad++
        continue
      }
      const r = appendQuestionToFile(parsed)
      if (r.skipped === 'duplicate') dup++
      else if (r.ok) added++
      else bad++
    } catch {
      bad++
    }
  }

  await redisCommand('DEL', REDIS_KEY)
  const files = loadCuratedFromFiles()
  console.log({ added, dup, bad, filesNow: files.length, redisCleared: true })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
