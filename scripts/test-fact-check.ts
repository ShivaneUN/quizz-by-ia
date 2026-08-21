/**
 * Test manuel OpenRouter : bonne / mauvaise réponse (≥ 2 sources).
 * Usage: npx tsx scripts/test-fact-check.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { verifyFactWithOpenRouter } from '../server/factCheckAi.ts'

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

const QUESTION =
  "Quel est le nom du lieu de vie principal des héros dans la série 'Friends' ?"
const THEME = 'Friends'
const SOURCE = 'Wikipédia'
const EXPLAIN =
  'La célèbre sitcom met en scène un groupe de six amis vivant dans le quartier de Manhattan à New York.'
const GOOD = 'New York'
const BAD = 'Chicago'

function summarize(
  label: string,
  result: {
    title?: string
    extract?: string
    verdict?: string
    answerVerdict?: string
    sourceVerdict?: string
    provider?: string
    model?: string
    error?: string
    answerNote?: string
    sourceNote?: string
    sourcesConfirmed?: number
    confirmingSources?: Array<{ name: string; detail: string }>
  } | null,
) {
  console.log(`\n=== ${label} ===`)
  if (!result) {
    console.log('Résultat: null')
    return
  }
  if ('error' in result && result.error) {
    console.log('Erreur:', result.error)
    return
  }
  console.log('Titre           :', result.title)
  console.log('Verdict global  :', result.verdict)
  console.log('Verdict réponse :', result.answerVerdict)
  console.log('Verdict source  :', result.sourceVerdict)
  console.log('Sources conf.   :', result.sourcesConfirmed ?? 0)
  if (result.confirmingSources?.length) {
    for (const s of result.confirmingSources) {
      console.log(`  - ${s.name}: ${s.detail}`)
    }
  }
  if (result.model) console.log('Modèle          :', result.model)
  console.log('Extrait         :', String(result.extract ?? '').slice(0, 220))
}

function expectPass(name: string, ok: boolean, detail: string) {
  console.log(ok ? `✅ PASS ${name}` : `❌ FAIL ${name} — ${detail}`)
  return ok
}

async function main() {
  loadEnv()
  let passed = 0
  let failed = 0

  console.log('\n########## OPENROUTER (≥ 2 sources) ##########')
  const orGood = await verifyFactWithOpenRouter({
    question: QUESTION,
    correctAnswer: GOOD,
    explanation: EXPLAIN,
    sourceType: SOURCE,
    theme: THEME,
    answers: [GOOD, BAD, 'Miami', 'Los Angeles'],
  })
  summarize('Bonne réponse (New York)', orGood)
  const ogOk =
    !('error' in orGood) &&
    orGood.answerVerdict === 'ok' &&
    (orGood.sourcesConfirmed ?? 0) >= 2 &&
    !/festival/i.test(orGood.title + orGood.extract)
  if (
    expectPass(
      'Bonne réponse → ok + ≥2 sources',
      ogOk,
      'error' in orGood
        ? orGood.error
        : `answer=${orGood.answerVerdict} sources=${orGood.sourcesConfirmed}`,
    )
  )
    passed++
  else failed++

  console.log('(pause 20s anti rate-limit…)')
  await new Promise((r) => setTimeout(r, 20_000))

  let orBad = await verifyFactWithOpenRouter({
    question: QUESTION,
    correctAnswer: BAD,
    explanation: 'Chicago est une grande ville américaine.',
    sourceType: SOURCE,
    theme: THEME,
    answers: [GOOD, BAD, 'Miami', 'Los Angeles'],
  })
  if ('error' in orBad && /429/.test(orBad.error)) {
    console.log('(retry après 25s…)')
    await new Promise((r) => setTimeout(r, 25_000))
    orBad = await verifyFactWithOpenRouter({
      question: QUESTION,
      correctAnswer: BAD,
      explanation: 'Chicago est une grande ville américaine.',
      sourceType: SOURCE,
      theme: THEME,
      answers: [GOOD, BAD, 'Miami', 'Los Angeles'],
    })
  }
  summarize('Mauvaise réponse (Chicago)', orBad)
  const obOk =
    !('error' in orBad) &&
    (orBad.answerVerdict === 'faux' ||
      orBad.answerVerdict === 'douteux' ||
      orBad.answerVerdict === 'inconnu' ||
      orBad.verdict === 'faux' ||
      orBad.verdict === 'douteux')
  if (
    expectPass(
      'Mauvaise réponse → pas ok',
      obOk,
      'error' in orBad
        ? orBad.error
        : `answerVerdict=${orBad.answerVerdict}`,
    )
  )
    passed++
  else failed++

  console.log(`\n—— Résultat: ${passed} pass / ${failed} fail ——`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
