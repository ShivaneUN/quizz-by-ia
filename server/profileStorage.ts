/**
 * Profils joueur (pseudo + scores) — Redis prod / mémoire locale.
 */

import { redisCommand, redisConfigured } from './rooms.js'
import { ADMIN_PANEL_CODE } from './adminAuth.js'

const PROFILE_PREFIX = 'quizz:profile:'
const RECOVERY_PREFIX = 'quizz:recovery:'
const PSEUDO_PREFIX = 'quizz:pseudo:'
const PROFILES_INDEX = 'quizz:profiles:index'
const MAX_QUIZ_SCORES = 80
export const ADMIN_PROFILE_ID = 'pf_admin'

const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export interface QuizScoreEntry {
  theme: string
  difficulty: string
  score: number
  date: number
}

export interface MiniGameStats {
  parties: number
  victoires: number
  meilleurScore?: number
  [key: string]: unknown
}

export type ProfileGameMode = 'quiz' | 'pendu' | 'morpion' | 'flagQuiz'

export interface Profile {
  profileId: string
  pseudo: string
  recoveryCode: string
  createdAt: number
  lastUsedAt: number
  usageCount: number
  isAdmin?: boolean
  scores: {
    quiz: QuizScoreEntry[]
    pendu: MiniGameStats
    morpion: MiniGameStats
    flagQuiz: MiniGameStats
  }
}

export interface ProfileSummary {
  profileId: string
  pseudo: string
  recoveryCode: string
  createdAt: number
  lastUsedAt: number
  usageCount: number
  hasStats: boolean
  isAdmin?: boolean
}

const memoryProfiles = new Map<string, Profile>()
const memoryRecovery = new Map<string, string>()
const memoryPseudos = new Map<string, string>()
const memoryIndex: string[] = []

function emptyMini(): MiniGameStats {
  return { parties: 0, victoires: 0 }
}

function emptyScores(): Profile['scores'] {
  return {
    quiz: [],
    pendu: emptyMini(),
    morpion: emptyMini(),
    flagQuiz: emptyMini(),
  }
}

export function normalizePseudo(raw: string): string | null {
  const pseudo = raw.replace(/\s+/g, ' ').trim().slice(0, 24)
  return pseudo.length >= 2 ? pseudo : null
}

export function pseudoLookupKey(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function normalizeRecoveryCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return compact || raw.trim().toUpperCase()
}

function recoveryLookupKeys(raw: string): string[] {
  const compact = normalizeRecoveryCode(raw)
  const keys = [compact, raw.trim().toUpperCase()]
  if (compact.length === 6) {
    keys.push(`${compact.slice(0, 3)}-${compact.slice(3, 6)}`)
  }
  if (compact.length === 8) {
    keys.push(`${compact.slice(0, 4)}-${compact.slice(4, 8)}`)
  }
  if (compact.length === 12) {
    keys.push(
      `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`,
    )
  }
  return [...new Set(keys.filter(Boolean))]
}

function generateRecoveryCode(): string {
  return Array.from({ length: 6 }, () => {
    return RECOVERY_CODE_ALPHABET[
      Math.floor(Math.random() * RECOVERY_CODE_ALPHABET.length)
    ]
  }).join('')
}

function isReservedPseudo(key: string): boolean {
  return key === 'admin'
}

function generateProfileId(): string {
  return `pf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

function asMini(raw: unknown): MiniGameStats {
  if (!raw || typeof raw !== 'object') return emptyMini()
  const o = raw as Record<string, unknown>
  const parties = Math.max(0, Math.floor(Number(o.parties) || 0))
  const victoires = Math.max(0, Math.floor(Number(o.victoires) || 0))
  const best = Number(o.meilleurScore)
  return {
    parties,
    victoires,
    meilleurScore: Number.isFinite(best) && best > 0 ? best : undefined,
  }
}

function asQuizEntry(raw: unknown): QuizScoreEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const theme = String(o.theme ?? '').trim().slice(0, 80)
  if (!theme) return null
  return {
    theme,
    difficulty: String(o.difficulty ?? '').trim().slice(0, 24) || 'easy',
    score: Math.max(0, Math.floor(Number(o.score) || 0)),
    date: Number(o.date) || Date.now(),
  }
}

function parseProfile(raw: unknown): Profile | null {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const profileId = String(o.profileId ?? '')
  const pseudo = String(o.pseudo ?? '').trim()
  const recoveryCode = String(o.recoveryCode ?? '')
  if (!profileId || !pseudo || !recoveryCode) return null
  const scoresRaw =
    o.scores && typeof o.scores === 'object'
      ? (o.scores as Record<string, unknown>)
      : {}
  const quiz = Array.isArray(scoresRaw.quiz)
    ? scoresRaw.quiz
        .map(asQuizEntry)
        .filter((e): e is QuizScoreEntry => e !== null)
        .slice(-MAX_QUIZ_SCORES)
    : []
  return {
    profileId,
    pseudo,
    recoveryCode,
    createdAt: Number(o.createdAt) || Date.now(),
    lastUsedAt: Number(o.lastUsedAt) || Date.now(),
    usageCount: Math.max(0, Math.floor(Number(o.usageCount) || 0)),
    isAdmin: o.isAdmin === true || profileId === ADMIN_PROFILE_ID,
    scores: {
      quiz,
      pendu: asMini(scoresRaw.pendu),
      morpion: asMini(scoresRaw.morpion),
      flagQuiz: asMini(scoresRaw.flagQuiz),
    },
  }
}

function hasStats(p: Profile): boolean {
  return (
    p.scores.quiz.length > 0 ||
    p.scores.pendu.parties > 0 ||
    p.scores.morpion.parties > 0 ||
    p.scores.flagQuiz.parties > 0
  )
}

function toSummary(p: Profile): ProfileSummary {
  return {
    profileId: p.profileId,
    pseudo: p.pseudo,
    recoveryCode: p.recoveryCode,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
    usageCount: p.usageCount,
    hasStats: hasStats(p),
    isAdmin: p.isAdmin === true || p.profileId === ADMIN_PROFILE_ID,
  }
}

async function redisExists(key: string): Promise<boolean> {
  const n = await redisCommand<number>('EXISTS', key)
  return Number(n) > 0
}

async function findProfileIdByPseudo(pseudo: string): Promise<string | null> {
  const key = pseudoLookupKey(pseudo)
  if (!key) return null
  if (redisConfigured()) {
    const owner = await redisCommand<string | null>(
      'GET',
      `${PSEUDO_PREFIX}${key}`,
    )
    if (owner) return String(owner)
    const ids = await redisCommand<unknown>(
      'ZREVRANGE',
      PROFILES_INDEX,
      0,
      400,
    )
    const list = Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string')
      : []
    for (const id of list) {
      const profile = await getProfile(id)
      if (!profile) continue
      if (pseudoLookupKey(profile.pseudo) !== key) continue
      await redisCommand('SET', `${PSEUDO_PREFIX}${key}`, profile.profileId)
      return profile.profileId
    }
    return null
  }
  const indexed = memoryPseudos.get(key)
  if (indexed) return indexed
  for (const profile of memoryProfiles.values()) {
    if (pseudoLookupKey(profile.pseudo) === key) {
      memoryPseudos.set(key, profile.profileId)
      return profile.profileId
    }
  }
  return null
}

/** Lookup cheap : uniquement l’index Redis/mémoire, pas de scan de tous les profils. */
export async function lookupProfileIdByPseudoFast(
  pseudo: string,
): Promise<string | null> {
  const key = pseudoLookupKey(pseudo)
  if (!key) return null
  if (redisConfigured()) {
    const owner = await redisCommand<string | null>(
      'GET',
      `${PSEUDO_PREFIX}${key}`,
    )
    return owner ? String(owner) : null
  }
  return memoryPseudos.get(key) ?? null
}

async function claimPseudo(key: string, profileId: string): Promise<void> {
  if (redisConfigured()) {
    const claimed = await redisCommand<string | null>(
      'SET',
      `${PSEUDO_PREFIX}${key}`,
      profileId,
      'NX',
    )
    if (claimed !== 'OK') {
      const owner = await redisCommand<string | null>(
        'GET',
        `${PSEUDO_PREFIX}${key}`,
      )
      if (owner && String(owner) !== profileId) {
        throw new Error('Ce pseudo est déjà pris')
      }
      await redisCommand('SET', `${PSEUDO_PREFIX}${key}`, profileId)
    }
    return
  }
  const owner = memoryPseudos.get(key)
  if (owner && owner !== profileId) {
    throw new Error('Ce pseudo est déjà pris')
  }
  memoryPseudos.set(key, profileId)
}

async function releasePseudo(key: string, profileId: string): Promise<void> {
  if (!key) return
  if (redisConfigured()) {
    const owner = await redisCommand<string | null>(
      'GET',
      `${PSEUDO_PREFIX}${key}`,
    )
    if (!owner || String(owner) === profileId) {
      await redisCommand('DEL', `${PSEUDO_PREFIX}${key}`)
    }
    return
  }
  if (memoryPseudos.get(key) === profileId) {
    memoryPseudos.delete(key)
  }
}

async function assertPseudoAvailable(
  pseudo: string,
  exceptProfileId?: string,
): Promise<string> {
  const key = pseudoLookupKey(pseudo)
  if (!key || isReservedPseudo(key)) {
    throw new Error('Ce pseudo est déjà pris')
  }
  const owner = await findProfileIdByPseudo(pseudo)
  if (owner && owner !== exceptProfileId) {
    throw new Error('Ce pseudo est déjà pris')
  }
  return key
}

async function saveProfileRecord(profile: Profile): Promise<void> {
  if (redisConfigured()) {
    await redisCommand(
      'SET',
      `${PROFILE_PREFIX}${profile.profileId}`,
      JSON.stringify(profile),
    )
    return
  }
  memoryProfiles.set(profile.profileId, profile)
}

async function recoveryCodeTaken(code: string): Promise<boolean> {
  for (const key of recoveryLookupKeys(code)) {
    if (redisConfigured()) {
      if (await redisExists(`${RECOVERY_PREFIX}${key}`)) return true
    } else if (memoryRecovery.has(key)) {
      return true
    }
  }
  return false
}

export async function createProfile(pseudoRaw: string): Promise<Profile> {
  const pseudo = normalizePseudo(pseudoRaw)
  if (!pseudo) throw new Error('Pseudo requis')
  const pseudoKey = await assertPseudoAvailable(pseudo)

  const profileId = generateProfileId()
  let recoveryCode = generateRecoveryCode()
  let attempts = 0
  while (await recoveryCodeTaken(recoveryCode)) {
    if (++attempts > 5) {
      throw new Error('Impossible de générer un code de récupération unique')
    }
    recoveryCode = generateRecoveryCode()
  }

  const now = Date.now()
  const profile: Profile = {
    profileId,
    pseudo,
    recoveryCode,
    createdAt: now,
    lastUsedAt: now,
    usageCount: 0,
    scores: emptyScores(),
  }

  await claimPseudo(pseudoKey, profileId)
  try {
    if (redisConfigured()) {
      await redisCommand(
        'SET',
        `${PROFILE_PREFIX}${profileId}`,
        JSON.stringify(profile),
      )
      await redisCommand('SET', `${RECOVERY_PREFIX}${recoveryCode}`, profileId)
      await redisCommand('ZADD', PROFILES_INDEX, now, profileId)
    } else {
      memoryProfiles.set(profileId, profile)
      memoryRecovery.set(recoveryCode, profileId)
      memoryIndex.unshift(profileId)
    }
  } catch (err) {
    await releasePseudo(pseudoKey, profileId)
    throw err
  }

  return profile
}

export async function getProfile(profileId: string): Promise<Profile | null> {
  const id = String(profileId ?? '').trim()
  if (!id) return null
  if (redisConfigured()) {
    const raw = await redisCommand<string | null>(
      'GET',
      `${PROFILE_PREFIX}${id}`,
    )
    return parseProfile(raw)
  }
  return memoryProfiles.get(id) ?? null
}

export async function getProfileByRecoveryCode(
  recoveryCodeRaw: string,
): Promise<Profile | null> {
  const raw = String(recoveryCodeRaw ?? '').trim()
  if (!raw) return null
  for (const key of recoveryLookupKeys(raw)) {
    let profileId: string | null = null
    if (redisConfigured()) {
      const found = await redisCommand<string | null>(
        'GET',
        `${RECOVERY_PREFIX}${key}`,
      )
      profileId = found ? String(found) : null
    } else {
      profileId = memoryRecovery.get(key) ?? null
    }
    if (profileId) return getProfile(profileId)
  }
  return null
}

export async function updatePseudo(
  profileId: string,
  pseudoRaw: string,
): Promise<Profile | null> {
  const pseudo = normalizePseudo(pseudoRaw)
  if (!pseudo) throw new Error('Pseudo requis')
  const profile = await getProfile(profileId)
  if (!profile) return null
  const oldKey = pseudoLookupKey(profile.pseudo)
  const newKey = await assertPseudoAvailable(pseudo, profileId)
  if (oldKey === newKey) {
    profile.pseudo = pseudo
    await saveProfileRecord(profile)
    return profile
  }
  await claimPseudo(newKey, profileId)
  try {
    profile.pseudo = pseudo
    await saveProfileRecord(profile)
    await releasePseudo(oldKey, profileId)
  } catch (err) {
    await releasePseudo(newKey, profileId)
    throw err
  }
  return profile
}

export async function updateScores(
  profileId: string,
  mode: ProfileGameMode,
  payload: QuizScoreEntry | Partial<MiniGameStats>,
): Promise<Profile | null> {
  const profile = await getProfile(profileId)
  if (!profile) return null

  if (mode === 'quiz') {
    const entry = asQuizEntry(payload)
    if (!entry) return profile
    profile.scores.quiz.push(entry)
    if (profile.scores.quiz.length > MAX_QUIZ_SCORES) {
      profile.scores.quiz = profile.scores.quiz.slice(-MAX_QUIZ_SCORES)
    }
  } else {
    const cur = profile.scores[mode]
    const patch = payload as Partial<MiniGameStats>
    const next = asMini({ ...cur, ...patch })
    if (typeof patch.meilleurScore === 'number') {
      next.meilleurScore = Math.max(
        cur.meilleurScore ?? 0,
        Math.floor(patch.meilleurScore),
      )
    }
    profile.scores[mode] = next
  }

  profile.usageCount += 1
  profile.lastUsedAt = Date.now()
  await saveProfileRecord(profile)
  return profile
}

export async function deleteProfile(profileId: string): Promise<boolean> {
  const profile = await getProfile(profileId)
  if (!profile) return false

  const recoveryKeys = recoveryLookupKeys(profile.recoveryCode)
  if (redisConfigured()) {
    await redisCommand('DEL', `${PROFILE_PREFIX}${profileId}`)
    for (const key of recoveryKeys) {
      await redisCommand('DEL', `${RECOVERY_PREFIX}${key}`)
    }
    await redisCommand('ZREM', PROFILES_INDEX, profileId)
    await releasePseudo(pseudoLookupKey(profile.pseudo), profileId)
  } else {
    memoryProfiles.delete(profileId)
    for (const key of recoveryKeys) {
      memoryRecovery.delete(key)
    }
    const i = memoryIndex.indexOf(profileId)
    if (i >= 0) memoryIndex.splice(i, 1)
    await releasePseudo(pseudoLookupKey(profile.pseudo), profileId)
  }

  return true
}

export async function getOrCreateAdminProfile(): Promise<Profile> {
  const existing = await getProfile(ADMIN_PROFILE_ID)
  if (existing) {
    existing.isAdmin = true
    if (redisConfigured()) {
      await redisCommand(
        'SET',
        `${PSEUDO_PREFIX}${pseudoLookupKey(existing.pseudo)}`,
        existing.profileId,
      )
    } else {
      memoryPseudos.set(pseudoLookupKey(existing.pseudo), existing.profileId)
    }
    return existing
  }

  const byCode = await getProfileByRecoveryCode(ADMIN_PANEL_CODE)
  if (byCode) {
    byCode.isAdmin = true
    if (redisConfigured()) {
      await redisCommand(
        'SET',
        `${PSEUDO_PREFIX}${pseudoLookupKey(byCode.pseudo)}`,
        byCode.profileId,
      )
    } else {
      memoryPseudos.set(pseudoLookupKey(byCode.pseudo), byCode.profileId)
    }
    return byCode
  }

  const now = Date.now()
  const recoveryCode = ADMIN_PANEL_CODE
  const recoveryKeys = Array.from(
    new Set([recoveryCode, normalizeRecoveryCode(recoveryCode)]),
  )
  const profile: Profile = {
    profileId: ADMIN_PROFILE_ID,
    pseudo: 'Admin',
    recoveryCode,
    createdAt: now,
    lastUsedAt: now,
    usageCount: 0,
    isAdmin: true,
    scores: emptyScores(),
  }

  if (redisConfigured()) {
    await redisCommand(
      'SET',
      `${PROFILE_PREFIX}${ADMIN_PROFILE_ID}`,
      JSON.stringify(profile),
    )
    for (const key of recoveryKeys) {
      await redisCommand('SET', `${RECOVERY_PREFIX}${key}`, ADMIN_PROFILE_ID)
    }
    await redisCommand('ZADD', PROFILES_INDEX, now, ADMIN_PROFILE_ID)
    await redisCommand(
      'SET',
      `${PSEUDO_PREFIX}${pseudoLookupKey(profile.pseudo)}`,
      ADMIN_PROFILE_ID,
    )
  } else {
    memoryProfiles.set(ADMIN_PROFILE_ID, profile)
    for (const key of recoveryKeys) {
      memoryRecovery.set(key, ADMIN_PROFILE_ID)
    }
    memoryIndex.unshift(ADMIN_PROFILE_ID)
    memoryPseudos.set(pseudoLookupKey(profile.pseudo), ADMIN_PROFILE_ID)
  }

  return profile
}

function isHiddenAdminProfile(p: Profile): boolean {
  return (
    p.isAdmin === true ||
    p.profileId === ADMIN_PROFILE_ID ||
    p.pseudo.trim().toLowerCase() === 'admin'
  )
}

export async function listProfiles(
  offset = 0,
  limit = 50,
): Promise<{ total: number; profiles: ProfileSummary[] }> {
  const off = Math.max(0, Math.floor(offset))
  const lim = Math.max(1, Math.min(200, Math.floor(limit)))

  if (redisConfigured()) {
    const ids = await redisCommand<unknown>(
      'ZREVRANGE',
      PROFILES_INDEX,
      0,
      400,
    )
    const list = Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string')
      : []
    const loaded = await Promise.all(list.map((id) => getProfile(id)))
    const visible = loaded
      .filter((p): p is Profile => p !== null && !isHiddenAdminProfile(p))
      .map(toSummary)
    return {
      total: visible.length,
      profiles: visible.slice(off, off + lim),
    }
  }

  const visible = memoryIndex
    .map((id) => memoryProfiles.get(id) ?? null)
    .filter((p): p is Profile => p !== null && !isHiddenAdminProfile(p))
    .map(toSummary)
  return {
    total: visible.length,
    profiles: visible.slice(off, off + lim),
  }
}
