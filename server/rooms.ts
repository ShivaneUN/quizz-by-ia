/**
 * Stockage des salles multi — mémoire (dev local) + Upstash Redis (prod Vercel).
 */

/** lobby | generating (IA) | playing | finished | error (génération échouée) */
export type RoomStatus =
  | 'lobby'
  | 'generating'
  | 'playing'
  | 'finished'
  | 'error'

/**
 * waiting = chrono pas encore lancé (hôte doit démarrer) ;
 * answering = les joueurs répondent ;
 * reveal = feedback, l’hôte passe à la suivante
 */
export type RoundPhase = 'waiting' | 'answering' | 'reveal'

export interface RoomPlayer {
  id: string
  name: string
  score: number
  joinedAt: number
  /** Bonnes réponses consécutives en cours */
  streakActuelle?: number
  /** Meilleure série de la partie */
  meilleurStreak?: number
  /** Bonus streak appliqué à la fin (0 si pas encore) */
  bonusApplique?: number
  /** Score du mini-jeu de frappe pendant la génération */
  typingScore?: number
}

export interface RoomQuestion {
  id: string
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  explanation?: string
  sourceType?: string
  imageUrl?: string
  previewUrl?: string
  coverUrl?: string
  deezerTrackId?: string
  revealAnswer?: string
  answerMode?: 'qcm' | 'free'
  acceptedAnswers?: string[]
  freeInputHint?: 'title' | 'title_or_artist'
}

/** Réponse d’un joueur sur une manche (null = pas répondu / faux auto) */
export type RoundAnswers = Record<string, number | null>

export interface RoomState {
  code: string
  hostId: string
  status: RoomStatus
  theme: string
  scope: 'fr' | 'international'
  /** Chrono par question (hôte) — si false, on avance seulement quand tout le monde a répondu */
  timerEnabled: boolean
  /** Paliers (easy→hard, ≥8/10) ou difficulté libre */
  playMode: 'progression' | 'free'
  /** Difficulté des questions générées pour la manche */
  difficulty: 'easy' | 'medium' | 'hard'
  /** IA : auto ou provider forcé */
  aiProvider: 'auto' | 'groq' | 'gemini' | 'cerebras' | 'deepseek' | 'openrouter'
  /** standard = texte IA ; audio = quiz Deezer */
  quizMode?: 'standard' | 'image' | 'audio'
  /** Deezer : lecture auto des extraits (hôte) */
  audioAutoplay?: boolean
  /** Message si status === 'error' */
  errorMessage?: string
  players: RoomPlayer[]
  questions: RoomQuestion[]
  questionIndex: number
  /** waiting | answering | reveal */
  roundPhase: RoundPhase
  /** Timestamp ms du début effectif du chrono (0 si waiting / pause mal formée). */
  roundStartedAt: number
  roundDurationMs: number
  /**
   * true une fois que l’hôte a lancé le chrono pour la partie :
   * les questions suivantes démarrent sans redemander.
   */
  timerStarted?: boolean
  /** Chrono figé par l’hôte en cours de manche */
  timerPaused?: boolean
  /** ms restantes au moment de la pause */
  timerPausedLeftMs?: number
  /**
   * Deadline absolue serveur (ms) du chrono — source de vérité.
   * 0 si pas de chrono actif.
   */
  roundDeadlineAt?: number
  /** playerId → index réponse (absent = pas encore) */
  currentAnswers: Record<string, number>
  /** Bonus streak déjà comptés dans score (évite double application) */
  scoresFinalized?: boolean
  /** ETA génération (secondes) pendant status === generating */
  genEstimateSec?: number
  /** Questions déjà générées (progression X/10) */
  genQuestionsDone?: number
  /** Total cible (toujours 10) */
  genQuestionsTotal?: number
  /** Provider IA en cours (gemini / groq / …) pendant generating */
  genAiSource?: string
  /** Horodatage début génération — plafond absolu anti-boucle topup */
  generatingStartedAt?: number
  /** Dernière activité gen (runGenerate / progress) — watchdog orphelin */
  generatingHeartbeatAt?: number
  /**
   * Questions déjà collectées pendant generating (top-up multi).
   * Jamais exposé via publicRoomView.
   */
  genCollectedQuestions?: RoomQuestion[]
  /** Signal public : l’hôte doit rappeler runGenerate pour un complément */
  needsTopUp?: boolean
  /** L’hôte est sur l’écran choix de thème — les autres restent au lobby */
  hostPickingTheme?: boolean
  createdAt: number
  updatedAt: number
}

export const ROUND_MS = 10_000
export const MULTI_QUESTION_COUNT = 10
/** TTL Redis salle (inactivité) — rafraîchi à chaque save / poll */
export const ROOM_TTL_SEC = 60 * 5
/** Au-delà sans heartbeat : génération orpheline (ex. kill Vercel) → status error */
export const GENERATING_STALE_MS = 70_000
/** Plafond total depuis le 1er start (plusieurs topups HTTP) */
export const GENERATING_ABSOLUTE_MAX_MS = 180_000
/** Verrou runGenerate (secondes) — ≥ budget IA + marge */
export const GEN_LOCK_TTL_SEC = 70

const memory = new Map<string, RoomState>()
const genLockMemory = new Map<string, { token: string; expiresAt: number }>()

function redisConfigured(): boolean {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN),
  )
}

async function redisCommand<T>(...args: (string | number)[]): Promise<T | null> {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  const res = await fetch(`${url}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(4_000),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Redis ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = (await res.json()) as { result?: T }
  return data.result ?? null
}

export { redisCommand, redisConfigured }

function roomKey(code: string): string {
  return `quizz:room:${code.toUpperCase()}`
}

function genLockKey(code: string): string {
  return `quizz:genlock:${code.toUpperCase()}`
}

/** Pose un verrou exclusif pour runGenerate (SET NX EX). */
export async function tryAcquireGenLock(
  code: string,
): Promise<{ acquired: boolean; token: string }> {
  const c = code.trim().toUpperCase()
  const token = newPlayerId()
  if (redisConfigured()) {
    const result = await redisCommand<string | null>(
      'SET',
      genLockKey(c),
      token,
      'NX',
      'EX',
      GEN_LOCK_TTL_SEC,
    )
    return { acquired: result === 'OK', token }
  }
  const now = Date.now()
  const cur = genLockMemory.get(c)
  if (cur && cur.expiresAt > now) {
    return { acquired: false, token }
  }
  genLockMemory.set(c, {
    token,
    expiresAt: now + GEN_LOCK_TTL_SEC * 1000,
  })
  return { acquired: true, token }
}

/** Libère le verrou si le token correspond (fin normale / finally). */
export async function releaseGenLock(
  code: string,
  token: string,
): Promise<void> {
  const c = code.trim().toUpperCase()
  if (redisConfigured()) {
    try {
      const cur = await redisCommand<string | null>('GET', genLockKey(c))
      if (cur === token) await redisCommand('DEL', genLockKey(c))
    } catch {
      /* best effort */
    }
    return
  }
  const cur = genLockMemory.get(c)
  if (cur?.token === token) genLockMemory.delete(c)
}

/** Annulation hôte / watchdog — force la libération. */
export async function forceReleaseGenLock(code: string): Promise<void> {
  const c = code.trim().toUpperCase()
  if (redisConfigured()) {
    try {
      await redisCommand('DEL', genLockKey(c))
    } catch {
      /* best effort */
    }
    return
  }
  genLockMemory.delete(c)
}

/** Nettoie les champs de génération (progress + partial + signal top-up). */
export function clearGeneratingFields(room: RoomState): void {
  delete room.genEstimateSec
  delete room.genQuestionsDone
  delete room.genQuestionsTotal
  delete room.genAiSource
  delete room.generatingStartedAt
  delete room.generatingHeartbeatAt
  delete room.genCollectedQuestions
  delete room.needsTopUp
}

function normalizeRoomStatus(raw: string | undefined): RoomStatus {
  if (
    raw === 'lobby' ||
    raw === 'generating' ||
    raw === 'playing' ||
    raw === 'finished' ||
    raw === 'error'
  ) {
    return raw
  }
  return 'lobby'
}

export async function getRoom(code: string): Promise<RoomState | null> {
  const c = code.trim().toUpperCase()
  let room: RoomState | null = null
  if (redisConfigured()) {
    const raw = await redisCommand<string | null>('GET', roomKey(c))
    if (!raw) return null
    room = JSON.parse(raw) as RoomState
  } else {
    room = memory.get(c) ?? null
  }
  if (!room) return null
  // Compat salles anciennes
  room.status = normalizeRoomStatus(room.status)
  if (typeof room.timerEnabled !== 'boolean') {
    room.timerEnabled = false
  }
  if (
    room.difficulty !== 'easy' &&
    room.difficulty !== 'medium' &&
    room.difficulty !== 'hard'
  ) {
    room.difficulty = 'easy'
  }
  if (room.playMode !== 'progression' && room.playMode !== 'free') {
    room.playMode = 'free'
  }
  // Compat : thème Deezer sans quizMode → audio
  if (/^deezer\b/i.test(String(room.theme ?? '').trim())) {
    room.quizMode = 'audio'
  } else if (room.quizMode !== 'audio') {
    room.quizMode = 'standard'
  }
  if (
    room.roundPhase !== 'waiting' &&
    room.roundPhase !== 'answering' &&
    room.roundPhase !== 'reveal'
  ) {
    room.roundPhase = 'answering'
  }
  if (typeof room.timerStarted !== 'boolean') {
    room.timerStarted = false
  }
  if (typeof room.timerPaused !== 'boolean') {
    room.timerPaused = false
  }
  // Guérit le bug « 0s » : answering + chrono sans horodatage → waiting
  if (
    room.status === 'playing' &&
    room.timerEnabled !== false &&
    room.roundPhase === 'answering' &&
    !(room.roundStartedAt > 0) &&
    !(typeof room.roundDeadlineAt === 'number' && room.roundDeadlineAt > 0) &&
    !room.timerPaused
  ) {
    room.roundPhase = 'waiting'
    room.roundStartedAt = 0
    room.roundDeadlineAt = 0
  }
  if (!Number.isFinite(room.roundDurationMs) || room.roundDurationMs <= 0) {
    room.roundDurationMs = ROUND_MS
  }
  room.players = room.players.map((p) => ({
    ...p,
    streakActuelle:
      typeof p.streakActuelle === 'number' && p.streakActuelle >= 0
        ? p.streakActuelle
        : 0,
    meilleurStreak:
      typeof p.meilleurStreak === 'number' && p.meilleurStreak >= 0
        ? p.meilleurStreak
        : 0,
    bonusApplique:
      typeof p.bonusApplique === 'number' && p.bonusApplique >= 0
        ? p.bonusApplique
        : 0,
  }))
  return room
}

export async function saveRoom(room: RoomState): Promise<void> {
  room.updatedAt = Date.now()
  if (redisConfigured()) {
    await redisCommand(
      'SET',
      roomKey(room.code),
      JSON.stringify(room),
      'EX',
      ROOM_TTL_SEC,
    )
    return
  }
  memory.set(room.code, room)
}

export async function deleteRoom(code: string): Promise<void> {
  const c = code.trim().toUpperCase()
  if (redisConfigured()) {
    await redisCommand('DEL', roomKey(c))
    return
  }
  memory.delete(c)
}

/** Prolonge le TTL tant que quelqu’un poll la salle. */
export async function touchRoom(code: string): Promise<void> {
  const c = code.trim().toUpperCase()
  if (!redisConfigured()) return
  await redisCommand('EXPIRE', roomKey(c), ROOM_TTL_SEC)
}

export function newPlayerId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

/** Reset scores + streaks pour une nouvelle manche (relance / start). */
export function resetPlayersForNewGame(room: RoomState): void {
  room.scoresFinalized = false
  room.players = room.players.map((p) => ({
    ...p,
    score: 0,
    streakActuelle: 0,
    meilleurStreak: 0,
    bonusApplique: 0,
    typingScore: 0,
  }))
}

export function calculerBonusStreak(
  meilleurStreak: number,
  totalQuestions: number,
  streakParfaite: boolean,
): number {
  if (totalQuestions === 10 && streakParfaite) return 5
  if (meilleurStreak >= 8) return 3
  if (meilleurStreak >= 5) return 2
  if (meilleurStreak >= 3) return 1
  return 0
}

/** Applique le bonus de série une seule fois à la fin de partie. */
export function finalizeScores(room: RoomState): void {
  if (room.scoresFinalized) return
  const total = room.questions.length
  for (const p of room.players) {
    const best = p.meilleurStreak ?? 0
    const streakParfaite = total > 0 && best === total
    const bonus = calculerBonusStreak(best, total, streakParfaite)
    p.score += bonus
    p.bonusApplique = bonus
  }
  room.scoresFinalized = true
}

/**
 * Prépare une manche :
 * - sans chrono → answering immédiat
 * - avec chrono, jamais lancé → waiting (hôte doit begin une fois)
 * - avec chrono déjà lancé → answering immédiat (pas de re-demande)
 */
export function prepareRound(room: RoomState, now = Date.now()): void {
  room.currentAnswers = {}
  room.timerPaused = false
  room.timerPausedLeftMs = undefined
  const duration =
    Number.isFinite(room.roundDurationMs) && room.roundDurationMs > 0
      ? room.roundDurationMs
      : ROUND_MS
  room.roundDurationMs = duration

  if (room.timerEnabled === false) {
    room.roundPhase = 'answering'
    room.roundStartedAt = now
    room.roundDeadlineAt = 0
    return
  }
  if (!room.timerStarted) {
    room.roundPhase = 'waiting'
    room.roundStartedAt = 0
    room.roundDeadlineAt = 0
    return
  }
  room.roundPhase = 'answering'
  room.roundStartedAt = now
  room.roundDeadlineAt = now + duration
}

/**
 * Hôte : lance (ou relance) le chrono.
 * Idempotent / réparateur : marche depuis waiting ou depuis un état cassé.
 */
export function hostBeginRound(room: RoomState, now = Date.now()): RoomState {
  if (room.status !== 'playing') return room
  if (room.roundPhase === 'reveal') return room

  const duration =
    Number.isFinite(room.roundDurationMs) && room.roundDurationMs > 0
      ? room.roundDurationMs
      : ROUND_MS
  room.roundDurationMs = duration

  if (room.timerEnabled === false) {
    room.roundPhase = 'answering'
    room.roundStartedAt = now
    room.roundDeadlineAt = 0
    room.timerPaused = false
    room.timerPausedLeftMs = undefined
    return room
  }

  // Déjà en cours avec deadline valide → ne pas reset (évite double-clic)
  if (
    room.roundPhase === 'answering' &&
    room.timerStarted &&
    !room.timerPaused &&
    typeof room.roundDeadlineAt === 'number' &&
    room.roundDeadlineAt > now
  ) {
    return room
  }

  room.timerStarted = true
  room.timerPaused = false
  room.timerPausedLeftMs = undefined
  room.roundPhase = 'answering'
  room.roundStartedAt = now
  room.roundDeadlineAt = now + duration
  return room
}

/** Hôte : met le chrono en pause (reste en answering). */
export function hostPauseTimer(room: RoomState, now = Date.now()): RoomState {
  if (room.status !== 'playing') return room
  if (room.roundPhase !== 'answering') return room
  if (room.timerEnabled === false) return room
  if (room.timerPaused) return room
  const deadline =
    typeof room.roundDeadlineAt === 'number' && room.roundDeadlineAt > 0
      ? room.roundDeadlineAt
      : room.roundStartedAt > 0
        ? room.roundStartedAt + room.roundDurationMs
        : 0
  if (!(deadline > 0)) return room
  const left = Math.max(0, deadline - now)
  room.timerPaused = true
  room.timerPausedLeftMs = left
  room.roundDeadlineAt = 0
  return room
}

/** Hôte : reprend le chrono après pause. */
export function hostResumeTimer(room: RoomState, now = Date.now()): RoomState {
  if (room.status !== 'playing') return room
  if (room.roundPhase !== 'answering') return room
  if (!room.timerPaused) return room
  const left =
    typeof room.timerPausedLeftMs === 'number' && room.timerPausedLeftMs >= 0
      ? room.timerPausedLeftMs
      : room.roundDurationMs
  room.timerPaused = false
  room.timerPausedLeftMs = undefined
  room.roundDurationMs =
    Number.isFinite(room.roundDurationMs) && room.roundDurationMs > 0
      ? room.roundDurationMs
      : ROUND_MS
  room.roundDeadlineAt = now + left
  room.roundStartedAt = now - (room.roundDurationMs - left)
  return room
}

/** Vue client : masque les bonnes réponses tant que la manche n’est pas close */
export function publicRoomView(
  room: RoomState,
  opts?: { revealAnswers?: boolean },
): Omit<RoomState, 'questions'> & {
  questions: Array<{
    id: string
    question: string
    answers: [string, string, string, string]
    correctIndex?: 0 | 1 | 2 | 3
    explanation?: string
    sourceType?: string
    imageUrl?: string
    previewUrl?: string
    coverUrl?: string
    revealAnswer?: string
    answerMode?: 'qcm' | 'free'
    freeInputHint?: 'title' | 'title_or_artist'
  }>
  roundEndsAt: number
  /** Horloge serveur au moment de la réponse — pour corriger le skew client */
  serverNow: number
  answeredCount: number
  allAnswered: boolean
  storage: 'redis' | 'memory'
} {
  const now = Date.now()
  const revealAll = Boolean(opts?.revealAnswers) || room.status === 'finished'
  const revealingCurrent =
    room.status === 'playing' && room.roundPhase === 'reveal'
  const answeredCount = Object.keys(room.currentAnswers).length
  const allAnswered =
    room.players.length > 0 && answeredCount >= room.players.length

  const duration =
    Number.isFinite(room.roundDurationMs) && room.roundDurationMs > 0
      ? room.roundDurationMs
      : ROUND_MS

  let deadline =
    typeof room.roundDeadlineAt === 'number' && room.roundDeadlineAt > 0
      ? room.roundDeadlineAt
      : room.roundPhase === 'answering' &&
          room.timerEnabled !== false &&
          room.roundStartedAt > 0 &&
          !room.timerPaused
        ? room.roundStartedAt + duration
        : 0

  const timerOff =
    room.timerEnabled === false ||
    room.roundPhase === 'reveal' ||
    room.roundPhase === 'waiting' ||
    room.timerPaused ||
    !(deadline > 0)

  const roundEndsAt = timerOff ? now + 365 * 24 * 60 * 60 * 1000 : deadline

  return {
    ...(({ genCollectedQuestions: _omit, ...safe }) => safe)(room),
    quizMode:
      room.quizMode === 'audio' || /^deezer\b/i.test(String(room.theme ?? '').trim())
        ? 'audio'
        : 'standard',
    audioAutoplay:
      room.quizMode === 'audio' || /^deezer\b/i.test(String(room.theme ?? '').trim())
        ? room.audioAutoplay !== false
        : false,
    timerStarted: Boolean(room.timerStarted),
    timerPaused: Boolean(room.timerPaused),
    roundDurationMs: duration,
    roundDeadlineAt: deadline,
    needsTopUp: Boolean(room.needsTopUp),
    questions: room.questions.map((q, i) => {
      const show =
        revealAll ||
        (room.status === 'playing' && i < room.questionIndex) ||
        (revealingCurrent && i === room.questionIndex)
      return {
        id: q.id,
        question: q.question,
        answers: q.answers,
        // Audio / pochette toujours visibles (sinon le quiz musical est injouable)
        previewUrl: q.previewUrl,
        coverUrl: q.coverUrl,
        imageUrl: undefined,
        answerMode: q.answerMode === 'free' ? 'free' : 'qcm',
        freeInputHint:
          q.freeInputHint === 'title' ? 'title' : 'title_or_artist',
        ...(show
          ? {
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              sourceType: q.sourceType,
              revealAnswer: q.revealAnswer,
            }
          : {}),
      }
    }),
    roundEndsAt,
    serverNow: now,
    answeredCount,
    allAnswered,
    storage: redisConfigured() ? 'redis' : 'memory',
  }
}

/**
 * Si chrono écoulé ou tout le monde a répondu → score + phase reveal.
 * Ne s’applique qu’en phase answering (pas pendant waiting).
 */
export function maybeCloseRound(
  room: RoomState,
  now = Date.now(),
): { room: RoomState; changed: boolean } {
  if (room.status !== 'playing') return { room, changed: false }
  if (room.roundPhase !== 'answering') return { room, changed: false }
  if (room.questions.length === 0) return { room, changed: false }

  const q = room.questions[room.questionIndex]
  if (!q) {
    finalizeScores(room)
    room.status = 'finished'
    void import('./calibStats.js').then((m) => m.recordCalibHandsFromRoom(room))
    return { room, changed: true }
  }

  const timerOn = room.timerEnabled !== false
  const duration =
    Number.isFinite(room.roundDurationMs) && room.roundDurationMs > 0
      ? room.roundDurationMs
      : ROUND_MS
  const deadline =
    typeof room.roundDeadlineAt === 'number' && room.roundDeadlineAt > 0
      ? room.roundDeadlineAt
      : room.roundStartedAt > 0
        ? room.roundStartedAt + duration
        : 0
  const timeUp =
    timerOn && !room.timerPaused && deadline > 0 && now >= deadline
  const allAnswered =
    room.players.length > 0 &&
    room.players.every((p) => p.id in room.currentAnswers)

  if (!timeUp && !allAnswered) return { room, changed: false }

  for (const p of room.players) {
    const ans = room.currentAnswers[p.id]
    const correct = typeof ans === 'number' && ans === q.correctIndex
    if (correct) {
      p.score += 1
      p.streakActuelle = (p.streakActuelle ?? 0) + 1
      p.meilleurStreak = Math.max(p.meilleurStreak ?? 0, p.streakActuelle)
    } else {
      p.streakActuelle = 0
    }
  }

  room.timerPaused = false
  room.timerPausedLeftMs = undefined
  room.roundDeadlineAt = 0
  room.roundPhase = 'reveal'
  return { room, changed: true }
}

/** Hôte : quitte le feedback et passe à la question suivante (ou fin). */
export function hostNextQuestion(room: RoomState, now = Date.now()): RoomState {
  if (room.status !== 'playing') return room
  if (room.roundPhase !== 'reveal') return room

  const next = room.questionIndex + 1
  if (next >= room.questions.length) {
    finalizeScores(room)
    room.status = 'finished'
    room.questionIndex = next
    room.currentAnswers = {}
    room.roundPhase = 'answering'
    room.roundDeadlineAt = 0
    void import('./calibStats.js').then((m) => m.recordCalibHandsFromRoom(room))
    return room
  }

  room.questionIndex = next
  prepareRound(room, now)
  return room
}

/**
 * Ferme la manche si besoin, sans écraser un `next` concurrent.
 * Guérit aussi les salles bloquées en `generating` (timeout plateforme).
 */
export async function syncRoomRound(code: string): Promise<RoomState | null> {
  const room = await getRoom(code)
  if (!room) return null

  if (room.status === 'generating') {
    const started = room.generatingStartedAt ?? room.updatedAt
    const heartbeat =
      room.generatingHeartbeatAt ?? room.generatingStartedAt ?? room.updatedAt
    const now = Date.now()
    const orphan =
      typeof heartbeat === 'number' &&
      heartbeat > 0 &&
      now - heartbeat > GENERATING_STALE_MS
    const absolute =
      typeof started === 'number' &&
      started > 0 &&
      now - started > GENERATING_ABSOLUTE_MAX_MS
    if (orphan || absolute) {
      room.status = 'error'
      room.errorMessage = absolute
        ? 'La génération a pris trop de temps. Réessaie.'
        : 'La génération a expiré (délai serveur). Réessaie.'
      clearGeneratingFields(room)
      await saveRoom(room)
      void forceReleaseGenLock(code)
      void import('./errorLog.js').then((m) =>
        m.logError({
          scope: 'room',
          message: room.errorMessage!,
          theme: room.theme,
          detail: `salle ${code}`,
          path: 'syncRoomRound',
        }),
      )
      return room
    }
  }

  const idx = room.questionIndex
  const phase = room.roundPhase
  const { room: closed, changed } = maybeCloseRound(room)

  if (!changed) {
    await touchRoom(code)
    return closed
  }

  const latest = await getRoom(code)
  if (
    !latest ||
    latest.questionIndex !== idx ||
    latest.roundPhase !== phase ||
    latest.status !== 'playing'
  ) {
    if (latest) await touchRoom(code)
    return latest ?? closed
  }

  await saveRoom(closed)
  return closed
}

/** @deprecated */
export function maybeAdvanceRoom(room: RoomState, now = Date.now()): RoomState {
  return maybeCloseRound(room, now).room
}
