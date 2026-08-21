/**
 * Smoke test génération Dofus easy — après renforts prompt.
 * Usage: npx tsx scripts/smoke-dofus-gen.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateQuestions } from '../server/generate.ts'

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

const VAGUE_SRC =
  /culture g[eé]n[eé]rale|notori[eé]t[eé]|fait historique document[eé]|fait scientifique [eé]tabli|connaissance commune|source g[eé]n[eé]rale/i

function checkQuestion(q: {
  question: string
  answers: string[]
  correctIndex: number
  explanation?: string
  sourceType?: string
}) {
  const issues: string[] = []
  const correct = q.answers[q.correctIndex] ?? ''
  const hay = `${q.question} ${correct} ${q.explanation ?? ''}`.toLowerCase()

  if (VAGUE_SRC.test(q.sourceType ?? '')) issues.push('source-vague')
  if (/isle d['’]?ankama|ile d['’]?ankama/i.test(hay)) issues.push('invention-isle-ankama')
  if (/tautolog|iop/.test(q.question.toLowerCase()) && /^iop$/i.test(correct.trim())) {
    if (/dieu protecteur.*iop|classe des iops/i.test(q.question)) {
      issues.push('quasi-tautologie-iop')
    }
  }
  if (/quel groupe/i.test(q.question) && !/groupe|band|duo|crew/i.test(correct)) {
    /* soft */ 
  }
  if (/a invent[eé]|a popularis[eé]|le premier/i.test(q.question)) {
    issues.push('forme-premier-invente')
  }
  if (/le plus c[eé]l[eè]bre|le meilleur/i.test(q.question)) {
    issues.push('subjectif')
  }
  if (/capitale du monde des douze/i.test(q.question) && /bonta/i.test(correct)) {
    issues.push('capitale-bonta-doute')
  }
  return issues
}

async function main() {
  loadEnv()
  console.log('Génération Dofus / easy / fr …')
  const started = Date.now()
  const result = await generateQuestions(
    'Dofus',
    'dofus--fr',
    'complementary',
    'easy',
    'fr',
    'auto',
    'standard',
    [],
  )
  const ms = Date.now() - started
  console.log(`Durée: ${Math.round(ms / 1000)}s · source: ${result.source}`)

  if (result.error) {
    console.log('ERREUR:', result.error)
    process.exit(1)
  }
  if (result.partial) {
    console.log(
      `ERREUR: lot partiel (${result.received ?? result.questions?.length ?? 0}/${result.target ?? 10})`,
    )
    process.exit(1)
  }

  const qs = result.questions ?? []
  console.log(`Questions: ${qs.length}`)
  let flagCount = 0
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i]!
    const issues = checkQuestion(q)
    console.log(`\n${i + 1}. ${q.question}`)
    console.log(`   → ${q.answers[q.correctIndex]}`)
    console.log(`   src: ${q.sourceType ?? '?'}`)
    if (issues.length) {
      flagCount++
      console.log(`   ⚠ ${issues.join(', ')}`)
    } else {
      console.log('   ✓ pas de flag smoke')
    }
  }

  console.log(`\n—— Smoke: ${flagCount} question(s) flaguée(s) / ${qs.length} ——`)
  process.exit(flagCount > 3 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
