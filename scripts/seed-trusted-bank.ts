/**
 * Injecte en banque curatée uniquement les questions « sûr » (whitelist manuelle).
 * N’active PAS l’ingest joueur. Usage:
 *   npx tsx scripts/seed-trusted-bank.ts [chemin-logs.json]
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  listCuratedQuestions,
  seedCuratedQuestion,
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

type Fb = {
  kind: string
  question: string
  answers: string[]
  correctIndex: number
  correctAnswer: string
  explanation?: string
  sourceType?: string
  theme?: string
  difficulty?: string
  mode?: string
  playMode?: string
  scope?: string
}

/** Match sur énoncé (sous-chaîne) + réponse exacte (insensible casse). */
const ALLOW: Array<{ answer: string; qIncludes: string }> = [
  { answer: 'Shrek', qIncludes: 'ogre vert' },
  { answer: 'Woody', qIncludes: 'Toy Story' },
  { answer: 'Stitch', qIncludes: 'Lilo' },
  { answer: 'WALL-E', qIncludes: 'robot solitaire' },
  { answer: 'Un crabe rouge', qIncludes: 'Hans Christian Andersen' },
  { answer: 'Maggie', qIncludes: 'Simpson' },
  { answer: 'Une guirlande lumineuse', qIncludes: 'Stranger Things' },
  { answer: 'Rouge', qIncludes: 'Casa de Papel' },
  { answer: 'Fabricant de drogues', qIncludes: 'Breaking Bad' },
  { answer: 'Cinq', qIncludes: 'asta' },
  { answer: 'Julius Novachrono', qIncludes: 'Roi-Mage' },
  { answer: 'Bonta', qIncludes: 'rivale de Br' },
  { answer: 'Iop', qIncludes: 'dieu protecteur' },
  { answer: 'Arène', qIncludes: 'PvP' },
  { answer: 'Les Dragons', qIncludes: 'ail' },
  { answer: 'Real Madrid', qIncludes: 'Ligue des champions' },
  { answer: 'Trophée Jules Rimet', qIncludes: 'Coupe du monde' },
  { answer: 'Boost infini', qIncludes: 'Free Play' },
  { answer: 'Antares', qIncludes: 'Monarque de la Destruction' },
  { answer: 'Plume', qIncludes: 'Super Mario World' },
  { answer: 'SIDA', qIncludes: 'immunodéficience' },
  { answer: 'Thalassémie', qIncludes: 'hémoglobine' },
  { answer: 'Voxelotor', qIncludes: 'drépanocytose' },
  { answer: 'Crono', qIncludes: 'Chrono Trigger' },
]

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, '')
}

function allowed(e: Fb): boolean {
  const a = norm(e.correctAnswer ?? '')
  const q = norm(e.question ?? '')
  return ALLOW.some(
    (w) => a === norm(w.answer) && q.includes(norm(w.qIncludes)),
  )
}

async function main() {
  loadEnv()
  const logPath =
    process.argv[2] ||
    'c:/Users/S_UN/Documents/log quizz/20.08.2026/quizz-logs-2026-08-20.json'
  const data = JSON.parse(readFileSync(logPath, 'utf8')) as {
    feedback?: { events?: Fb[] }
  }
  const events = data.feedback?.events ?? []
  const map = new Map<string, Fb>()
  for (const e of events.filter((x) => x.kind === 'verify')) {
    if (!allowed(e)) continue
    const k = `${e.question}||${e.correctAnswer}`
    if (!map.has(k)) map.set(k, e)
  }
  const picks = [...map.values()]
  console.log(`Whitelist match: ${picks.length} / ${ALLOW.length} attendus`)
  console.log(`Redis: ${redisConfigured() ? 'oui' : 'non (mémoire locale seulement)'}`)

  let added = 0
  let dup = 0
  let fail = 0
  for (const e of picks) {
    const confSources = undefined
    const r = await seedCuratedQuestion({
      theme: e.theme,
      rawTheme: e.theme,
      difficulty: e.difficulty as 'easy' | 'medium' | 'hard',
      question: e.question,
      answers: e.answers as [string, string, string, string],
      correctIndex: e.correctIndex as 0 | 1 | 2 | 3,
      correctAnswer: e.correctAnswer,
      explanation: e.explanation,
      sourceType: e.sourceType,
      liked: true,
      verifiedOk: true,
      sourcesConfirmed: 2,
      confirmingSources: confSources,
      verdict: 'ok',
      mode: e.mode === 'multi' ? 'multi' : 'solo',
      playMode:
        e.playMode === 'progression'
          ? 'progression'
          : e.playMode === 'manual'
            ? 'manual'
            : undefined,
      scope:
        e.scope === 'international'
          ? 'international'
          : e.scope === 'fr'
            ? 'fr'
            : undefined,
    })
    if (r.skipped === 'duplicate') {
      dup++
      console.log(`= dup ${e.correctAnswer}`)
    } else if (!r.ok) {
      fail++
      console.log(`✗ ${e.correctAnswer} (${r.skipped})`)
    } else {
      added++
      console.log(
        `+ ${e.correctAnswer} → ${r.placement?.kind}/${r.placement?.themeLabel}${r.placement?.subTheme ? ` — ${r.placement.subTheme}` : ''}`,
      )
    }
  }

  const all = await listCuratedQuestions(500)
  const sum = summarizeCuratedBank(all)
  console.log('\n=== BILAN ===')
  console.log({ added, dup, fail, bankTotal: sum.total, catalog: sum.catalogCount, custom: sum.customCount })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
