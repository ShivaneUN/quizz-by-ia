/**
 * Banque curatée sur disque : data/curated/
 *   catalog/<themeId>/<sous-theme>.json
 *   custom/<slug>.json
 * Éditable à la main (ajouter / modifier des questions).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CATALOG,
  curatedFileSlug,
  curatedGroupKey,
} from './themePlacement.js'

/** Forme minimale d’une question dans un fichier JSON. */
export type FileCuratedQuestion = {
  id?: string
  at?: number
  theme?: string
  themeSlug?: string
  placementKind?: 'catalog' | 'custom'
  themeId?: string
  subTheme?: string
  customKey?: string
  groupKey?: string
  rawTheme?: string
  difficulty: 'easy' | 'medium' | 'hard'
  scope?: 'fr' | 'international'
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  correctAnswer: string
  explanation?: string
  sourceType?: string
  liked?: boolean
  verifiedOk?: boolean
  sourcesConfirmed?: number
  confirmingSources?: string
  verdict?: string
  mode?: 'solo' | 'multi'
  playMode?: 'manual' | 'progression'
}

const HERE = dirname(fileURLToPath(import.meta.url))

/** Racine banque fichiers (repo). */
export function curatedDataRoot(): string {
  const candidates = [
    resolve(HERE, '..', 'data', 'curated'),
    resolve(process.cwd(), 'data', 'curated'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

export type CuratedFilePayload = {
  placementKind: 'catalog' | 'custom'
  themeId?: string
  theme: string
  subTheme?: string
  customKey?: string
  groupKey: string
  questions: FileCuratedQuestion[]
}

function emptyPayload(
  kind: 'catalog' | 'custom',
  meta: {
    themeId?: string
    theme: string
    subTheme?: string
    customKey?: string
  },
): CuratedFilePayload {
  const placement =
    kind === 'catalog'
      ? {
          kind: 'catalog' as const,
          themeId: meta.themeId!,
          themeLabel: meta.theme,
          subTheme: meta.subTheme || 'Général',
          rawTheme: meta.theme,
          matched: true,
        }
      : {
          kind: 'custom' as const,
          themeLabel: meta.theme,
          customKey: meta.customKey || curatedFileSlug(meta.theme),
          rawTheme: meta.theme,
          matched: false,
        }
  return {
    placementKind: kind,
    themeId: meta.themeId,
    theme: meta.theme,
    subTheme: meta.subTheme,
    customKey: meta.customKey ?? placement.customKey,
    groupKey: curatedGroupKey(placement),
    questions: [],
  }
}

export function catalogFilePath(themeId: string, subTheme: string): string {
  return join(
    curatedDataRoot(),
    'catalog',
    themeId,
    `${curatedFileSlug(subTheme)}.json`,
  )
}

export function customFilePath(customKey: string): string {
  return join(
    curatedDataRoot(),
    'custom',
    `${curatedFileSlug(customKey)}.json`,
  )
}

export function pathForQuestion(q: {
  placementKind: 'catalog' | 'custom'
  themeId?: string
  subTheme?: string
  customKey?: string
  theme: string
  rawTheme: string
}): string {
  if (q.placementKind === 'catalog' && q.themeId) {
    return catalogFilePath(q.themeId, q.subTheme || 'Général')
  }
  const key =
    q.customKey ||
    curatedFileSlug(q.theme || q.rawTheme || 'theme-libre')
  return customFilePath(key)
}

/** Crée tous les JSON catalogue (vides) + dossier custom. */
export function scaffoldCuratedFolders(): { created: number; skipped: number } {
  const root = curatedDataRoot()
  mkdirSync(join(root, 'custom'), { recursive: true })
  let created = 0
  let skipped = 0
  for (const parent of CATALOG) {
    for (const sub of parent.subs) {
      const path = catalogFilePath(parent.id, sub)
      mkdirSync(dirname(path), { recursive: true })
      if (existsSync(path)) {
        skipped++
        continue
      }
      writeFileSync(
        path,
        JSON.stringify(
          emptyPayload('catalog', {
            themeId: parent.id,
            theme: parent.label,
            subTheme: sub,
          }),
          null,
          2,
        ) + '\n',
        'utf8',
      )
      created++
    }
  }
  const readme = join(root, 'LISEZMOI.txt')
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      [
        'Banque curatée — fichiers éditables',
        '',
        'catalog/<theme>/<sous-theme>.json  → thèmes du jeu',
        'custom/<nom>.json                 → thèmes libres (Dofus, etc.)',
        '',
        'Chaque fichier :',
        '  { "theme": "...", "subTheme": "...", "questions": [ ... ] }',
        '',
        'Pour ajouter une question, copie un objet existant dans "questions"',
        '(question, answers[4], correctIndex 0-3, correctAnswer, difficulty).',
        '',
      ].join('\n'),
      'utf8',
    )
  }
  return { created, skipped }
}

function readPayload(path: string): CuratedFilePayload | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as CuratedFilePayload
    if (!raw || !Array.isArray(raw.questions)) return null
    return raw
  } catch {
    return null
  }
}

function walkJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) out.push(...walkJsonFiles(p))
    else if (name.isFile() && name.name.endsWith('.json')) out.push(p)
  }
  return out
}

/** Charge toutes les questions des fichiers. */
export function loadCuratedFromFiles(): FileCuratedQuestion[] {
  const root = curatedDataRoot()
  const files = [
    ...walkJsonFiles(join(root, 'catalog')),
    ...walkJsonFiles(join(root, 'custom')),
  ]
  const out: FileCuratedQuestion[] = []
  for (const path of files) {
    const payload = readPayload(path)
    if (!payload) continue
    const rel = relative(root, path).replace(/\\/g, '/')
    for (const q of payload.questions) {
      if (!q?.question || !Array.isArray(q.answers) || q.answers.length !== 4) {
        continue
      }
      const difficulty = q.difficulty
      if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') {
        continue
      }
      const idx = Number(q.correctIndex)
      if (![0, 1, 2, 3].includes(idx)) continue
      const placementKind =
        payload.placementKind === 'catalog' ? 'catalog' : 'custom'
      out.push({
        id:
          String(q.id ?? '').trim() ||
          `file-${rel}-${out.length}`,
        at: Number(q.at) || Date.now(),
        theme: payload.theme || String(q.theme ?? ''),
        themeSlug: q.themeSlug,
        placementKind,
        themeId: payload.themeId ?? q.themeId,
        subTheme: payload.subTheme ?? q.subTheme,
        customKey: payload.customKey ?? q.customKey,
        groupKey: payload.groupKey || rel,
        rawTheme: String(q.rawTheme ?? payload.theme ?? ''),
        difficulty,
        scope: q.scope === 'international' || q.scope === 'fr' ? q.scope : undefined,
        question: String(q.question).trim(),
        answers: q.answers.map(String) as [string, string, string, string],
        correctIndex: idx as 0 | 1 | 2 | 3,
        correctAnswer: String(q.correctAnswer ?? q.answers[idx]),
        explanation: q.explanation ? String(q.explanation) : undefined,
        sourceType: q.sourceType ? String(q.sourceType) : undefined,
        liked: q.liked !== false,
        verifiedOk: q.verifiedOk !== false,
        sourcesConfirmed: q.sourcesConfirmed,
        confirmingSources: q.confirmingSources
          ? String(q.confirmingSources)
          : undefined,
        verdict: q.verdict ? String(q.verdict) : undefined,
        mode: q.mode === 'multi' || q.mode === 'solo' ? q.mode : undefined,
        playMode:
          q.playMode === 'manual' || q.playMode === 'progression'
            ? q.playMode
            : undefined,
      })
    }
  }
  return out
}

/** Ajoute / déduplique une question dans le bon fichier JSON. */
export function appendQuestionToFile(q: FileCuratedQuestion & {
  placementKind: 'catalog' | 'custom'
  theme: string
  rawTheme: string
}): {
  ok: boolean
  path?: string
  skipped?: string
} {
  const path = pathForQuestion(q)
  mkdirSync(dirname(path), { recursive: true })
  let payload = readPayload(path)
  if (!payload) {
    payload =
      q.placementKind === 'catalog'
        ? emptyPayload('catalog', {
            themeId: q.themeId,
            theme: q.theme,
            subTheme: q.subTheme || 'Général',
          })
        : emptyPayload('custom', {
            theme: q.theme,
            customKey: q.customKey || curatedFileSlug(q.theme),
          })
  }
  const dup = payload.questions.some(
    (e) =>
      e.question === q.question &&
      e.correctAnswer === q.correctAnswer &&
      e.difficulty === q.difficulty,
  )
  if (dup) return { ok: true, path, skipped: 'duplicate' }

  payload.questions.push({
    id: q.id,
    at: q.at,
    difficulty: q.difficulty,
    question: q.question,
    answers: q.answers,
    correctIndex: q.correctIndex,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    sourceType: q.sourceType,
    liked: true,
    verifiedOk: true,
    sourcesConfirmed: q.sourcesConfirmed,
    confirmingSources: q.confirmingSources,
    verdict: q.verdict,
    rawTheme: q.rawTheme,
    scope: q.scope,
    mode: q.mode,
    playMode: q.playMode,
  })
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  return { ok: true, path }
}

/** Vide le tableau questions de tous les JSON (garde la structure dossiers). */
export function clearAllCuratedFileQuestions(): number {
  const root = curatedDataRoot()
  const files = [
    ...walkJsonFiles(join(root, 'catalog')),
    ...walkJsonFiles(join(root, 'custom')),
  ]
  let n = 0
  for (const path of files) {
    const payload = readPayload(path)
    if (!payload || payload.questions.length === 0) continue
    n += payload.questions.length
    payload.questions = []
    writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  }
  return n
}

