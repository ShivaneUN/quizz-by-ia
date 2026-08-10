import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generateQuestions, normalizeThemeSlug, parseAiProvider, parseQuizContentMode } from '../server/generate.js'
import { fetchCommonsImageUrl } from '../server/wikimedia.js'
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
  type RoomState,
} from '../server/rooms.js'

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

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  return res.json(body)
}

/**
 * POST /api/room
 * actions: create | join | start | answer | next | leave | kick | state | setTheme | setTimer | setDifficulty | setPlayMode | close
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

      const timerEnabled = body.timerEnabled !== false
      const playMode = parsePlayMode(body.playMode)
      const difficulty =
        playMode === 'progression' ? 'easy' : parseDifficulty(body.difficulty)
      const aiProvider = parseAiProvider(body.aiProvider)
      const quizMode = parseQuizContentMode(body.quizMode)
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
        players: [{ id: hostId, name: hostName.slice(0, 24), score: 0, joinedAt: now }],
        questions: [],
        questionIndex: 0,
        roundPhase: 'answering',
        roundStartedAt: 0,
        roundDurationMs: ROUND_MS,
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
      // Lobby, partie en cours ou finished — le code suffit
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
      // Rejouer le même thème : autorisé depuis lobby ou finished
      if (room.status === 'playing') {
        return json(res, 400, { error: 'Partie déjà en cours' })
      }
      if (room.players.length < 1) {
        return json(res, 400, { error: 'Pas assez de joueurs' })
      }

      const quizMode = room.quizMode === 'image' ? 'image' : 'standard'
      const themeSlug =
        quizMode === 'image'
          ? `${normalizeThemeSlug(room.theme)}--${room.scope}--image`
          : `${normalizeThemeSlug(room.theme)}--${room.scope}`
      const difficulty = parseDifficulty(room.difficulty)
      const provider = parseAiProvider(room.aiProvider ?? 'auto')
      const gen = await generateQuestions(
        room.theme,
        themeSlug,
        'complementary',
        difficulty,
        room.scope,
        provider,
        quizMode,
      )
      if (gen.error) {
        return json(res, 422, { error: gen.error })
      }
      // Résoudre les images manquantes (Wikipedia) puis ne garder que celles avec URL
      const withImages = await Promise.all(
        gen.questions
          .filter((q) => q.difficulty === difficulty)
          .map(async (q) => {
            let imageUrl = q.imageUrl
            if (!imageUrl) {
              const sujet = q.imageSubject || q.answers[q.correctIndex]
              if (sujet) {
                imageUrl = await fetchCommonsImageUrl(
                  sujet,
                  q.imageKind ?? 'sujet_entier',
                  q.answers[q.correctIndex],
                )
              }
            }
            if (!imageUrl && quizMode === 'image') return null
            return {
              id: q.id,
              question: q.question,
              answers: q.answers,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              sourceType: q.sourceType,
              imageUrl,
            }
          }),
      )
      const questions = withImages
        .filter((q): q is NonNullable<typeof q> => q !== null)
        .slice(0, MULTI_QUESTION_COUNT)

      if (questions.length < MULTI_QUESTION_COUNT) {
        return json(res, 422, {
          error: `Pas assez de questions illustrées (${questions.length}/${MULTI_QUESTION_COUNT}). Réessaie.`,
        })
      }

      const now = Date.now()
      room.status = 'playing'
      room.questions = questions
      room.questionIndex = 0
      room.roundPhase = 'answering'
      room.currentAnswers = {}
      room.roundStartedAt = now
      room.players = room.players.map((p) => ({ ...p, score: 0 }))
      await saveRoom(room)
      return json(res, 200, {
        room: publicRoomView(room),
        message: gen.message,
      })
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
      if (room.status === 'playing') {
        return json(res, 400, { error: 'Impossible pendant une partie' })
      }
      if (!theme) return json(res, 400, { error: 'thème requis' })

      room.theme = theme
      room.scope = scope
      if (body.aiProvider !== undefined) {
        room.aiProvider = parseAiProvider(body.aiProvider)
      }
      if (body.quizMode !== undefined) {
        room.quizMode = parseQuizContentMode(body.quizMode)
      }
      room.status = 'lobby'
      room.questions = []
      room.questionIndex = 0
      room.roundPhase = 'answering'
      room.currentAnswers = {}
      room.roundStartedAt = 0
      room.players = room.players.map((p) => ({ ...p, score: 0 }))
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

      if (wasHost) {
        const nextHost = [...room.players].sort(
          (a, b) => a.joinedAt - b.joinedAt,
        )[0]
        room.hostId = nextHost.id
      }

      // Les autres continuent : si tout le monde restant a répondu → reveal
      if (room.status === 'playing' && room.roundPhase === 'answering') {
        const closed = maybeCloseRound(room)
        room = closed.room
      }

      await saveRoom(room)
      return json(res, 200, {
        left: true,
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
      const answerIndex = Number(body.answerIndex)
      let room = await syncRoomRound(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })

      if (room.status !== 'playing') {
        return json(res, 200, { room: publicRoomView(room) })
      }
      if (room.roundPhase === 'reveal') {
        return json(res, 200, { room: publicRoomView(room) })
      }

      const player = room.players.find((p) => p.id === playerId)
      if (!player) return json(res, 403, { error: 'Joueur inconnu' })
      if (playerId in room.currentAnswers) {
        return json(res, 200, { room: publicRoomView(room) })
      }
      if (
        !Number.isInteger(answerIndex) ||
        answerIndex < 0 ||
        answerIndex > 3
      ) {
        return json(res, 400, { error: 'Réponse invalide' })
      }

      const now = Date.now()
      const timerOn = room.timerEnabled !== false
      if (
        timerOn &&
        now > room.roundStartedAt + room.roundDurationMs
      ) {
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

      fresh.currentAnswers[playerId] = answerIndex
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

    if (action === 'setTimer') {
      const code = String(body.code ?? '').trim().toUpperCase()
      const playerId = String(body.playerId ?? '')
      const timerEnabled = Boolean(body.timerEnabled)
      let room = await getRoom(code)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      if (playerId !== room.hostId) {
        return json(res, 403, { error: 'Seul l’hôte peut régler le chrono' })
      }
      if (room.status === 'playing') {
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
      if (room.status === 'playing') {
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
      if (room.status === 'playing') {
        return json(res, 400, { error: 'Impossible pendant une partie' })
      }
      room.playMode = playMode
      if (playMode === 'progression') {
        room.difficulty = 'easy'
      }
      await saveRoom(room)
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
