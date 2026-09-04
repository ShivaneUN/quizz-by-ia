/**
 * Smoke generateFlagQuiz (pools, N, K choix, unicité).
 *   npx tsx scripts/smoke-flag-quiz.ts
 */
import { buildFlagQuiz, loadFlagCountries } from '../server/flagQuiz.ts'
import {
  FLAG_CHOICE_COUNT,
  FLAG_DIFFICULTIES,
  flagPool,
  type FlagDifficulty,
} from '../src/lib/flagQuiz.ts'

const countries = loadFlagCountries()
console.log(`pays chargés: ${countries.length}`)

const cases: { d: FlagDifficulty; count: number }[] = [
  { d: 'easy', count: 20 },
  { d: 'medium', count: 60 },
  { d: 'hard', count: 100 },
  { d: 'expert', count: 196 },
]

let fail = 0
for (const { d, count } of cases) {
  const qs = buildFlagQuiz({
    difficulty: d,
    count,
    themeSlug: 'drapeaux--international--flags',
  })
  const k = FLAG_CHOICE_COUNT[d]
  const names = qs.map((q) => q.revealAnswer)
  const unique = new Set(names).size
  const kOk = qs.every((q) => q.answers.length === k)
  const idxOk = qs.every(
    (q) => q.answers[q.correctIndex] === q.revealAnswer,
  )
  const decoyOk = qs.every((q) => new Set(q.answers).size === k)
  const imgOk = qs.every((q) => (q.imageUrl ?? '').startsWith('/drapeaux/'))
  const ok =
    qs.length === count && unique === count && kOk && idxOk && decoyOk && imgOk
  console.log(
    `${ok ? 'OK' : 'FAIL'}  ${d} n=${count} k=${k} pool=${flagPool(countries, d).length} got=${qs.length}`,
  )
  if (!ok) fail++
}

for (const d of FLAG_DIFFICULTIES) {
  const pool = flagPool(countries, d)
  console.log(`  pool ${d}: ${pool.length}`)
}

if (fail) {
  console.error(`\n${fail} échec(s)`)
  process.exit(1)
}
console.log('\nTous les cas OK')
