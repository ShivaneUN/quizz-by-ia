/**
 * Crée data/curated/ (tous thèmes/sous-thèmes) et y copie la banque Redis.
 * Usage: npx tsx scripts/init-curated-files.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  listCuratedQuestions,
  summarizeCuratedBank,
} from '../server/curatedBank.ts'
import {
  appendQuestionToFile,
  curatedDataRoot,
  loadCuratedFromFiles,
  scaffoldCuratedFolders,
} from '../server/curatedFiles.ts'
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

async function main() {
  loadEnv()
  const scaffold = scaffoldCuratedFolders()
  console.log(`Scaffold: +${scaffold.created} fichiers, ${scaffold.skipped} déjà là`)
  console.log(`Dossier: ${curatedDataRoot()}`)
  console.log(`Redis: ${redisConfigured() ? 'oui' : 'non'}`)

  // Liste Redis+mémoire sans compter encore les fichiers vides
  process.env.CURATED_SKIP_FILES = '1'
  const all = await listCuratedQuestions(5000)
  // list always reads files now — that's ok, empty at first

  let written = 0
  let dup = 0
  for (const q of all) {
    const r = appendQuestionToFile(q)
    if (r.skipped === 'duplicate') dup++
    else if (r.ok) {
      written++
      console.log(`→ ${r.path?.replace(curatedDataRoot(), 'data/curated')}`)
    }
  }

  const files = loadCuratedFromFiles()
  const sum = summarizeCuratedBank(
    files.map((f) => ({
      ...f,
      id: f.id || 'x',
      at: f.at || 0,
      theme: f.theme || '',
      placementKind: f.placementKind || 'custom',
      groupKey: f.groupKey || 'x',
      rawTheme: f.rawTheme || '',
      liked: f.liked !== false,
      verifiedOk: f.verifiedOk !== false,
    })),
  )
  console.log('\n=== BILAN ===')
  console.log({ written, dup, inFiles: files.length, summary: sum })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
