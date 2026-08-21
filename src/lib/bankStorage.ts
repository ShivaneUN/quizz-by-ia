import type { Difficulty, PlayerThemeHistory, Question, QuestionBank } from '../types'
import { newId } from './id'

const BANK_PREFIX = 'quizz:bank:'
const HISTORY_PREFIX = 'quizz:history:'
const PLAYER_KEY = 'quizz:playerId'
/** Purge les banques pour forcer le nouveau prompt / mode image */
const BANK_IMAGE_VERSION = 19
const BANK_VERSION_KEY = 'quizz:bankImageVersion'

function ensureBankImageVersion(): void {
  const v = Number(localStorage.getItem(BANK_VERSION_KEY) || '0')
  if (v >= BANK_IMAGE_VERSION) return
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(BANK_PREFIX)) toRemove.push(k)
  }
  for (const k of toRemove) localStorage.removeItem(k)
  localStorage.setItem(BANK_VERSION_KEY, String(BANK_IMAGE_VERSION))
}

/** Identifiant joueur persistant (localStorage, sans auth) */
export function getOrCreatePlayerId(): string {
  ensureBankImageVersion()
  let id = localStorage.getItem(PLAYER_KEY)
  if (!id) {
    id = newId()
    localStorage.setItem(PLAYER_KEY, id)
  }
  return id
}

export function loadBank(themeSlug: string): QuestionBank | null {
  ensureBankImageVersion()
  const raw = localStorage.getItem(BANK_PREFIX + themeSlug)
  if (!raw) return null
  try {
    const bank = JSON.parse(raw) as QuestionBank
    // Banques mock (échec API) : on les ignore pour retenter une vraie génération
    if (bank.meta?.source === 'mock') {
      localStorage.removeItem(BANK_PREFIX + themeSlug)
      return null
    }
    // Anciennes banques mock sans flag (questions "[EASY] … mock")
    const looksMock = bank.questions?.some((q) =>
      /question mock/i.test(q.question),
    )
    if (looksMock) {
      localStorage.removeItem(BANK_PREFIX + themeSlug)
      return null
    }
    return bank
  } catch {
    return null
  }
}

export function clearBank(themeSlug: string): void {
  localStorage.removeItem(BANK_PREFIX + themeSlug)
}

/** Retire uniquement les questions d’un palier ; supprime la clé si plus rien. */
export function clearBankTier(themeSlug: string, difficulty: Difficulty): void {
  const bank = loadBank(themeSlug)
  if (!bank) return
  const questions = bank.questions.filter((q) => q.difficulty !== difficulty)
  if (questions.length === 0) {
    localStorage.removeItem(BANK_PREFIX + themeSlug)
    return
  }
  const counts = { easy: 0, medium: 0, hard: 0 } as QuestionBank['meta']['counts']
  for (const q of questions) counts[q.difficulty]++
  saveBank({
    meta: {
      ...bank.meta,
      updatedAt: new Date().toISOString(),
      counts,
    },
    questions,
  })
}

/**
 * Vide banques de questions + historiques solo (localStorage).
 * Conserve l’id joueur, les sessions multi, et le classement mini-jeux.
 */
export function clearLocalQuizCache(): { banks: number; histories: number } {
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k) continue
    if (k.startsWith(BANK_PREFIX) || k.startsWith(HISTORY_PREFIX)) {
      toRemove.push(k)
    }
  }
  let banks = 0
  let histories = 0
  for (const k of toRemove) {
    if (k.startsWith(BANK_PREFIX)) banks++
    else histories++
    localStorage.removeItem(k)
  }
  return { banks, histories }
}

export function saveBank(bank: QuestionBank): void {
  localStorage.setItem(BANK_PREFIX + bank.meta.themeSlug, JSON.stringify(bank))
}

/** Fusionne de nouvelles questions dans une banque existante (génération complémentaire) */
export function mergeQuestionsIntoBank(
  bank: QuestionBank,
  incoming: Question[],
): QuestionBank {
  const existingIds = new Set(bank.questions.map((q) => q.id))
  const added = incoming.filter((q) => !existingIds.has(q.id))
  const questions = [...bank.questions, ...added]
  const counts = { easy: 0, medium: 0, hard: 0 } as QuestionBank['meta']['counts']
  for (const q of questions) counts[q.difficulty]++

  return {
    meta: {
      ...bank.meta,
      updatedAt: new Date().toISOString(),
      counts,
    },
    questions,
  }
}

export function loadHistory(playerId: string, themeSlug: string): PlayerThemeHistory {
  const key = `${HISTORY_PREFIX}${playerId}:${themeSlug}`
  const raw = localStorage.getItem(key)
  if (raw) {
    try {
      return JSON.parse(raw) as PlayerThemeHistory
    } catch {
      /* fallthrough */
    }
  }
  return {
    seenByDifficulty: { easy: [], medium: [], hard: [] },
    seenTexts: [],
    updatedAt: new Date().toISOString(),
  }
}

export function saveHistory(
  playerId: string,
  themeSlug: string,
  history: PlayerThemeHistory,
): void {
  const key = `${HISTORY_PREFIX}${playerId}:${themeSlug}`
  localStorage.setItem(
    key,
    JSON.stringify({ ...history, updatedAt: new Date().toISOString() }),
  )
}

export function markSeen(
  history: PlayerThemeHistory,
  difficulty: Difficulty,
  questionIds: string[],
  questionTexts: string[] = [],
): PlayerThemeHistory {
  const seen = new Set(history.seenByDifficulty[difficulty])
  for (const id of questionIds) seen.add(id)
  const texts = new Set(history.seenTexts ?? [])
  for (const t of questionTexts) {
    const n = t.trim()
    if (n) texts.add(n)
  }
  let seenTexts = [...texts]
  if (seenTexts.length > 200) {
    seenTexts = seenTexts.slice(seenTexts.length - 200)
  }
  return {
    ...history,
    seenByDifficulty: {
      ...history.seenByDifficulty,
      [difficulty]: [...seen],
    },
    seenTexts,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Textes à exclure à la génération : banque locale + historique vu.
 */
export function collectExcludeQuestionTexts(
  themeSlug: string,
  playerId: string,
): string[] {
  const bank = loadBank(themeSlug)
  const history = loadHistory(playerId, themeSlug)
  const out = new Set<string>()
  for (const q of bank?.questions ?? []) {
    if (q.question.trim()) out.add(q.question.trim())
  }
  for (const t of history.seenTexts ?? []) {
    if (t.trim()) out.add(t.trim())
  }
  return [...out]
}

/**
 * Pioche jusqu'à `limit` questions non encore vues pour un palier.
 * Ne déclenche pas de génération — retourne ce qui reste dans la banque.
 */
export function drawUnseen(
  bank: QuestionBank,
  history: PlayerThemeHistory,
  difficulty: Difficulty,
  limit: number,
): Question[] {
  const seen = new Set(history.seenByDifficulty[difficulty])
  const seenTexts = new Set(
    (history.seenTexts ?? []).map((t) =>
      t.trim().toLowerCase().replace(/\s+/g, ' '),
    ),
  )
  const pool = bank.questions.filter((q) => {
    if (q.difficulty !== difficulty || seen.has(q.id)) return false
    const fp = q.question.trim().toLowerCase().replace(/\s+/g, ' ')
    return !seenTexts.has(fp)
  })
  // Mélange Fisher-Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, limit)
}

/** True si le joueur a déjà vu toutes les questions du palier */
export function isTierExhausted(
  bank: QuestionBank,
  history: PlayerThemeHistory,
  difficulty: Difficulty,
): boolean {
  const total = bank.questions.filter((q) => q.difficulty === difficulty).length
  if (total === 0) return true
  const seen = new Set(history.seenByDifficulty[difficulty])
  return bank.questions
    .filter((q) => q.difficulty === difficulty)
    .every((q) => seen.has(q.id))
}
