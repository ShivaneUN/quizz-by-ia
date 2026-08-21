/**
 * Revérifie les questions "verify" des anciens logs avec OpenRouter (≥2 sources).
 * Usage: npx tsx scripts/reverify-old-logs.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

type Fb = {
  kind: string
  questionId?: string
  question: string
  answers: string[]
  correctIndex: number
  correctAnswer: string
  explanation?: string
  sourceType?: string
  theme?: string
  difficulty?: string
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
  const downKeys = new Set(
    events
      .filter((e) => e.kind === 'down')
      .map((e) => e.questionId || e.question),
  )

  const map = new Map<string, Fb>()
  for (const e of events.filter((x) => x.kind === 'verify')) {
    const k = e.questionId || e.question
    if (!map.has(k)) map.set(k, e)
  }
  const list = [...map.values()].sort((a, b) =>
    String(a.theme).localeCompare(String(b.theme)),
  )

  const outPath = resolve(process.cwd(), 'scripts/reverify-results.json')
  let out: Array<Record<string, unknown>> = []
  const doneKeys = new Set<string>()
  try {
    const prev = JSON.parse(readFileSync(outPath, 'utf8')) as {
      results?: Array<Record<string, unknown>>
    }
    out = prev.results ?? []
    for (const r of out) {
      if (r.status === 'error') continue // retry errors
      doneKeys.add(String(r.question ?? ''))
    }
    console.log(`Reprise: ${doneKeys.size} déjà OK, ${out.filter((r) => r.status === 'error').length} erreurs à retenter`)
    out = out.filter((r) => r.status !== 'error')
  } catch {
    /* fresh */
  }

  const pending = list.filter((e) => !doneKeys.has(e.question))
  console.log(`À revérifier: ${pending.length} / ${list.length}`)
  let i = 0

  for (const e of pending) {
    i++
    const wasDown = downKeys.has(e.questionId || e.question)
    console.log(
      `\n[${i}/${pending.length}] ${e.theme} · ${e.difficulty}${wasDown ? ' · était 👎' : ''}`,
    )
    console.log(`Q: ${e.question.slice(0, 100)}`)
    console.log(`R: ${e.correctAnswer}`)

    let result = await verifyFactWithOpenRouter({
      question: e.question,
      correctAnswer: e.correctAnswer,
      explanation: e.explanation,
      sourceType: e.sourceType,
      theme: e.theme,
      answers: e.answers,
    })

    if ('error' in result && /429/.test(result.error)) {
      console.log('(429 — pause 40s + retry)')
      await sleep(40_000)
      result = await verifyFactWithOpenRouter({
        question: e.question,
        correctAnswer: e.correctAnswer,
        explanation: e.explanation,
        sourceType: e.sourceType,
        theme: e.theme,
        answers: e.answers,
      })
    }

    if ('error' in result) {
      console.log(`❌ erreur: ${result.error}`)
      out.push({
        theme: e.theme,
        difficulty: e.difficulty,
        question: e.question,
        correctAnswer: e.correctAnswer,
        sourceType: e.sourceType,
        wasDown,
        status: 'error',
        error: result.error,
      })
    } else {
      console.log(
        `→ réponse=${result.answerVerdict} source=${result.sourceVerdict} conf=${result.sourcesConfirmed} global=${result.verdict}`,
      )
      if (result.confirmingSources?.length) {
        console.log(
          `  sources: ${result.confirmingSources.map((s) => s.name).join(' · ')}`,
        )
      }
      out.push({
        theme: e.theme,
        difficulty: e.difficulty,
        question: e.question,
        correctAnswer: e.correctAnswer,
        sourceType: e.sourceType,
        wasDown,
        status: 'ok',
        verdict: result.verdict,
        answerVerdict: result.answerVerdict,
        sourceVerdict: result.sourceVerdict,
        sourcesConfirmed: result.sourcesConfirmed,
        confirmingSources: result.confirmingSources,
        title: result.title,
        extract: result.extract,
        answerNote: result.answerNote,
        sourceNote: result.sourceNote,
      })
    }

    writeFileSync(outPath, JSON.stringify({ at: Date.now(), results: out }, null, 2))

    if (i < pending.length) await sleep(28_000)
  }

  const tallies: Record<string, number> = {}
  for (const r of out) {
    const key =
      r.status === 'error'
        ? 'error'
        : String(r.answerVerdict ?? r.verdict ?? 'inconnu')
    tallies[key] = (tallies[key] ?? 0) + 1
  }
  console.log('\n======== BILAN ========')
  console.log(tallies)
  console.log(`Fichier: scripts/reverify-results.json (${out.length} lignes)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
