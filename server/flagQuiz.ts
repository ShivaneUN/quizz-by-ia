/**
 * Charge drapeaux.json (public/) pour la génération serveur — aucun LLM.
 * Autosuffisant : ne dépend pas de src/lib/flagQuiz.ts pour éviter les
 * problèmes de résolution .ts sur Vercel serverless.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Types & constantes (dupliqués depuis src/lib/flagQuiz.ts) ─────────────

export type FlagDifficulty = 'easy' | 'medium' | 'hard' | 'expert'

export type FlagCountry = {
  code: string
  nom: string
  fichier: string
  tier: 1 | 2 | 3
}

export type FlagQuizOptions = {
  difficulty: FlagDifficulty
  count: number
  themeSlug: string
}

export const FLAG_CHOICE_COUNT: Record<FlagDifficulty, number> = {
  easy: 4,
  medium: 8,
  hard: 10,
  expert: 10,
}

export const FLAG_MAX_COUNT: Record<FlagDifficulty, number> = {
  easy: 20,
  medium: 60,
  hard: 100,
  expert: 196,
}

const FLAG_MAX_TIER: Record<FlagDifficulty, 1 | 2 | 3> = {
  easy: 1,
  medium: 2,
  hard: 3,
  expert: 3,
}

const FLAG_QUESTION_TEXT = 'De quel pays est ce drapeau ?'

// ── Fonctions (dupliquées depuis src/lib/flagQuiz.ts) ────────────────────

export function isFlagTheme(theme?: string | null): boolean {
  if (!theme?.trim()) return false
  const n = theme
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  const head = n.split(/\s*[—\-–|]\s*/)[0]?.trim() ?? n
  return head === 'drapeaux' || head === 'drapeaux du monde'
}

export function parseFlagDifficulty(raw: unknown): FlagDifficulty {
  if (raw === 'medium' || raw === 'hard' || raw === 'expert') return raw
  return 'easy'
}

export function flagDifficultyToQuestionDifficulty(
  d: FlagDifficulty,
): 'easy' | 'medium' | 'hard' {
  return d === 'easy' || d === 'medium' ? d : 'hard'
}

function flagImageUrl(fichier: string): string {
  const rel = String(fichier ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  return `/drapeaux/${rel}`
}

function flagPool(countries: FlagCountry[], d: FlagDifficulty): FlagCountry[] {
  const maxTier = FLAG_MAX_TIER[d]
  return countries.filter((c) => c.tier >= 1 && c.tier <= maxTier)
}

export function flagCountSteps(d: FlagDifficulty): number[] {
  const max = FLAG_MAX_COUNT[d]
  const steps: number[] = []
  for (let n = 10; n <= max; n += 10) steps.push(n)
  if (d === 'expert' && steps[steps.length - 1] !== 196) steps.push(196)
  return steps
}

export function clampFlagCount(d: FlagDifficulty, count: number): number {
  const steps = flagCountSteps(d)
  const n = Math.round(Number(count) || 10)
  return steps.reduce((best, s) =>
    Math.abs(s - n) < Math.abs(best - n) ? s : best,
  )
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export function generateFlagQuiz(
  countries: FlagCountry[],
  opts: FlagQuizOptions,
) {
  const difficulty = parseFlagDifficulty(opts.difficulty)
  const pool = flagPool(countries, difficulty)
  const k = FLAG_CHOICE_COUNT[difficulty]
  const n = Math.min(clampFlagCount(difficulty, opts.count), pool.length)
  if (n < 1 || pool.length < k) return []

  const targets = shuffle(pool).slice(0, n)
  const now = new Date().toISOString()
  const batchId = `flags-${Date.now()}`
  const qDiff = flagDifficultyToQuestionDifficulty(difficulty)

  return targets.map((country, i) => {
    const decoyPool = shuffle(pool.filter((c) => c.code !== country.code))
    const decoys = decoyPool.slice(0, k - 1).map((c) => c.nom)
    const answers = shuffle([country.nom, ...decoys])
    const correctIndex = answers.indexOf(country.nom)
    return {
      id: `flag-${country.code.toLowerCase()}-${i}`,
      question: FLAG_QUESTION_TEXT,
      answers,
      correctIndex,
      difficulty: qDiff,
      themeSlug: opts.themeSlug,
      createdAt: now,
      batchId,
      explanation: `C'est le drapeau de ${country.nom}.`,
      sourceType: 'local' as const,
      imageUrl: flagImageUrl(country.fichier),
      revealAnswer: country.nom,
    }
  })
}

// ── Chargement drapeaux.json ─────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url))

let cached: FlagCountry[] | null = null

export function loadFlagCountries(): FlagCountry[] {
  if (cached) return cached
  const candidates = [
    join(process.cwd(), 'public', 'drapeaux', 'drapeaux.json'),
    join(HERE, '..', 'public', 'drapeaux', 'drapeaux.json'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const data: unknown = JSON.parse(readFileSync(p, 'utf8'))
    if (!Array.isArray(data)) continue
    cached = data.filter(isCountry)
    return cached
  }
  throw new Error('drapeaux.json introuvable (public/drapeaux/)')
}

function isCountry(raw: unknown): raw is FlagCountry {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  const tier = o.tier
  return (
    typeof o.code === 'string' &&
    typeof o.nom === 'string' &&
    typeof o.fichier === 'string' &&
    (tier === 1 || tier === 2 || tier === 3)
  )
}

export function buildFlagQuiz(
  opts: Omit<FlagQuizOptions, 'difficulty'> & {
    difficulty: FlagDifficulty | string
  },
) {
  const difficulty = parseFlagDifficulty(opts.difficulty)
  return generateFlagQuiz(loadFlagCountries(), {
    difficulty,
    count: opts.count,
    themeSlug: opts.themeSlug,
  })
}
