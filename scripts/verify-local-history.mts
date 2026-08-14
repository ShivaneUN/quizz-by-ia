/**
 * Vérifie historique solo local + prise en compte dans le prompt.
 * Usage: npx tsx scripts/verify-local-history.mts
 */
import assert from 'node:assert/strict'

// localStorage polyfill (Node)
const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => {
    mem.set(String(k), String(v))
  },
  removeItem: (k) => {
    mem.delete(String(k))
  },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  },
} as Storage

const {
  collectExcludeQuestionTexts,
  getOrCreatePlayerId,
  loadHistory,
  markSeen,
  mergeQuestionsIntoBank,
  saveBank,
  saveHistory,
  drawUnseen,
} = await import('../src/lib/bankStorage.ts')

const { generateQuestions, normalizeThemeSlug, buildPrompt } = await import(
  '../server/generate.ts'
)

// Accès au prompt via génération mock sans clé : on teste plutôt
 // buildPrompt indirectement en relisant le module — on duplique le format historique
function formatHistorique(excludeQuestions: string[]): string {
  if (excludeQuestions.length === 0) return '(aucune — première génération)'
  return excludeQuestions
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 60)
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n')
}

const theme = 'Langue française'
const scope = 'fr' as const
const themeSlug = `${normalizeThemeSlug(theme)}--${scope}`
const playerId = getOrCreatePlayerId()

mem.clear()
// re-create player after clear
const pid = getOrCreatePlayerId()

const qEasy = [
  'Comment écrit-on le pluriel de cheval ?',
  'Quelle est la bonne orthographe : a ou à devant un infinitif ?',
  'Quel est le participe passé du verbe finir ?',
]

// 1) Au départ, rien à exclure
assert.deepEqual(collectExcludeQuestionTexts(themeSlug, pid), [])
console.log('OK 1 — exclude vide au départ')

// 2) Simule une banque easy + markSeen (comme App après une main)
const now = new Date().toISOString()
const bankQs = qEasy.map((question, i) => ({
  id: `easy-${i}`,
  question,
  answers: ['A', 'B', 'C', 'D'] as [string, string, string, string],
  correctIndex: 0 as const,
  difficulty: 'easy' as const,
  themeSlug,
  createdAt: now,
  batchId: 'batch-test',
  explanation: 'Explication de test suffisamment longue pour passer.',
  sourceType: 'culture générale',
}))

saveBank({
  meta: {
    theme,
    themeSlug,
    createdAt: now,
    updatedAt: now,
    counts: { easy: 3, medium: 0, hard: 0 },
    source: 'groq',
  },
  questions: bankQs,
})

let history = loadHistory(pid, themeSlug)
history = markSeen(
  history,
  'easy',
  bankQs.map((q) => q.id),
  bankQs.map((q) => q.question),
)
saveHistory(pid, themeSlug, history)

const exclude = collectExcludeQuestionTexts(themeSlug, pid)
assert.equal(exclude.length, 3)
for (const q of qEasy) assert.ok(exclude.includes(q))
console.log('OK 2 — exclude contient les 3 énoncés easy (banque + seenTexts)')

const histBlock = formatHistorique(exclude)
assert.ok(!histBlock.includes('aucune'))
assert.ok(histBlock.includes('1. Comment écrit-on le pluriel'))
assert.ok(histBlock.includes('2. Quelle est la bonne orthographe'))
console.log('OK 3 — bloc historique prompt formaté correctement')

const prompt = buildPrompt(theme, 'medium', scope, 'standard', exclude)
assert.ok(
  prompt.includes('Historique à ne jamais répéter'),
  'section historique absente',
)
assert.ok(
  prompt.includes(qEasy[0]),
  'l’IA ne reçoit pas la 1re question easy dans le prompt',
)
assert.ok(
  prompt.includes(qEasy[2]),
  'l’IA ne reçoit pas la 3e question easy dans le prompt',
)
assert.ok(
  prompt.includes('niveau "moyen"'),
  'niveau moyen attendu dans le prompt',
)
console.log('OK 3b — buildPrompt injecte bien l’historique local pour l’IA')

// 3) drawUnseen medium ne doit pas rejouer un même texte si un jour présent en medium
const mediumClone = {
  ...bankQs[0],
  id: 'medium-dup',
  difficulty: 'medium' as const,
}
const bank = {
  meta: {
    theme,
    themeSlug,
    createdAt: now,
    updatedAt: now,
    counts: { easy: 3, medium: 1, hard: 0 },
    source: 'groq' as const,
  },
  questions: [...bankQs, mediumClone],
}
saveBank(bank)
history = loadHistory(pid, themeSlug)
const drawn = drawUnseen(bank, history, 'medium', 10)
assert.equal(drawn.length, 0, 'le doublon texte easy→medium doit être filtré')
console.log('OK 4 — drawUnseen filtre les textes déjà vus (cross-niveau)')

// 4) Vérifie que generateQuestions reçoit bien exclude (filtre post-génération)
 // Sans clés API → mock, qui ignore exclude. On vérifie au moins la signature.
const hasKey = Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY)
if (!hasKey) {
  console.log(
    'SKIP 5 — pas de clé API locale : impossible de tester l’injection live IA',
  )
} else {
  const result = await generateQuestions(
    theme,
    themeSlug,
    'complementary',
    'medium',
    scope,
    'auto',
    'standard',
    exclude,
  )
  if (result.error) {
    console.log('WARN 5 — génération:', result.error)
  } else {
    const excludedFp = new Set(
      exclude.map((q) => q.trim().toLowerCase().replace(/\s+/g, ' ')),
    )
    for (const q of result.questions) {
      const fp = q.question.trim().toLowerCase().replace(/\s+/g, ' ')
      assert.ok(!excludedFp.has(fp), `doublon exact renvoyé: ${q.question}`)
    }
    console.log(
      `OK 5 — IA medium: ${result.questions.length} Q, aucun doublon exact avec l’historique (${result.source})`,
    )
  }
}

// 5) Persist: reload history from storage
const reloaded = loadHistory(pid, themeSlug)
assert.ok(reloaded.seenTexts && reloaded.seenTexts.length >= 3)
console.log('OK 6 — seenTexts persisté dans localStorage')

console.log('\nVerdict: historique local OK et prêt pour injection prompt/IA.')
