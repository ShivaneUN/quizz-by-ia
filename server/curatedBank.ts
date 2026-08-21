/**
 * Banque curatée : questions likées + vérifiées OK.
 * Source de vérité = fichiers data/curated/ (pas Redis — évite les doublons).
 * Placement : catalogue thème/sous-thème EXISTANT uniquement.
 * Quiz manuel / thème non rattachable → fichier custom isolé.
 * On n’ajoute JAMAIS de thème/sous-thème au catalogue sans demande user.
 * Ingestion joueur DÉSACTIVÉE (CURATED_BANK_INGEST_ENABLED = false).
 */

import {
  appendQuestionToFile,
  loadCuratedFromFiles,
} from './curatedFiles.js'
import {
  curatedGroupKey,
  placeTheme,
  type ThemePlacement,
  type ThemePlacementKind,
} from './themePlacement.js'

const MAX_ENTRIES = 8000

/** Remettre à true quand assez de thèmes / feedback pour alimenter la banque. */
export const CURATED_BANK_INGEST_ENABLED = false

/**
 * Secours génération : piocher dans la banque curatée si l’IA échoue.
 * À activer seulement avec une grosse banque (sinon filet trop vide).
 * Ne pas brancher tant que false.
 */
export const CURATED_BANK_FALLBACK_ENABLED = false

export type CuratedDifficulty = 'easy' | 'medium' | 'hard'

export interface CuratedQuestion {
  id: string
  at: number
  /** Libellé d’affichage (parent ou custom) */
  theme: string
  themeSlug?: string
  /** catalog = ORBIT/SUBTHEMES ; custom = génération manuelle / hors catalogue */
  placementKind: ThemePlacementKind
  themeId?: string
  subTheme?: string
  customKey?: string
  groupKey: string
  rawTheme: string
  difficulty: CuratedDifficulty
  scope?: 'fr' | 'international'
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  correctAnswer: string
  explanation?: string
  sourceType?: string
  liked: boolean
  verifiedOk: boolean
  sourcesConfirmed?: number
  confirmingSources?: string
  verdict?: string
  mode?: 'solo' | 'multi'
  /** Origine UI : free/manual vs progression catalogue */
  playMode?: 'manual' | 'progression'
}

export async function clearCuratedBank(): Promise<void> {
  // data/curated/ est la banque permanente — ne pas la vider via reset logs.
  // Pour vider manuellement : clearAllCuratedFileQuestions() (script / admin dédié).
}

function asAnswers(raw: unknown): [string, string, string, string] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  return raw.map((x) => String(x).slice(0, 200)) as [
    string,
    string,
    string,
    string,
  ]
}

function resolvePlacement(raw: Partial<CuratedQuestion>): ThemePlacement {
  if (raw.placementKind === 'catalog' && raw.themeId && raw.theme) {
    return placeTheme(raw.rawTheme || raw.theme, {
      themeId: raw.themeId,
      subTheme: raw.subTheme,
    })
  }
  if (raw.placementKind === 'custom' && (raw.customKey || raw.theme)) {
    const label = String(raw.theme || raw.rawTheme || '').trim()
    const file =
      String(raw.customKey ?? '')
        .replace(/^custom\/?/i, '')
        .trim() ||
      label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') ||
      'theme-libre'
    return {
      kind: 'custom',
      themeLabel: label,
      customKey: file,
      rawTheme: String(raw.rawTheme || label),
      matched: false,
    }
  }
  return placeTheme(String(raw.rawTheme || raw.theme || ''), {
    themeId: raw.themeId,
    subTheme: raw.subTheme,
  })
}

function normalize(raw: Partial<CuratedQuestion>): CuratedQuestion | null {
  const difficulty = raw.difficulty
  if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') {
    return null
  }
  const question = String(raw.question ?? '').trim().slice(0, 400)
  if (question.length < 3) return null
  const answers = asAnswers(raw.answers)
  if (!answers) return null
  const correctIndex = Number(raw.correctIndex)
  if (![0, 1, 2, 3].includes(correctIndex)) return null
  const idx = correctIndex as 0 | 1 | 2 | 3

  const placement = resolvePlacement(raw)
  const theme = placement.themeLabel
  if (!theme) return null

  const correctAnswer =
    String(raw.correctAnswer ?? answers[idx] ?? '').trim().slice(0, 200) ||
    answers[idx]

  return {
    id:
      String(raw.id ?? '').trim().slice(0, 80) ||
      `cur-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: Number(raw.at) || Date.now(),
    theme,
    themeSlug: raw.themeSlug
      ? String(raw.themeSlug).trim().slice(0, 100)
      : undefined,
    placementKind: placement.kind,
    themeId: placement.themeId,
    subTheme: placement.subTheme,
    customKey: placement.customKey,
    groupKey: curatedGroupKey(placement),
    rawTheme: placement.rawTheme,
    difficulty,
    scope:
      raw.scope === 'international'
        ? 'international'
        : raw.scope === 'fr'
          ? 'fr'
          : undefined,
    question,
    answers,
    correctIndex: idx,
    correctAnswer,
    explanation: raw.explanation
      ? String(raw.explanation).trim().slice(0, 600)
      : undefined,
    sourceType: raw.sourceType
      ? String(raw.sourceType).trim().slice(0, 120)
      : undefined,
    liked: Boolean(raw.liked),
    verifiedOk: Boolean(raw.verifiedOk),
    sourcesConfirmed:
      typeof raw.sourcesConfirmed === 'number'
        ? Math.max(0, Math.min(20, Math.floor(raw.sourcesConfirmed)))
        : undefined,
    confirmingSources: raw.confirmingSources
      ? String(raw.confirmingSources).trim().slice(0, 500)
      : undefined,
    verdict: raw.verdict ? String(raw.verdict).trim().slice(0, 20) : undefined,
    mode: raw.mode === 'multi' ? 'multi' : raw.mode === 'solo' ? 'solo' : undefined,
    playMode:
      raw.playMode === 'manual'
        ? 'manual'
        : raw.playMode === 'progression'
          ? 'progression'
          : undefined,
  }
}

/** Pour scripts de sync Redis → fichiers. */
export function normalizeCuratedForSync(
  raw: Partial<CuratedQuestion> | Record<string, unknown>,
): CuratedQuestion | null {
  return normalize(raw as Partial<CuratedQuestion>)
}

function sameQuestion(a: CuratedQuestion, b: CuratedQuestion): boolean {
  return (
    a.question === b.question &&
    a.correctAnswer === b.correctAnswer &&
    a.difficulty === b.difficulty
  )
}

/** Lecture banque = fichiers uniquement. */
export async function listCuratedQuestions(
  limit = 5000,
): Promise<CuratedQuestion[]> {
  const cap = Math.max(1, Math.min(MAX_ENTRIES, Math.floor(limit)))
  const fromFiles = loadCuratedFromFiles()
    .map((f) => normalize(f as Partial<CuratedQuestion>))
    .filter((e): e is CuratedQuestion => e != null)

  const seen = new Set<string>()
  const out: CuratedQuestion[] = []
  for (const e of fromFiles) {
    const k = `${e.question}||${e.correctAnswer}||${e.difficulty}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out.slice(0, cap)
}

async function pushCuratedQuestion(
  event: CuratedQuestion,
): Promise<{ ok: boolean; skipped?: string; placement?: ThemePlacement }> {
  const existing = await listCuratedQuestions(800)
  if (existing.some((e) => sameQuestion(e, event))) {
    return { ok: true, skipped: 'duplicate' }
  }

  try {
    const fileResult = appendQuestionToFile(event)
    if (fileResult.skipped === 'duplicate') {
      return { ok: true, skipped: 'duplicate' }
    }
  } catch {
    return { ok: false, skipped: 'file_write_failed' }
  }

  return {
    ok: true,
    placement: {
      kind: event.placementKind,
      themeId: event.themeId,
      themeLabel: event.theme,
      subTheme: event.subTheme,
      customKey: event.customKey,
      rawTheme: event.rawTheme,
      matched: event.placementKind === 'catalog',
    },
  }
}

/**
 * Ajoute une question curatée (dédup énoncé+réponse+niveau).
 * No-op si CURATED_BANK_INGEST_ENABLED = false.
 */
export async function recordCuratedQuestion(
  input: Partial<CuratedQuestion>,
): Promise<{ ok: boolean; skipped?: string; placement?: ThemePlacement }> {
  if (!CURATED_BANK_INGEST_ENABLED) {
    return { ok: false, skipped: 'ingest_disabled' }
  }
  const event = normalize(input)
  if (!event) return { ok: false, skipped: 'invalid' }
  if (!event.liked || !event.verifiedOk) {
    return { ok: false, skipped: 'not_qualified' }
  }
  return pushCuratedQuestion(event)
}

/**
 * Ajout manuel (script admin) — ignore le flag d’ingest joueur.
 * Toujours liked + verifiedOk requis.
 */
export async function seedCuratedQuestion(
  input: Partial<CuratedQuestion>,
): Promise<{ ok: boolean; skipped?: string; placement?: ThemePlacement }> {
  const event = normalize({ ...input, liked: true, verifiedOk: true })
  if (!event) return { ok: false, skipped: 'invalid' }
  return pushCuratedQuestion(event)
}

export function summarizeCuratedBank(events: CuratedQuestion[]) {
  const byDifficulty: Record<CuratedDifficulty, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
  }
  const byTheme: Record<string, number> = {}
  let catalog = 0
  let custom = 0
  const groups = new Set<string>()
  for (const e of events) {
    byDifficulty[e.difficulty] += 1
    const label =
      e.placementKind === 'catalog'
        ? `${e.theme}${e.subTheme && e.subTheme !== 'Général' ? ` — ${e.subTheme}` : ''}`
        : `custom:${e.theme}`
    byTheme[label] = (byTheme[label] ?? 0) + 1
    if (e.placementKind === 'catalog') catalog += 1
    else custom += 1
    groups.add(e.groupKey)
  }
  return {
    total: events.length,
    byDifficulty,
    themeCount: Object.keys(byTheme).length,
    groupCount: groups.size,
    catalogCount: catalog,
    customCount: custom,
    byTheme,
    ingestEnabled: CURATED_BANK_INGEST_ENABLED,
  }
}

export function qualifiesForCuratedBank(input: {
  liked?: boolean
  verifiedOk?: boolean
  sourcesConfirmed?: number
  answerVerdict?: string
  sourceVerdict?: string
}): boolean {
  if (!input.liked) return false
  if (!input.verifiedOk) return false
  const n = Number(input.sourcesConfirmed ?? 0)
  if (!Number.isFinite(n) || n < 2) return false
  if (input.answerVerdict && input.answerVerdict !== 'ok') return false
  if (input.sourceVerdict && input.sourceVerdict !== 'ok') return false
  return true
}
