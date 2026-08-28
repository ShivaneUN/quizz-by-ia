import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generateQuestions, normalizeThemeSlug, parseAiProvider, parseQuizContentMode } from '../server/generate.js'
import {
  getPartialQuestions,
  syncPartialQuestionCache,
  type PartialCachedQuestion,
} from '../server/partialQuestionCache.js'
import { matchesFreeMusicAnswer } from '../server/freeAnswer.js'
import {
  ROUND_MS,
  MULTI_QUESTION_COUNT,
  getRoom,
  saveRoom,
  deleteRoom,
  makeRoomCode,
  newPlayerId,
  publicRoomView,
  maybeCloseRound,
  hostNextQuestion,
  syncRoomRound,
  prepareRound,
  hostBeginRound,
  hostPauseTimer,
  hostResumeTimer,
  resetPlayersForNewGame,
  clearGeneratingFields,
  tryAcquireGenLock,
  releaseGenLock,
  forceReleaseGenLock,
  type RoomState,
  type RoomQuestion,
} from '../server/rooms.js'
import {
  getSeenQuestionKeys,
  getSeenQuestionTexts,
  pickUnseenPreferring,
  rememberQuestionKeys,
} from '../server/questionHistory.js'
import {
  getGenerationEstimateSec,
  recordGenerationMs,
} from '../server/genStats.js'
import { logError } from '../server/errorLog.js'

export const config = {
  maxDuration: 60,
}

function parseScope(raw: unknown): 'fr' | 'international' {
  return raw === 'international' ? 'international' : 'fr'
}

function parseDifficulty(raw: unknown): 'easy' | 'medium' | 'hard' {
  return raw === 'medium' || raw === 'hard' ? raw : 'easy'
}

function parsePlayMode(raw: unknown): 'progression' | 'free' {
  return raw === 'progression' ? 'progression' : 'free'
}

/** Thème créé via l’UI Deezer (ex. « Deezer — Hits (global) »). */
function isDeezerTheme(theme: string): boolean {
  return /^deezer\b/i.test(String(theme ?? '').trim())
}

/** Mode contenu salle : audio si flag ou thème Deezer (filet de sécu). */
function resolveRoomContentMode(
  room: Pick<RoomState, 'quizMode' | 'theme'>,
): 'audio' | 'standard' {
  if (room.quizMode === 'audio' || isDeezerTheme(room.theme)) return 'audio'
  return 'standard'
}

/** Empreinte multi : texte seul (IA) ; piste unique (Deezer — prompts répétés). */
function roomQuestionFingerprint(
  q: {
    question: string
    answers?: [string, string, string, string] | string[]
    correctIndex?: number
    deezerTrackId?: string
    previewUrl?: string
    revealAnswer?: string
  },
  mode: 'audio' | 'standard',
): string {
  const base = q.question.trim().toLowerCase().replace(/\s+/g, ' ')
  if (mode !== 'audio') return base
  const ans =
    typeof q.correctIndex === 'number' && Array.isArray(q.answers)
      ? String(q.answers[q.correctIndex] ?? '')
      : ''
  const id =
    String(q.deezerTrackId ?? '').trim() ||
    String(q.previewUrl ?? '').trim() ||
    String(q.revealAnswer ?? '').trim() ||
    ans
  return `${base}|${ans.trim().toLowerCase()}|${id.toLowerCase()}`
}

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  return res.json(body)
}

/**
 * POST /api/room
 * actions: create | join | start | runGenerate | begin | pause | resume | answer | next | leave | kick | state | setTheme | setTimer | setDifficulty | setPlayMode | close | typingScore | cancelGenerate | backToLobby
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }

  try {
    if (req.method === 'GET') {
      const code = String(req.query.code ?? '')
      if (!code) return json(res, 400, { error: 'code requis' })
      const room = await syncRoomRound(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' })
    }

    const body = req.body ?? {}
    const action = String(body.action ?? '')

    if (action === 'create') {
      const hostName = String(body.playerName ?? '').trim()
      if (hostName.length < 2) {
        return json(res, 400, { error: 'Pseudo obligatoire (2 caractères min.)' })
      }
      const theme = String(body.theme ?? '').trim()
      const scope = parseScope(body.scope)
      if (!theme) return json(res, 400, { error: 'thème requis' })

      const timerEnabled = Boolean(body.timerEnabled)
      const playMode = parsePlayMode(body.playMode)
      const difficulty =
        playMode === 'progression' ? 'easy' : parseDifficulty(body.difficulty)
      const aiProvider = parseAiProvider(body.aiProvider)
      const quizModeRaw = parseQuizContentMode(body.quizMode)
      const quizMode =
        quizModeRaw === 'audio' || isDeezerTheme(theme) ? 'audio' : 'standard'
      const audioAutoplay =
        quizMode === 'audio' ? body.audioAutoplay !== false : false
      const hostId = newPlayerId()
      let code = makeRoomCode()
      for (let i = 0; i < 5; i++) {
        if (!(await getRoom(code))) break
        code = makeRoomCode()
      }

      const now = Date.now()
      const room: RoomState = {
        code,
        hostId,
        status: 'lobby',
        theme,
        scope,
        timerEnabled,
        playMode,
        difficulty,
        aiProvider,
        quizMode,
        audioAutoplay,
        players: [
          {
            id: hostId,
            name: hostName.slice(0, 24),
            score: 0,
            streakActuelle: 0,
            meilleurStreak: 0,
            bonusApplique: 0,
            typingScore: 0,
            joinedAt: now,
          },
        ],
        questions: [],
        questionIndex: 0,
        roundPhase: 'answering',
        roundStartedAt: 0,
        roundDurationMs: ROUND_MS,
        timerStarted: false,
        timerPaused: false,
        currentAnswers: {},
        createdAt: now,
        updatedAt: now,
      }
      await saveRoom(room)
      return json(res, 200, {
        playerId: hostId,
        room: publicRoomView(room),
      })
    }

    if (action === 'join') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerName = String(body.playerName ?? '').trim()
      if (playerName.length < 2) {
        return json(res, 400, { error: 'Pseudo obligatoire (2 caractères min.)' })
      }
      if (!code) return json(res, 400, { error: 'code requis' })

      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      // Lobby, génération, partie en cours ou finished — le code suffit
      if (room.players.length >= 8) {
        return json(res, 400, { error: 'Salle pleine (max 8)' })
      }

      // Même nom déjà dans la salle → réutilise l’id (reconnexion simple)
      const existing = room.players.find(
        (p) => p.name.toLowerCase() === playerName.slice(0, 24).toLowerCase(),
      )
      if (existing) {
        return json(res, 200, {
          playerId: existing.id,
          room: publicRoomView(room),
        })
      }

      const playerId = newPlayerId()
      room.players.push({
        id: playerId,
        name: playerName.slice(0, 24),
        // Rejoint en cours : score à 0 (questions déjà passées non comptées)
        score: 0,
        streakActuelle: 0,
        meilleurStreak: 0,
        bonusApplique: 0,
        typingScore: 0,
        joinedAt: Date.now(),
      })
      await saveRoom(room)
      return json(res, 200, {
        playerId,
        room: publicRoomView(room),
      })
    }

    if (action === 'start') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut démarrer' })
      }
      if (room.status === 'playing') {
        return json(res, 400, { error: 'Partie déjà en cours' })
      }
      if (room.status === 'generating') {
        return json(res, 200, { room: publicRoomView(room) })
      }
      if (room.players.length < 1) {
        return json(res, 400, { error: 'Pas assez de joueurs' })
      }

      // Marque « generating » tout de suite et rend la main (évite 504 client)
      room.status = 'generating'
      delete room.hostPickingTheme
      // Deezer si flag audio OU thème Deezer (évite une gen IA texte par erreur)
      room.quizMode =
        resolveRoomContentMode(room) === 'audio' ? 'audio' : 'standard'
      room.timerStarted = false
      room.timerPaused = false
      room.timerPausedLeftMs = undefined
      room.roundDeadlineAt = 0
      delete room.errorMessage
      room.questions = []
      room.questionIndex = 0
      room.roundPhase = 'answering'
      room.currentAnswers = {}
      room.roundStartedAt = 0
      clearGeneratingFields(room)
      room.genQuestionsDone = 0
      room.genQuestionsTotal = 10
      const genStart = Date.now()
      room.generatingStartedAt = genStart
      room.generatingHeartbeatAt = genStart
      resetPlayersForNewGame(room)
      const eta = await getGenerationEstimateSec('multi')
      room.genEstimateSec = eta.estimateSec
      const startProvider = parseAiProvider(room.aiProvider)
      if (startProvider !== 'auto') room.genAiSource = startProvider
      await saveRoom(room)
      await forceReleaseGenLock(code)
      return json(res, 200, {
        room: publicRoomView(room),
        message: 'Génération démarrée',
      })
    }

    if (action === 'runGenerate') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut générer' })
      }
      if (room.status === 'playing') {
        return json(res, 200, { room: publicRoomView(room) })
      }
      if (room.status !== 'generating') {
        return json(res, 400, {
          error: 'Aucune génération en cours — démarre d’abord la partie',
        })
      }

      const lock = await tryAcquireGenLock(code)
      if (!lock.acquired) {
        room = (await getRoom(code)) ?? room
        return json(res, 200, {
          room: publicRoomView(room),
          message: 'Génération déjà en cours',
        })
      }

      try {
        room = (await getRoom(code)) ?? room
        if (room.status !== 'generating') {
          return json(res, 200, { room: publicRoomView(room) })
        }

        room.needsTopUp = false
        room.generatingHeartbeatAt = Date.now()
        await saveRoom(room)

        const contentMode = resolveRoomContentMode(room)
        room.quizMode = contentMode
        const themeSlug =
          contentMode === 'audio'
            ? `${normalizeThemeSlug(room.theme)}--${room.scope}--audio`
            : `${normalizeThemeSlug(room.theme)}--${room.scope}`
        const difficulty = parseDifficulty(room.difficulty)
        const provider = parseAiProvider(room.aiProvider ?? 'auto')

        const collected: RoomQuestion[] = [
          ...(room.genCollectedQuestions ?? []),
        ]
        const collectedFp = new Set(
          collected.map((q) => roomQuestionFingerprint(q, contentMode)),
        )

        function toCachedQuestion(q: RoomQuestion): PartialCachedQuestion {
          return {
            id: q.id,
            question: q.question,
            answers: q.answers,
            correctIndex: q.correctIndex,
            difficulty,
            themeSlug,
            createdAt: new Date().toISOString(),
            batchId: 'partial-cache',
            explanation: q.explanation,
            sourceType: q.sourceType,
            previewUrl: q.previewUrl,
            coverUrl: q.coverUrl,
            deezerTrackId: q.deezerTrackId,
            revealAnswer: q.revealAnswer,
            answerMode: q.answerMode,
            acceptedAnswers: q.acceptedAnswers,
            freeInputHint: q.freeInputHint,
          }
        }

        async function persistCollectedCache(): Promise<void> {
          await syncPartialQuestionCache(
            themeSlug,
            difficulty,
            collected.map(toCachedQuestion),
          )
        }

        function ingestGenerated(
          qs: Array<{
            id: string
            question: string
            answers: [string, string, string, string]
            correctIndex: 0 | 1 | 2 | 3
            explanation?: string
            sourceType?: string
            previewUrl?: string
            coverUrl?: string
            deezerTrackId?: string
            revealAnswer?: string
            answerMode?: 'qcm' | 'free'
            acceptedAnswers?: string[]
            freeInputHint?: 'title' | 'title_or_artist'
            difficulty?: string
          }>,
        ): void {
          for (const q of qs) {
            if (q.difficulty && q.difficulty !== difficulty) continue
            const fp = roomQuestionFingerprint(q, contentMode)
            if (!fp || collectedFp.has(fp)) continue
            collectedFp.add(fp)
            collected.push({
              id: q.id,
              question: q.question,
              answers: q.answers,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              sourceType: q.sourceType,
              previewUrl: q.previewUrl,
              coverUrl: q.coverUrl,
              deezerTrackId: q.deezerTrackId,
              revealAnswer: q.revealAnswer,
              answerMode: q.answerMode,
              acceptedAnswers: q.acceptedAnswers,
              freeInputHint: q.freeInputHint,
            })
            if (collected.length >= MULTI_QUESTION_COUNT) break
          }
        }

        if (collected.length === 0) {
          const cached = await getPartialQuestions(themeSlug, difficulty)
          ingestGenerated(cached)
        }

        async function finalizePlaying(pool: RoomQuestion[]): Promise<boolean> {
          if (!room) return false
          const seen = await getSeenQuestionKeys(themeSlug)
          const selected = pickUnseenPreferring(
            pool,
            seen,
            MULTI_QUESTION_COUNT,
            (q) => roomQuestionFingerprint(q, contentMode),
          )
          const questions = selected.slice(0, MULTI_QUESTION_COUNT)
          if (questions.length < MULTI_QUESTION_COUNT) {
            room.needsTopUp = true
            room.genCollectedQuestions = pool
            room.genQuestionsDone = pool.length
            room.genQuestionsTotal = MULTI_QUESTION_COUNT
            await saveRoom(room)
            await syncPartialQuestionCache(
              themeSlug,
              difficulty,
              pool.map(toCachedQuestion),
            )
            return false
          }
          await rememberQuestionKeys(
            themeSlug,
            questions.map((q) =>
              contentMode === 'audio'
                ? roomQuestionFingerprint(q, 'audio')
                : q.question,
            ),
          )
          await syncPartialQuestionCache(themeSlug, difficulty, questions.map(toCachedQuestion))
          const now = Date.now()
          room.status = 'playing'
          delete room.errorMessage
          clearGeneratingFields(room)
          room.questions = questions
          room.questionIndex = 0
          prepareRound(room, now)
          await saveRoom(room)
          return true
        }

        if (collected.length >= MULTI_QUESTION_COUNT) {
          const ok = await finalizePlaying(collected)
          if (ok) {
            return json(res, 200, {
              room: publicRoomView(room),
              message: 'Questions prêtes',
            })
          }
          return json(res, 200, {
            room: publicRoomView(room),
            message: `Lot partiel (${collected.length}/10) — complément…`,
          })
        }

        const genStarted = Date.now()
        let lastProgDone = -1
        const stickyRaw = room.genAiSource
        const stickyEngine =
          stickyRaw === 'gemini' ||
          stickyRaw === 'groq' ||
          stickyRaw === 'openrouter'
            ? stickyRaw
            : undefined

        async function bumpProgress(
          done: number,
          total: number,
          engine?: string,
        ): Promise<void> {
          if (done === lastProgDone && !engine) return
          lastProgDone = done
          const latest = await getRoom(code)
          if (!latest || latest.status !== 'generating') return
          latest.genQuestionsDone = Math.min(
            MULTI_QUESTION_COUNT,
            Math.max(collected.length, done),
          )
          latest.genQuestionsTotal = total
          latest.generatingHeartbeatAt = Date.now()
          if (engine) latest.genAiSource = engine
          await saveRoom(latest)
        }

        function resolveSticky(
          raw: string | undefined,
        ): 'gemini' | 'groq' | 'openrouter' | undefined {
          return raw === 'gemini' || raw === 'groq' || raw === 'openrouter'
            ? raw
            : undefined
        }

        async function callGenerate(
          sticky?: 'gemini' | 'groq' | 'openrouter',
        ) {
          const histExclude =
            contentMode === 'audio'
              ? []
              : await getSeenQuestionTexts(themeSlug)
          const excludeQuestions =
            contentMode === 'audio'
              ? collected.map((q) => roomQuestionFingerprint(q, 'audio'))
              : [...histExclude, ...collected.map((q) => q.question)]
          const seed = collected.map(toCachedQuestion)
          return generateQuestions(
            room!.theme,
            themeSlug,
            'complementary',
            difficulty,
            room!.scope,
            provider,
            contentMode,
            excludeQuestions,
            (done, total, engine) => bumpProgress(done, total, engine),
            true,
            sticky,
            seed,
          )
        }

        let gen: Awaited<ReturnType<typeof generateQuestions>>
        try {
          gen = await callGenerate(stickyEngine)
          // Solo-like : 1 retry si 0 question « pas assez valides »
          if (
            (gen.questions?.length ?? 0) === 0 &&
            /pas assez de questions valides/i.test(gen.error ?? '')
          ) {
            room = (await getRoom(code)) ?? room
            if (room.status === 'generating') {
              room.generatingHeartbeatAt = Date.now()
              await saveRoom(room)
              gen = await callGenerate(
                stickyEngine ?? resolveSticky(room.genAiSource),
              )
            }
          }
        } catch (e) {
          const message =
            e instanceof Error ? e.message : 'Erreur de génération'
          const latest = (await getRoom(code)) ?? room
          if (latest.status !== 'generating') {
            return json(res, 200, { room: publicRoomView(latest) })
          }
          if (collected.length > 0) {
            latest.genCollectedQuestions = collected
            latest.genQuestionsDone = collected.length
            latest.genQuestionsTotal = MULTI_QUESTION_COUNT
            latest.generatingHeartbeatAt = Date.now()
            latest.needsTopUp = true
            await saveRoom(latest)
            await persistCollectedCache()
            return json(res, 200, {
              room: publicRoomView(latest),
              message: `Lot partiel (${collected.length}/10) — complément…`,
            })
          }
          latest.status = 'error'
          latest.errorMessage = message
          clearGeneratingFields(latest)
          await saveRoom(latest)
          logError({
            scope: 'room',
            message,
            status: 422,
            theme: latest.theme,
            detail: `salle ${code}`,
            path: '/api/room',
            instead: 'Salle en status error — joueurs voient le message',
          })
          return json(res, 422, {
            error: message,
            room: publicRoomView(latest),
          })
        }

        const generationMs = Date.now() - genStarted
        if (!gen.error || gen.partial) {
          await recordGenerationMs(generationMs)
        }

        ingestGenerated(gen.questions ?? [])

        room = (await getRoom(code)) ?? room
        if (room.status !== 'generating') {
          return json(res, 200, { room: publicRoomView(room) })
        }

        room.genCollectedQuestions = collected
        room.genQuestionsDone = collected.length
        room.genQuestionsTotal = MULTI_QUESTION_COUNT
        room.generatingHeartbeatAt = Date.now()
        if (gen.source && gen.source !== 'mock' && gen.source !== 'deezer') {
          room.genAiSource = gen.source
        }

        if (collected.length === 0) {
          const err =
            gen.error ??
            `Pas assez de questions (0/${MULTI_QUESTION_COUNT}). Réessaie.`
          room.status = 'error'
          room.errorMessage = err
          clearGeneratingFields(room)
          await saveRoom(room)
          logError({
            scope: 'room',
            message: err,
            status: 422,
            theme: room.theme,
            detail: `salle ${code}`,
            path: '/api/room',
            instead: 'Salle en status error — 0 question générée',
          })
          return json(res, 422, {
            error: err,
            room: publicRoomView(room),
          })
        }

        if (collected.length < MULTI_QUESTION_COUNT) {
          room.needsTopUp = true
          await saveRoom(room)
          await persistCollectedCache()
          return json(res, 200, {
            room: publicRoomView(room),
            message: `Lot partiel (${collected.length}/10) — complément…`,
          })
        }

        const ok = await finalizePlaying(collected)
        if (!ok) {
          return json(res, 200, {
            room: publicRoomView(room),
            message: `Lot partiel (${collected.length}/10) — complément…`,
          })
        }
        return json(res, 200, {
          room: publicRoomView(room),
          message: gen.message,
        })
      } finally {
        await releaseGenLock(code, lock.token)
      }
    }

    if (action === 'setTheme') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const theme = String(body.theme ?? '').trim()
      const scope = parseScope(body.scope)
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut changer le thème' })
      }
      if (room.status === 'playing' || room.status === 'generating') {
        return json(res, 400, { error: 'Impossible pendant une partie' })
      }
      if (!theme) return json(res, 400, { error: 'thème requis' })

      room.theme = theme
      room.scope = scope
      if (body.aiProvider !== undefined) {
        room.aiProvider = parseAiProvider(body.aiProvider)
      }
      if (body.quizMode !== undefined) {
        const qm = parseQuizContentMode(body.quizMode)
        room.quizMode = qm === 'audio' ? 'audio' : 'standard'
      }
      // Filet : thème Deezer → toujours mode audio (jamais gen texte IA)
      if (isDeezerTheme(theme)) room.quizMode = 'audio'
      else if (room.quizMode !== 'audio') room.quizMode = 'standard'
      if (body.audioAutoplay !== undefined) {
        room.audioAutoplay =
          room.quizMode === 'audio' ? Boolean(body.audioAutoplay) : false
      } else if (room.quizMode !== 'audio') {
        room.audioAutoplay = false
      } else if (typeof room.audioAutoplay !== 'boolean') {
        room.audioAutoplay = true
      }
      delete room.errorMessage
      delete room.hostPickingTheme
      room.status = 'lobby'
      room.timerStarted = false
      room.timerPaused = false
      room.timerPausedLeftMs = undefined
      room.questions = []
      room.questionIndex = 0
      room.roundPhase = 'answering'
      room.currentAnswers = {}
      room.roundStartedAt = 0
      room.players = room.players.map((p) => ({
        ...p,
        score: 0,
        streakActuelle: 0,
        meilleurStreak: 0,
        bonusApplique: 0,
        typingScore: 0,
      }))
      room.scoresFinalized = false
      await saveRoom(room)
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'cancelGenerate') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut annuler' })
      }
      if (room.status !== 'generating') {
        return json(res, 200, { room: publicRoomView(room) })
      }
      room.status = 'lobby'
      delete room.errorMessage
      clearGeneratingFields(room)
      room.questions = []
      room.questionIndex = 0
      room.currentAnswers = {}
      room.timerStarted = false
      room.timerPaused = false
      room.timerPausedLeftMs = undefined
      room.roundStartedAt = 0
      room.roundDeadlineAt = 0
      await saveRoom(room)
      await forceReleaseGenLock(code)
      return json(res, 200, {
        room: publicRoomView(room),
        message: 'Génération annulée',
      })
    }

    if (action === 'backToLobby') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const pickingTheme = Boolean(body.pickingTheme)
      const room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut revenir au lobby' })
      }
      // Pendant la génération : utiliser cancelGenerate
      if (room.status === 'generating') {
        return json(res, 400, { error: 'Annule d’abord la génération' })
      }
      room.status = 'lobby'
      delete room.errorMessage
      clearGeneratingFields(room)
      room.questions = []
      room.questionIndex = 0
      room.roundPhase = 'answering'
      room.currentAnswers = {}
      room.timerStarted = false
      room.timerPaused = false
      room.timerPausedLeftMs = undefined
      room.roundStartedAt = 0
      room.roundDeadlineAt = 0
      room.players = room.players.map((p) => ({
        ...p,
        score: 0,
        streakActuelle: 0,
        meilleurStreak: 0,
        bonusApplique: 0,
        typingScore: 0,
      }))
      room.scoresFinalized = false
      if (pickingTheme) room.hostPickingTheme = true
      else delete room.hostPickingTheme
      await saveRoom(room)
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'close') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut fermer la salle' })
      }
      await deleteRoom(code)
      return json(res, 200, { closed: true, code })
    }

    if (action === 'leave') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      let room = await getRoom(code)
      if (!room) {
        // Salle déjà fermée — le client peut quand même « quitter »
        return json(res, 200, { left: true, closed: true, code })
      }

      const idx = room.players.findIndex((p) => p.id === playerId)
      if (idx === -1) {
        return json(res, 200, {
          left: true,
          room: publicRoomView(room),
        })
      }

      const wasHost = room.hostId === playerId
      room.players.splice(idx, 1)
      if (playerId in room.currentAnswers) {
        delete room.currentAnswers[playerId]
      }

      if (room.players.length === 0) {
        await deleteRoom(code)
        return json(res, 200, { left: true, closed: true, code })
      }

      // L’hôte part seul → transfert d’hôte, les autres restent
      if (wasHost) {
        room.hostId = room.players[0]!.id
        delete room.hostPickingTheme
        if (room.status === 'generating') {
          room.status = 'lobby'
          clearGeneratingFields(room)
          delete room.errorMessage
          void forceReleaseGenLock(code)
        }
      }

      // Les autres continuent : si tout le monde restant a répondu → reveal
      if (room.status === 'playing' && room.roundPhase === 'answering') {
        const closed = maybeCloseRound(room)
        room = closed.room
      }

      await saveRoom(room)
      return json(res, 200, {
        left: true,
        closed: false,
        hostTransferred: wasHost,
        room: publicRoomView(room),
      })
    }

    if (action === 'kick') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const targetPlayerId = String(body.targetPlayerId ?? '')
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut éjecter' })
      }
      if (!targetPlayerId || targetPlayerId === playerId) {
        return json(res, 400, { error: 'Impossible d’éjecter ce joueur' })
      }

      const idx = room.players.findIndex((p) => p.id === targetPlayerId)
      if (idx === -1) {
        return json(res, 200, { room: publicRoomView(room) })
      }

      room.players.splice(idx, 1)
      if (targetPlayerId in room.currentAnswers) {
        delete room.currentAnswers[targetPlayerId]
      }

      if (room.status === 'playing' && room.roundPhase === 'answering') {
        const closed = maybeCloseRound(room)
        room = closed.room
      }

      await saveRoom(room)
      return json(res, 200, {
        kicked: true,
        room: publicRoomView(room),
      })
    }

    if (action === 'answer') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const answerText =
        typeof body.answerText === 'string' ? body.answerText : ''
      const hasText = answerText.trim().length > 0
      const answerIndex = Number(body.answerIndex)
      let room = await syncRoomRound(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })

      if (room.status !== 'playing') {
        return json(res, 200, { room: publicRoomView(room) })
      }
      if (room.roundPhase === 'reveal' || room.roundPhase === 'waiting') {
        return json(res, 200, { room: publicRoomView(room) })
      }

      const player = room.players.find((p) => p.id === playerId)
      if (!player) return json(res, 403, { error: 'Joueur inconnu' })
      if (playerId in room.currentAnswers) {
        return json(res, 200, { room: publicRoomView(room) })
      }

      const currentQ = room.questions[room.questionIndex]
      const isFree = currentQ?.answerMode === 'free'

      let storedAnswer: number
      if (isFree) {
        if (!hasText) {
          return json(res, 400, { error: 'Réponse invalide' })
        }
        const ok = matchesFreeMusicAnswer(
          answerText,
          currentQ.acceptedAnswers,
        )
        storedAnswer = ok ? currentQ.correctIndex : -1
      } else {
        if (
          !Number.isInteger(answerIndex) ||
          answerIndex < 0 ||
          answerIndex > 3
        ) {
          return json(res, 400, { error: 'Réponse invalide' })
        }
        storedAnswer = answerIndex
      }

      const now = Date.now()
      const timerOn = room.timerEnabled !== false
      const deadline =
        typeof room.roundDeadlineAt === 'number' && room.roundDeadlineAt > 0
          ? room.roundDeadlineAt
          : room.roundStartedAt > 0
            ? room.roundStartedAt + room.roundDurationMs
            : 0
      if (timerOn && !room.timerPaused && deadline > 0 && now > deadline) {
        room = (await syncRoomRound(code)) ?? room
        return json(res, 200, { room: publicRoomView(room) })
      }

      // Recharge pour fusionner avec d’éventuelles réponses concurrentes
      const fresh = await getRoom(code)
      if (!fresh || fresh.status !== 'playing' || fresh.roundPhase !== 'answering') {
        room = fresh ?? room
        return json(res, 200, { room: publicRoomView(room) })
      }
      if (playerId in fresh.currentAnswers) {
        return json(res, 200, { room: publicRoomView(fresh) })
      }

      fresh.currentAnswers[playerId] = storedAnswer
      const closed = maybeCloseRound(fresh, now)
      if (closed.changed) {
        const latest = await getRoom(code)
        if (
          latest &&
          latest.questionIndex === fresh.questionIndex &&
          latest.roundPhase === 'answering' &&
          latest.status === 'playing'
        ) {
          // Merge answers from latest then close
          latest.currentAnswers = {
            ...latest.currentAnswers,
            ...fresh.currentAnswers,
          }
          const again = maybeCloseRound(latest, now)
          await saveRoom(again.room)
          room = again.room
        } else {
          room = latest ?? closed.room
        }
      } else {
        await saveRoom(closed.room)
        room = closed.room
      }
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'next') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      let room = await syncRoomRound(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut passer à la suite' })
      }
      if (room.status !== 'playing') {
        return json(res, 200, { room: publicRoomView(room) })
      }
      if (room.roundPhase !== 'reveal') {
        return json(res, 400, { error: 'Attends la fin des réponses' })
      }
      room = hostNextQuestion(room)
      await saveRoom(room)
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'begin') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut lancer le chrono' })
      }
      if (room.status !== 'playing') {
        return json(res, 200, { room: publicRoomView(room) })
      }
      // Force le démarrage même si l’état local était incohérent
      room = hostBeginRound(room)
      await saveRoom(room)
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'pause') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut mettre en pause' })
      }
      room = hostPauseTimer(room)
      await saveRoom(room)
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'resume') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut relancer le chrono' })
      }
      room = hostResumeTimer(room)
      await saveRoom(room)
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'setTimer') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const timerEnabled = Boolean(body.timerEnabled)
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut régler le chrono' })
      }
      if (room.status === 'playing' || room.status === 'generating') {
        return json(res, 400, { error: 'Impossible pendant une partie' })
      }
      room.timerEnabled = timerEnabled
      room.roundDurationMs = ROUND_MS
      await saveRoom(room)
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'setDifficulty') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const difficulty = parseDifficulty(body.difficulty)
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut régler la difficulté' })
      }
      if (room.status === 'playing' || room.status === 'generating') {
        return json(res, 400, { error: 'Impossible pendant une partie' })
      }
      // En mode paliers, la difficulté suit la progression (sauf avance explicite hôte)
      room.difficulty = difficulty
      await saveRoom(room)
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'setPlayMode') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const playMode = parsePlayMode(body.playMode)
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut changer le mode' })
      }
      if (room.status === 'playing' || room.status === 'generating') {
        return json(res, 400, { error: 'Impossible pendant une partie' })
      }
      room.playMode = playMode
      if (playMode === 'progression') {
        room.difficulty = 'easy'
      }
      await saveRoom(room)
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'typingScore') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const raw = Number(body.typingScore)
      const typingScore = Number.isFinite(raw)
        ? Math.max(0, Math.min(9999, Math.floor(raw)))
        : 0
      if (!code || !playerId) {
        return json(res, 400, { error: 'code et playerId requis' })
      }
      const room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (room.status !== 'generating' && room.status !== 'playing') {
        return json(res, 200, { room: publicRoomView(room) })
      }
      const player = room.players.find((p) => p.id === playerId)
      if (!player) return json(res, 403, { error: 'Joueur absent de la salle' })
      // Monotone : évite qu’un poll stale écrase un score plus haut
      if ((player.typingScore ?? 0) < typingScore) {
        player.typingScore = typingScore
        room.updatedAt = Date.now()
        await saveRoom(room)
      }
      return json(res, 200, { room: publicRoomView(room) })
    }

    if (action === 'state') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const room = await syncRoomRound(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      return json(res, 200, { room: publicRoomView(room) })
    }

    return json(res, 400, { error: 'action inconnue' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur serveur'
    console.error('[room]', message)
    return json(res, 500, { error: message })
  }
}
