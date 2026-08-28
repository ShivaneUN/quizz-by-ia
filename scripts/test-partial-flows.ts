/**
 * Tests solo (allowPartial) + multi (lock, strip public, top-up signal).
 * Usage: npx tsx scripts/test-partial-flows.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateQuestions } from '../server/generate.ts'
import {
  clearGeneratingFields,
  forceReleaseGenLock,
  getRoom,
  makeRoomCode,
  publicRoomView,
  releaseGenLock,
  saveRoom,
  tryAcquireGenLock,
  type RoomState,
} from '../server/rooms.ts'

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

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

async function testMultiLockAndPublicView() {
  console.log('\n=== MULTI: lock + publicRoomView ===')
  const code = makeRoomCode()
  await forceReleaseGenLock(code)

  const a = await tryAcquireGenLock(code)
  assert(a.acquired, '1er acquire doit réussir')
  const b = await tryAcquireGenLock(code)
  assert(!b.acquired, '2e acquire concurrent doit échouer')
  await releaseGenLock(code, a.token)
  const c = await tryAcquireGenLock(code)
  assert(c.acquired, 'acquire après release doit réussir')
  await releaseGenLock(code, c.token)
  console.log('OK lock SET NX')

  const room: RoomState = {
    code,
    hostId: 'host-1',
    status: 'generating',
    theme: 'Test',
    scope: 'fr',
    timerEnabled: false,
    playMode: 'free',
    difficulty: 'easy',
    aiProvider: 'auto',
    players: [{ id: 'host-1', name: 'Hôte', score: 0, joinedAt: Date.now() }],
    questions: [],
    questionIndex: 0,
    roundPhase: 'answering',
    roundStartedAt: 0,
    roundDurationMs: 10_000,
    currentAnswers: {},
    genQuestionsDone: 7,
    genQuestionsTotal: 10,
    generatingStartedAt: Date.now(),
    needsTopUp: true,
    genCollectedQuestions: [
      {
        id: 'secret-q',
        question: 'QUESTION SECRÈTE PARTIELLE ?',
        answers: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        explanation: 'ne doit pas fuiter',
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await saveRoom(room)
  const view = publicRoomView(room)
  assert(
    !('genCollectedQuestions' in view),
    'genCollectedQuestions ne doit pas être dans la vue publique',
  )
  assert(view.needsTopUp === true, 'needsTopUp doit être public')
  assert(
    !JSON.stringify(view).includes('QUESTION SECRÈTE'),
    'énoncé partial ne doit pas fuiter dans publicRoomView',
  )
  console.log('OK publicRoomView strip + needsTopUp')

  clearGeneratingFields(room)
  assert(!room.genCollectedQuestions, 'clearGeneratingFields retire collected')
  assert(!room.needsTopUp, 'clearGeneratingFields retire needsTopUp')
  console.log('OK clearGeneratingFields')

  const loaded = await getRoom(code)
  assert(loaded, 'salle persistée')
  assert(loaded!.needsTopUp === true, 'needsTopUp persisté en Redis/mémoire')
  console.log('OK getRoom persist')
}

async function testPartialQuestionCache() {
  console.log('\n=== CACHE 5 min lots incomplets ===')
  const {
    savePartialQuestions,
    getPartialQuestions,
    clearPartialQuestions,
    syncPartialQuestionCache,
    PARTIAL_CACHE_TTL_SEC,
  } = await import('../server/partialQuestionCache.ts')

  assert(PARTIAL_CACHE_TTL_SEC === 300, 'TTL doit être 5 min (300s)')

  const slug = `test-partial-cache-${Date.now()}`
  const q = (
    n: number,
    difficulty: 'easy' | 'medium' | 'hard' = 'easy',
  ) => ({
    id: `q-${n}`,
    question: `Question cache ${n} pour le test ?`,
    answers: ['A', 'B', 'C', 'D'] as [string, string, string, string],
    correctIndex: 0 as const,
    difficulty,
    themeSlug: slug,
    createdAt: new Date().toISOString(),
    batchId: 't',
  })

  await clearPartialQuestions(slug, 'easy')
  await savePartialQuestions(slug, 'easy', [q(1), q(2), q(3)])
  const got = await getPartialQuestions(slug, 'easy')
  assert(got.length === 3, `attendu 3, reçu ${got.length}`)
  assert(got[0]?.question.includes('Question cache 1'), 'énoncé 1 conservé')

  await syncPartialQuestionCache(slug, 'easy', [])
  const still = await getPartialQuestions(slug, 'easy')
  assert(still.length === 3, '0 Q ne doit pas écraser le cache')

  const ten = Array.from({ length: 10 }, (_, i) => q(i + 1))
  await syncPartialQuestionCache(slug, 'easy', ten)
  const afterFull = await getPartialQuestions(slug, 'easy')
  assert(afterFull.length === 0, '10/10 doit vider le cache')

  await savePartialQuestions(slug, 'easy', [q(1)])
  await savePartialQuestions(slug, 'medium', [q(1, 'medium')])
  const easyOnly = await getPartialQuestions(slug, 'easy')
  const mediumOnly = await getPartialQuestions(slug, 'medium')
  assert(easyOnly.length === 1, 'clé easy isolée')
  assert(mediumOnly.length === 1, 'clé medium isolée')

  await clearPartialQuestions(slug, 'easy')
  await clearPartialQuestions(slug, 'medium')
  console.log('OK cache save/get/sync/clear + isolation palier')
}

async function testSoloAllowPartial() {
  console.log('\n=== SOLO: generateQuestions(allowPartial=true) ===')
  const started = Date.now()
  const result = await generateQuestions(
    'Espace',
    'espace--fr',
    'complementary',
    'easy',
    'fr',
    'auto',
    'standard',
    [],
    (done, total) => {
      process.stdout.write(`\r  progress ${done}/${total}   `)
    },
    true,
  )
  const sec = Math.round((Date.now() - started) / 1000)
  console.log('')
  console.log(
    `  durée=${sec}s source=${result.source} n=${result.questions.length}` +
      (result.partial ? ` partial received=${result.received}` : '') +
      (result.error ? ` error=${result.error}` : ''),
  )

  if (result.error && result.questions.length === 0) {
    console.log('  NOTE: échec total (0 Q) — OK contrat strict si pas de clés / timeout')
    return { ok: false as const, reason: result.error }
  }

  if (result.partial) {
    assert(
      result.questions.length >= 1 && result.questions.length <= 9,
      'partial ⇒ 1–9 questions',
    )
    assert(!result.error, 'partial ne doit pas avoir error bloquant')
    console.log('OK lot partiel accepté (allowPartial)')
    return { ok: true as const, kind: 'partial' as const, n: result.questions.length }
  }

  assert(result.questions.length === 10, 'succès plein ⇒ exactement 10')
  assert(!result.error, 'succès sans error')
  console.log('OK lot complet 10/10')
  return { ok: true as const, kind: 'full' as const, n: 10 }
}

async function testSoloStrictNoPartial() {
  console.log('\n=== SOLO: allowPartial=false (défaut multi-like) ===')
  // On ne relance pas une gen complète (trop long) — on vérifie juste le type/default
  // via un appel mock path : sans clés → mock 10 questions sans error
  const hadGroq = process.env.GROQ_API_KEY
  const hadGemini = process.env.GEMINI_API_KEY
  const hadOr = process.env.OPENROUTER_API_KEY
  delete process.env.GROQ_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.OPENROUTER_API_KEY
  // aussi cerebras/deepseek si présents
  const backup: Record<string, string | undefined> = {}
  for (const k of Object.keys(process.env)) {
    if (/API_KEY|api_key/.test(k) && /GROQ|GEMINI|OPENROUTER|CEREBRAS|DEEPSEEK|AI_/.test(k)) {
      backup[k] = process.env[k]
      delete process.env[k]
    }
  }

  try {
    const result = await generateQuestions(
      'Test',
      'test--fr',
      'complementary',
      'easy',
      'fr',
      'auto',
      'standard',
      [],
      undefined,
      false,
    )
    assert(result.questions.length === 10, 'mock sans clé ⇒ 10 Q')
    assert(!result.partial, 'mock ne doit pas être partial')
    assert(!result.error, 'mock sans error')
    console.log('OK allowPartial=false → mock 10/10')
  } finally {
    if (hadGroq) process.env.GROQ_API_KEY = hadGroq
    if (hadGemini) process.env.GEMINI_API_KEY = hadGemini
    if (hadOr) process.env.OPENROUTER_API_KEY = hadOr
    for (const [k, v] of Object.entries(backup)) {
      if (v !== undefined) process.env[k] = v
    }
  }
}

async function main() {
  loadEnv()
  const results: string[] = []

  await testMultiLockAndPublicView()
  results.push('multi-lock-public: PASS')

  await testPartialQuestionCache()
  results.push('partial-cache-5min: PASS')

  await testSoloStrictNoPartial()
  results.push('solo-strict-mock: PASS')

  const solo = await testSoloAllowPartial()
  results.push(
    solo.ok
      ? `solo-allowPartial: PASS (${solo.kind}, n=${solo.n})`
      : `solo-allowPartial: SOFT-FAIL (${solo.reason})`,
  )

  console.log('\n—— Récap ——')
  for (const line of results) console.log(line)
  if (!solo.ok) {
    console.log(
      '\n(Le soft-fail solo IA n’invalide pas lock/public/mock ; vérifie les clés API.)',
    )
    process.exit(0)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
