/**
 * Cache court (5 min) des lots IA incomplets (1–9 Q).
 * Permet un rattrapage qui ne régénère que les manquantes (solo + multi).
 * Un lot 10/10 n’est jamais stocké.
 */

import { redisCommand, redisConfigured } from './rooms.js'

export const PARTIAL_CACHE_TTL_SEC = 5 * 60
const TARGET = 10

export type PartialCachedQuestion = {
  id: string
  question: string
  answers: string[]
  correctIndex: number
  difficulty: 'easy' | 'medium' | 'hard'
  themeSlug: string
  createdAt: string
  batchId: string
  explanation?: string
  sourceType?: string
  imageSubject?: string
  imageKind?: 'logo' | 'sujet_entier' | 'detail_zoome'
  imageUrl?: string
  previewUrl?: string
  coverUrl?: string
  deezerTrackId?: string
  revealAnswer?: string
  answerMode?: 'qcm' | 'free'
  acceptedAnswers?: string[]
  freeInputHint?: 'title' | 'title_or_artist'
}

type CacheEntry = {
  questions: PartialCachedQuestion[]
  savedAt: number
}

const memory = new Map<string, CacheEntry>()

function cacheKey(themeSlug: string, difficulty: string): string {
  return `quizz:partial:${themeSlug}:${difficulty}`
}

function asDifficulty(raw: unknown): 'easy' | 'medium' | 'hard' | null {
  return raw === 'easy' || raw === 'medium' || raw === 'hard' ? raw : null
}

function normalizeQuestion(raw: unknown): PartialCachedQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const question = String(o.question ?? '').trim()
  const answers = o.answers
  if (!question || !Array.isArray(answers) || answers.length !== 4) return null
  const a0 = String(answers[0] ?? '').trim()
  const a1 = String(answers[1] ?? '').trim()
  const a2 = String(answers[2] ?? '').trim()
  const a3 = String(answers[3] ?? '').trim()
  if (!a0 || !a1 || !a2 || !a3) return null
  const idx = Number(o.correctIndex)
  if (idx !== 0 && idx !== 1 && idx !== 2 && idx !== 3) return null
  const difficulty = asDifficulty(o.difficulty)
  if (!difficulty) return null
  const themeSlug = String(o.themeSlug ?? '').trim()
  if (!themeSlug) return null
  const imageKind =
    o.imageKind === 'logo' ||
    o.imageKind === 'sujet_entier' ||
    o.imageKind === 'detail_zoome'
      ? o.imageKind
      : undefined
  const answerMode = o.answerMode === 'free' ? 'free' : o.answerMode === 'qcm' ? 'qcm' : undefined
  const freeInputHint =
    o.freeInputHint === 'title' || o.freeInputHint === 'title_or_artist'
      ? o.freeInputHint
      : undefined
  const acceptedAnswers = Array.isArray(o.acceptedAnswers)
    ? o.acceptedAnswers.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : undefined

  return {
    id: String(o.id ?? '').trim() || `partial-${Math.random().toString(36).slice(2, 10)}`,
    question,
    answers: [a0, a1, a2, a3],
    correctIndex: idx,
    difficulty,
    themeSlug,
    createdAt: String(o.createdAt ?? '') || new Date().toISOString(),
    batchId: String(o.batchId ?? '') || 'partial-cache',
    explanation: typeof o.explanation === 'string' ? o.explanation : undefined,
    sourceType: typeof o.sourceType === 'string' ? o.sourceType : undefined,
    imageSubject: typeof o.imageSubject === 'string' ? o.imageSubject : undefined,
    imageKind,
    imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : undefined,
    previewUrl: typeof o.previewUrl === 'string' ? o.previewUrl : undefined,
    coverUrl: typeof o.coverUrl === 'string' ? o.coverUrl : undefined,
    deezerTrackId: typeof o.deezerTrackId === 'string' ? o.deezerTrackId : undefined,
    revealAnswer: typeof o.revealAnswer === 'string' ? o.revealAnswer : undefined,
    answerMode,
    acceptedAnswers,
    freeInputHint,
  }
}

function parseEntry(raw: unknown): CacheEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { questions?: unknown; savedAt?: unknown }
  if (!Array.isArray(o.questions)) return null
  const questions: PartialCachedQuestion[] = []
  for (const item of o.questions) {
    const q = normalizeQuestion(item)
    if (q) questions.push(q)
    if (questions.length >= TARGET - 1) break
  }
  if (questions.length === 0) return null
  return {
    questions,
    savedAt: Number(o.savedAt) || Date.now(),
  }
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.savedAt < PARTIAL_CACHE_TTL_SEC * 1000
}

export async function getPartialQuestions(
  themeSlug: string,
  difficulty: 'easy' | 'medium' | 'hard',
): Promise<PartialCachedQuestion[]> {
  const slug = themeSlug.trim()
  if (!slug) return []
  const key = cacheKey(slug, difficulty)

  if (redisConfigured()) {
    try {
      const raw = await redisCommand<string | null>('GET', key)
      if (!raw) return []
      const entry = parseEntry(JSON.parse(raw) as unknown)
      if (!entry || !isFresh(entry)) {
        if (entry && !isFresh(entry)) {
          await redisCommand('DEL', key).catch(() => null)
          memory.delete(key)
        }
        return []
      }
      memory.set(key, entry)
      return entry.questions
    } catch {
      /* fallback mémoire */
    }
  }

  const mem = memory.get(key)
  if (!mem || !isFresh(mem)) {
    if (mem) memory.delete(key)
    return []
  }
  return mem.questions
}

export async function savePartialQuestions(
  themeSlug: string,
  difficulty: 'easy' | 'medium' | 'hard',
  questions: PartialCachedQuestion[],
): Promise<void> {
  const slug = themeSlug.trim()
  if (!slug) return
  const normalized: PartialCachedQuestion[] = []
  for (const item of questions) {
    const q = normalizeQuestion(item)
    if (q && q.difficulty === difficulty) normalized.push(q)
    if (normalized.length >= TARGET - 1) break
  }
  if (normalized.length === 0) return

  const key = cacheKey(slug, difficulty)
  const entry: CacheEntry = { questions: normalized, savedAt: Date.now() }
  memory.set(key, entry)

  if (!redisConfigured()) return
  try {
    await redisCommand(
      'SET',
      key,
      JSON.stringify(entry),
      'EX',
      PARTIAL_CACHE_TTL_SEC,
    )
  } catch {
    /* mémoire OK */
  }
}

export async function clearPartialQuestions(
  themeSlug: string,
  difficulty: 'easy' | 'medium' | 'hard',
): Promise<void> {
  const slug = themeSlug.trim()
  if (!slug) return
  const key = cacheKey(slug, difficulty)
  memory.delete(key)
  if (!redisConfigured()) return
  try {
    await redisCommand('DEL', key)
  } catch {
    /* ignore */
  }
}

/**
 * 10/10 → on jette le cache (prochaine partie = questions neuves).
 * 1–9 → on enregistre (TTL 5 min).
 * 0 → on ne touche pas (garde un lot précédent encore valide).
 */
export async function syncPartialQuestionCache(
  themeSlug: string,
  difficulty: 'easy' | 'medium' | 'hard',
  questions: PartialCachedQuestion[],
): Promise<void> {
  if (questions.length >= TARGET) {
    await clearPartialQuestions(themeSlug, difficulty)
    return
  }
  if (questions.length >= 1) {
    await savePartialQuestions(themeSlug, difficulty, questions)
  }
}
