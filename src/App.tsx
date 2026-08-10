import { useCallback, useEffect, useState } from 'react'
import { generateQuestions } from './lib/api'
import { attachImagesToQuestions } from './lib/resolveImage'
import {
  drawUnseen,
  getOrCreatePlayerId,
  loadBank,
  loadHistory,
  markSeen,
  mergeQuestionsIntoBank,
  saveBank,
  saveHistory,
} from './lib/bankStorage'
import { createEmptyTierAttempts, resolveTierOutcome } from './lib/progression'
import { bankSlug, isEphemeralTheme } from './lib/themeSlug'
import {
  answerRoom,
  beginRoomRound,
  closeRoom,
  createRoom,
  joinRoom,
  kickRoomPlayer,
  leaveRoom,
  nextRoomQuestion,
  pauseRoomTimer,
  pollRoom,
  preferNewerRoom,
  resumeRoomTimer,
  setRoomDifficulty,
  setRoomPlayMode,
  setRoomTheme,
  setRoomTimer,
  startRoom,
  type MultiRoom,
} from './lib/multiApi'
import {
  clearMultiSession,
  loadMultiSession,
  saveLastMultiRoom,
  saveMultiSession,
} from './lib/multiSession'
import { AnswerAudit } from './components/AnswerAudit'
import { ModeSelect } from './components/ModeSelect'
import { MultiGate } from './components/MultiGate'
import { MultiLobby } from './components/MultiLobby'
import { MultiPlay } from './components/MultiPlay'
import { MultiScoreboard } from './components/MultiScoreboard'
import { ProgressBar } from './components/ProgressBar'
import { QuizPlay } from './components/QuizPlay'
import { Results } from './components/Results'
import { ThemeSelect, type ThemeStartOptions } from './components/ThemeSelect'
import { TierResult } from './components/TierResult'
import type { AuditEntry } from './types/audit'
import type {
  AiProvider,
  Difficulty,
  GameSession,
  Question,
  QuizScope,
} from './types'
import { DIFFICULTIES, DIFFICULTY_LABELS, PASS_THRESHOLD, QUESTIONS_PER_TIER, QUIZ_SCOPE_LABELS } from './types'
import './App.css'

type Screen =
  | 'mode'
  | 'home'
  | 'loading'
  | 'play'
  | 'tier-result'
  | 'finished'
  | 'multi-gate'
  | 'multi-theme'
  | 'multi-lobby'
  | 'multi-play'
  | 'multi-score'

/** Navigation multi pilotée par le status serveur (tous les clients). */
function multiScreenForStatus(status: MultiRoom['status']): Screen {
  if (status === 'playing') return 'multi-play'
  if (status === 'finished') return 'multi-score'
  return 'multi-lobby'
}

function roomFromError(e: unknown): MultiRoom | null {
  if (e && typeof e === 'object' && 'room' in e) {
    const room = (e as { room?: MultiRoom }).room
    return room ?? null
  }
  return null
}

interface TierSnapshot {
  difficulty: Difficulty
  correct: number
  answered: number
  passed: boolean
  hasNext: boolean
}

const initialSession = (): GameSession => ({
  theme: '',
  themeSlug: '',
  scope: 'fr',
  playerName: '',
  playMode: 'progression',
  timerEnabled: false,
  aiProvider: 'auto',
  quizMode: 'standard',
  currentDifficulty: 'easy',
  unlocked: ['easy'],
  tierAttempts: createEmptyTierAttempts(),
  currentHand: [],
  handIndex: 0,
  totalScore: 0,
  status: 'setup',
})

export default function App() {
  const [screen, setScreen] = useState<Screen>('mode')
  const [session, setSession] = useState<GameSession>(initialSession)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [tierSnapshot, setTierSnapshot] = useState<TierSnapshot | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [pendingScored, setPendingScored] = useState(false)

  // —— Multijoueur ——
  const [multiName, setMultiName] = useState('')
  const [multiPlayerId, setMultiPlayerId] = useState<string | null>(null)
  const [multiRoom, setMultiRoom] = useState<MultiRoom | null>(null)
  const [multiBusy, setMultiBusy] = useState(false)

  // Reconnexion multi après refresh
  useEffect(() => {
    const saved = loadMultiSession()
    if (!saved) return
    let cancelled = false
    ;(async () => {
      try {
        const { room } = await pollRoom(saved.code)
        if (cancelled) return
        if (!room.players.some((p) => p.id === saved.playerId)) {
          clearMultiSession()
          return
        }
        setMultiName(saved.playerName)
        setMultiPlayerId(saved.playerId)
        setMultiRoom(room)
        setScreen(multiScreenForStatus(room.status))
        saveMultiSession({
          code: saved.code,
          playerId: saved.playerId,
          playerName: saved.playerName,
        })
      } catch {
        if (!cancelled) clearMultiSession()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const ensureHand = useCallback(
    async (
      theme: string,
      themeSlug: string,
      difficulty: Difficulty,
      scope: QuizScope,
      provider: AiProvider = 'auto',
      quizMode: 'standard' | 'image' = 'standard',
    ): Promise<{ hand: Question[]; msg?: string } | { error: string }> => {
      const playerId = getOrCreatePlayerId()
      let history = loadHistory(playerId, themeSlug)
      let msg: string | undefined

      async function finalizeImageQs(qs: Question[]): Promise<Question[]> {
        if (quizMode !== 'image') return qs
        return attachImagesToQuestions(qs)
      }

      // Actualité : toujours régénérer, jamais stocker en banque
      if (isEphemeralTheme(theme, themeSlug)) {
        try {
          const gen = await generateQuestions({
            theme,
            mode: 'complementary',
            difficulty,
            scope,
            provider,
            quizMode,
          })
          let hand = await finalizeImageQs(
            gen.questions.filter((q) => q.difficulty === difficulty),
          )
          hand = hand.slice(0, QUESTIONS_PER_TIER)
          if (hand.length < QUESTIONS_PER_TIER) {
            return {
              error: `Impossible de constituer 10 questions illustrées (${hand.length}/10). Réessaie.`,
            }
          }
          history = markSeen(
            history,
            difficulty,
            hand.map((q) => q.id),
          )
          saveHistory(playerId, themeSlug, history)
          return { hand, msg: gen.message }
        } catch (e) {
          return {
            error:
              e instanceof Error
                ? e.message
                : 'Thème non valide ou génération impossible',
          }
        }
      }

      let bank = loadBank(themeSlug)

      if (!bank) {
        try {
          const gen = await generateQuestions({
            theme,
            mode: 'complementary',
            difficulty,
            scope,
            provider,
            quizMode,
          })
          const tierQs = await finalizeImageQs(
            gen.questions.filter((q) => q.difficulty === difficulty),
          )
          bank = {
            meta: {
              theme: gen.theme,
              themeSlug: gen.themeSlug,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              counts: { easy: 0, medium: 0, hard: 0 },
              source: gen.source,
            },
            questions: tierQs,
          }
          for (const q of bank.questions) bank.meta.counts[q.difficulty]++
          saveBank(bank)
          msg =
            gen.message ??
            (gen.source === 'mock' ? 'Mode mock (pas de clé API)' : undefined)
        } catch (e) {
          return {
            error:
              e instanceof Error
                ? e.message
                : 'Thème non valide ou génération impossible',
          }
        }
      }

      let hand = drawUnseen(bank, history, difficulty, QUESTIONS_PER_TIER)
      if (quizMode === 'image') {
        hand = hand.filter((q) => Boolean(q.imageUrl))
      }

      let refillTries = 0
      while (hand.length < QUESTIONS_PER_TIER && refillTries < 3) {
        refillTries++
        try {
          const gen = await generateQuestions({
            theme,
            mode: 'complementary',
            difficulty,
            scope,
            provider,
            quizMode,
          })
          const tierQs = await finalizeImageQs(
            gen.questions.filter((q) => q.difficulty === difficulty),
          )
          bank = mergeQuestionsIntoBank(bank, tierQs)
          bank = {
            ...bank,
            meta: {
              ...bank.meta,
              source: gen.source,
              updatedAt: new Date().toISOString(),
            },
          }
          saveBank(bank)
          msg = gen.message ?? msg
          hand = drawUnseen(bank, history, difficulty, QUESTIONS_PER_TIER)
          if (quizMode === 'image') {
            hand = hand.filter((q) => Boolean(q.imageUrl))
          }
        } catch (e) {
          return {
            error:
              e instanceof Error
                ? e.message
                : 'Thème non valide ou génération impossible',
          }
        }
      }

      if (hand.length < QUESTIONS_PER_TIER) {
        return {
          error:
            quizMode === 'image'
              ? `Impossible de constituer 10 questions illustrées (${hand.length}/10). Réessaie.`
              : `Impossible de constituer 10 questions pour ce palier (${hand.length}/10).`,
        }
      }

      hand = hand.slice(0, QUESTIONS_PER_TIER)
      history = markSeen(
        history,
        difficulty,
        hand.map((q) => q.id),
      )
      saveHistory(playerId, themeSlug, history)

      return { hand, msg }
    },
    [],
  )

  // Poll salle multi
  useEffect(() => {
    if (
      !multiRoom ||
      !multiPlayerId ||
      (screen !== 'multi-lobby' &&
        screen !== 'multi-play' &&
        screen !== 'multi-score' &&
        screen !== 'multi-theme')
    ) {
      return
    }
    // Pendant le choix de thème par l’hôte, on poll seulement pour détecter une fermeture
    let cancelled = false
    const tick = async () => {
      try {
        const { room } = await pollRoom(multiRoom.code)
        if (cancelled) return
        // Éjecté / plus dans la salle → retour (les autres continuent)
        if (!room.players.some((p) => p.id === multiPlayerId)) {
          clearMultiSession()
          setMultiName('')
          setMultiPlayerId(null)
          setMultiRoom(null)
          setMultiBusy(false)
          setError('Tu as été retiré de la salle')
          setScreen('multi-gate')
          return
        }
        setMultiRoom((prev) => preferNewerRoom(prev, room))
        // Pendant le choix de thème, ne pas forcer le lobby
        if (screen === 'multi-theme') return
        const next = multiScreenForStatus(room.status)
        if (next !== screen) setScreen(next)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : ''
        if (msg.toLowerCase().includes('introuvable')) {
          clearMultiSession()
          setMultiName('')
          setMultiPlayerId(null)
          setMultiRoom(null)
          setMultiBusy(false)
          setError('La salle a été fermée')
          setScreen('mode')
        }
      }
    }
    const id = window.setInterval(tick, 500)
    void tick()
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [multiRoom?.code, multiPlayerId, screen])

  async function handleStart(
    theme: string,
    playerName: string,
    scope: QuizScope,
    options: ThemeStartOptions,
  ) {
    setError(null)
    setStatusMsg(null)
    setScreen('loading')

    const themeSlug = bankSlug(theme, scope, options.quizMode)
    const playMode = options.gameMode === 'free' ? 'manual' : 'progression'
    const startDiff: Difficulty =
      playMode === 'manual' ? options.difficulty : 'easy'
    const unlocked: Difficulty[] =
      playMode === 'manual' ? [...DIFFICULTIES] : ['easy']
    const aiProvider = options.aiProvider ?? 'auto'
    const quizMode = 'standard' as const

    const attempts = createEmptyTierAttempts()
    if (playMode === 'manual') {
      for (const d of DIFFICULTIES) {
        attempts[d] = {
          correct: 0,
          answered: 0,
          status: d === startDiff ? 'active' : 'locked',
        }
      }
    }

    const base: GameSession = {
      ...initialSession(),
      theme,
      themeSlug,
      scope,
      playerName,
      playMode,
      timerEnabled: options.timerEnabled,
      aiProvider,
      quizMode,
      currentDifficulty: startDiff,
      unlocked,
      tierAttempts: attempts,
      status: 'loading',
    }

    try {
      setStatusMsg(
        playMode === 'progression'
          ? 'Préparation du palier Facile (10 questions)…'
          : `Préparation du niveau ${startDiff === 'easy' ? 'Facile' : startDiff === 'medium' ? 'Moyen' : 'Difficile'}…`,
      )

      const result = await ensureHand(
        theme,
        themeSlug,
        startDiff,
        scope,
        aiProvider,
        quizMode,
      )
      if ('error' in result) {
        setError(result.error)
        setScreen('home')
        return
      }

      setSession({
        ...base,
        currentHand: result.hand,
        handIndex: 0,
        status: 'playing',
      })
      setAudit([])
      setSelectedIndex(null)
      setPendingScored(false)
      if (result.msg) setStatusMsg(result.msg)
      setScreen('play')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au démarrage')
      setScreen('home')
    }
  }

  function handleAnswer(answerIndex: number) {
    if (selectedIndex !== null || screen !== 'play' || pendingScored) return

    const q = session.currentHand[session.handIndex]
    if (!q) return

    const timedOut = answerIndex < 0
    const correct = !timedOut && answerIndex === q.correctIndex
    setSelectedIndex(timedOut ? -1 : answerIndex)
    setPendingScored(true)

    setAudit((prev) => [
      ...prev,
      {
        questionId: q.id,
        question: q.question,
        answers: q.answers,
        selectedIndex: timedOut ? -1 : answerIndex,
        correctIndex: q.correctIndex,
        correct,
        explanation: q.explanation,
        sourceType: q.sourceType,
      },
    ])

    const tier = { ...session.tierAttempts[session.currentDifficulty] }
    tier.answered += 1
    if (correct) tier.correct += 1

    setSession({
      ...session,
      totalScore: session.totalScore + (correct ? 1 : 0),
      tierAttempts: {
        ...session.tierAttempts,
        [session.currentDifficulty]: tier,
      },
    })
  }

  function handleNextAfterFeedback() {
    if (selectedIndex === null) return

    const nextIndex = session.handIndex + 1
    const handDone = nextIndex >= session.currentHand.length
    const tier = session.tierAttempts[session.currentDifficulty]

    setSelectedIndex(null)
    setPendingScored(false)

    if (!handDone) {
      setSession({ ...session, handIndex: nextIndex })
      return
    }

    if (session.playMode === 'manual') {
      setSession({
        ...session,
        status: 'tier-result',
        tierAttempts: {
          ...session.tierAttempts,
          [session.currentDifficulty]: {
            ...tier,
            status: 'passed',
          },
        },
      })
      setTierSnapshot({
        difficulty: session.currentDifficulty,
        correct: tier.correct,
        answered: tier.answered,
        passed: true,
        hasNext: true,
      })
      setScreen('tier-result')
      return
    }

    const outcome = resolveTierOutcome(
      tier.correct,
      tier.answered,
      session.currentDifficulty,
    )

    setSession({
      ...session,
      unlocked: outcome.unlocked,
      status: 'tier-result',
      tierAttempts: {
        ...session.tierAttempts,
        [session.currentDifficulty]: {
          ...tier,
          status: outcome.passed ? 'passed' : 'failed',
        },
      },
    })
    setTierSnapshot({
      difficulty: session.currentDifficulty,
      correct: tier.correct,
      answered: tier.answered,
      passed: outcome.passed,
      hasNext: outcome.nextDifficulty !== null && outcome.passed,
    })
    setScreen('tier-result')
  }

  async function startSoloHand(nextDiff: Difficulty) {
    setError(null)
    setScreen('loading')
    setStatusMsg('Préparation de la manche…')

    try {
      const result = await ensureHand(
        session.theme,
        session.themeSlug,
        nextDiff,
        session.scope,
        session.aiProvider ?? 'auto',
        session.quizMode ?? 'standard',
      )
      if ('error' in result) {
        setSession((s) => ({
          ...s,
          status: 'finished',
          currentDifficulty: nextDiff,
        }))
        setScreen('finished')
        return
      }

      setSession((s) => ({
        ...s,
        currentDifficulty: nextDiff,
        unlocked:
          s.playMode === 'manual' ? [...DIFFICULTIES] : s.unlocked,
        currentHand: result.hand,
        handIndex: 0,
        status: 'playing',
        tierAttempts: {
          ...s.tierAttempts,
          [nextDiff]: {
            correct: 0,
            answered: 0,
            status: 'active',
          },
        },
      }))
      setAudit([])
      setSelectedIndex(null)
      setPendingScored(false)
      if (result.msg) setStatusMsg(result.msg)
      setTierSnapshot(null)
      setScreen('play')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setScreen('tier-result')
    }
  }

  async function handleTierContinue() {
    if (!tierSnapshot) return
    setError(null)

    const outcome = resolveTierOutcome(
      tierSnapshot.correct,
      tierSnapshot.answered,
      tierSnapshot.difficulty,
    )

    if (outcome.passed && !outcome.nextDifficulty) {
      setSession((s) => ({ ...s, status: 'finished' }))
      setScreen('finished')
      return
    }

    const nextDiff: Difficulty = outcome.passed
      ? (outcome.nextDifficulty as Difficulty)
      : tierSnapshot.difficulty

    setScreen('loading')
    setStatusMsg(
      outcome.passed && outcome.nextDifficulty
        ? `Génération du palier ${DIFFICULTY_LABELS[outcome.nextDifficulty]}…`
        : `Nouvelle manche ${DIFFICULTY_LABELS[nextDiff]}…`,
    )

    try {
      const result = await ensureHand(
        session.theme,
        session.themeSlug,
        nextDiff,
        session.scope,
        session.aiProvider ?? 'auto',
        session.quizMode ?? 'standard',
      )
      if ('error' in result) {
        setSession((s) => ({
          ...s,
          status: 'finished',
          currentDifficulty: nextDiff,
        }))
        setScreen('finished')
        return
      }

      setSession((s) => ({
        ...s,
        currentDifficulty: nextDiff,
        unlocked: outcome.unlocked,
        currentHand: result.hand,
        handIndex: 0,
        status: 'playing',
        tierAttempts: {
          ...s.tierAttempts,
          [nextDiff]: {
            correct: 0,
            answered: 0,
            status: 'active',
          },
        },
      }))
      setAudit([])
      setSelectedIndex(null)
      setPendingScored(false)
      if (result.msg) setStatusMsg(result.msg)
      setTierSnapshot(null)
      setScreen('play')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setScreen('tier-result')
    }
  }

  function resetAll() {
    setSession(initialSession())
    setTierSnapshot(null)
    setAudit([])
    setSelectedIndex(null)
    setPendingScored(false)
    setError(null)
    setStatusMsg(null)
    setMultiName('')
    setMultiPlayerId(null)
    setMultiRoom(null)
    setMultiBusy(false)
    clearMultiSession()
    setScreen('mode')
  }

  /** Quitte la salle côté serveur (les autres continuent) puis retour accueil */
  async function handleMultiLeave() {
    const code = multiRoom?.code
    const pid = multiPlayerId
    const name = multiName.trim()
    const theme = multiRoom?.theme
    if (code && name) {
      saveLastMultiRoom({ code, playerName: name, theme })
    }
    if (code && pid) {
      try {
        await leaveRoom({ code, playerId: pid })
      } catch {
        /* salle déjà fermée / réseau — on sort quand même */
      }
    }
    resetAll()
  }

  async function handleMultiKick(targetPlayerId: string) {
    if (!multiRoom || !multiPlayerId) return
    setMultiBusy(true)
    setError(null)
    try {
      const res = await kickRoomPlayer({
        code: multiRoom.code,
        playerId: multiPlayerId,
        targetPlayerId,
      })
      setMultiRoom(res.room)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setMultiBusy(false)
    }
  }

  // —— Multi handlers ——
  function handleMultiCreateName(playerName: string) {
    setMultiName(playerName)
    setError(null)
    setScreen('multi-theme')
  }

  async function handleMultiJoin(code: string, playerName: string) {
    setMultiBusy(true)
    setError(null)
    try {
      const res = await joinRoom({ code, playerName })
      setMultiName(playerName)
      setMultiPlayerId(res.playerId!)
      setMultiRoom(res.room)
      saveMultiSession({
        code: res.room.code,
        playerId: res.playerId!,
        playerName,
      })
      saveLastMultiRoom({
        code: res.room.code,
        playerName,
        theme: res.room.theme,
      })
      setScreen(multiScreenForStatus(res.room.status))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setMultiBusy(false)
    }
  }

  async function handleMultiThemeStart(
    theme: string,
    _playerName: string,
    scope: QuizScope,
    options: ThemeStartOptions,
  ) {
    setMultiBusy(true)
    setError(null)

    // Changement de thème dans une salle existante (garde les joueurs)
    if (multiRoom && multiPlayerId) {
      setStatusMsg('Mise à jour du thème…')
      try {
        const res = await setRoomTheme({
          code: multiRoom.code,
          playerId: multiPlayerId,
          theme,
          scope,
          aiProvider: options.aiProvider,
          quizMode: 'standard',
        })
        setMultiRoom(res.room)
        const mode = options.gameMode
        const withMode = await setRoomPlayMode({
          code: res.room.code,
          playerId: multiPlayerId,
          playMode: mode,
        })
        setMultiRoom(withMode.room)
        const withTimer = await setRoomTimer({
          code: withMode.room.code,
          playerId: multiPlayerId,
          timerEnabled: options.timerEnabled,
        })
        setMultiRoom(withTimer.room)
        if (mode === 'free') {
          const withDiff = await setRoomDifficulty({
            code: withTimer.room.code,
            playerId: multiPlayerId,
            difficulty: options.difficulty,
          })
          setMultiRoom(withDiff.room)
        }
        setStatusMsg(null)
        setScreen('multi-lobby')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setMultiBusy(false)
      }
      return
    }

    setStatusMsg('Création de la salle…')
    try {
      if (multiName.trim().length < 2) {
        setError('Pseudo obligatoire — retourne à l’écran multijoueur')
        setScreen('multi-gate')
        return
      }
      const res = await createRoom({
        playerName: multiName.trim(),
        theme,
        scope,
        timerEnabled: options.timerEnabled,
        playMode: options.gameMode,
        difficulty: options.difficulty,
        aiProvider: options.aiProvider,
        quizMode: 'standard',
      })
      setMultiPlayerId(res.playerId!)
      setMultiRoom(res.room)
      saveMultiSession({
        code: res.room.code,
        playerId: res.playerId!,
        playerName: multiName.trim(),
      })
      saveLastMultiRoom({
        code: res.room.code,
        playerName: multiName.trim(),
        theme: res.room.theme,
      })
      setStatusMsg(null)
      setScreen('multi-lobby')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setScreen('multi-theme')
    } finally {
      setMultiBusy(false)
    }
  }

  async function handleMultiSetDifficulty(difficulty: Difficulty) {
    if (!multiRoom || !multiPlayerId) return
    setMultiBusy(true)
    setError(null)
    try {
      const res = await setRoomDifficulty({
        code: multiRoom.code,
        playerId: multiPlayerId,
        difficulty,
      })
      setMultiRoom(res.room)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setMultiBusy(false)
    }
  }

  async function handleMultiStart() {
    if (!multiRoom || !multiPlayerId) return
    setMultiBusy(true)
    setError(null)
    setStatusMsg('Génération des questions…')
    try {
      const res = await startRoom({
        code: multiRoom.code,
        playerId: multiPlayerId,
      })
      setMultiRoom(res.room)
      setStatusMsg(res.message ?? null)
      setScreen(multiScreenForStatus(res.room.status))
    } catch (e) {
      const room = roomFromError(e)
      if (room) setMultiRoom(room)
      setError(e instanceof Error ? e.message : 'Erreur')
      setScreen('multi-lobby')
    } finally {
      setMultiBusy(false)
    }
  }

  async function handleMultiContinueTier() {
    if (!multiRoom || !multiPlayerId) return
    // Paliers : on ne génère le suivant que si TOUT LE MONDE a validé 10/10
    const allPassed =
      multiRoom.players.length > 0 &&
      multiRoom.players.every((p) => p.score >= PASS_THRESHOLD)
    if (!allPassed) {
      setError(`Il faut ${PASS_THRESHOLD}/10 pour chaque joueur pour avancer`)
      return
    }
    const cur =
      multiRoom.difficulty === 'medium' || multiRoom.difficulty === 'hard'
        ? multiRoom.difficulty
        : 'easy'
    const idx = DIFFICULTIES.indexOf(cur)
    const next = DIFFICULTIES[idx + 1]
    if (!next) return
    setMultiBusy(true)
    setError(null)
    setStatusMsg(`Génération du palier ${DIFFICULTY_LABELS[next]}…`)
    try {
      await setRoomDifficulty({
        code: multiRoom.code,
        playerId: multiPlayerId,
        difficulty: next,
      })
      const res = await startRoom({
        code: multiRoom.code,
        playerId: multiPlayerId,
      })
      setMultiRoom(res.room)
      setStatusMsg(res.message ?? null)
      setScreen(multiScreenForStatus(res.room.status))
    } catch (e) {
      const room = roomFromError(e)
      if (room) setMultiRoom(room)
      setError(e instanceof Error ? e.message : 'Erreur')
      setScreen('multi-lobby')
    } finally {
      setMultiBusy(false)
    }
  }

  async function handleMultiRestartTiers() {
    if (!multiRoom || !multiPlayerId) return
    setMultiBusy(true)
    setError(null)
    try {
      await setRoomDifficulty({
        code: multiRoom.code,
        playerId: multiPlayerId,
        difficulty: 'easy',
      })
      const res = await startRoom({
        code: multiRoom.code,
        playerId: multiPlayerId,
      })
      setMultiRoom(res.room)
      setStatusMsg(res.message ?? null)
      setScreen(multiScreenForStatus(res.room.status))
    } catch (e) {
      const room = roomFromError(e)
      if (room) setMultiRoom(room)
      setError(e instanceof Error ? e.message : 'Erreur')
      setScreen('multi-lobby')
    } finally {
      setMultiBusy(false)
    }
  }

  async function handleMultiClose() {
    if (!multiRoom || !multiPlayerId) return
    setMultiBusy(true)
    setError(null)
    try {
      if (multiName.trim()) {
        saveLastMultiRoom({
          code: multiRoom.code,
          playerName: multiName.trim(),
          theme: multiRoom.theme,
        })
      }
      await closeRoom({ code: multiRoom.code, playerId: multiPlayerId })
      resetAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setMultiBusy(false)
    }
  }

  async function handleMultiAnswer(answerIndex: number) {
    if (!multiRoom || !multiPlayerId) return
    try {
      const res = await answerRoom({
        code: multiRoom.code,
        playerId: multiPlayerId,
        answerIndex,
      })
      setMultiRoom((prev) => preferNewerRoom(prev, res.room))
      if (res.room.status === 'finished') setScreen('multi-score')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleMultiBegin() {
    if (!multiRoom || !multiPlayerId) return
    setMultiBusy(true)
    setError(null)
    try {
      const res = await beginRoomRound({
        code: multiRoom.code,
        playerId: multiPlayerId,
      })
      setMultiRoom((prev) => preferNewerRoom(prev, res.room))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setMultiBusy(false)
    }
  }

  async function handleMultiPause() {
    if (!multiRoom || !multiPlayerId) return
    setMultiBusy(true)
    setError(null)
    try {
      const res = await pauseRoomTimer({
        code: multiRoom.code,
        playerId: multiPlayerId,
      })
      setMultiRoom((prev) => preferNewerRoom(prev, res.room))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setMultiBusy(false)
    }
  }

  async function handleMultiResume() {
    if (!multiRoom || !multiPlayerId) return
    setMultiBusy(true)
    setError(null)
    try {
      const res = await resumeRoomTimer({
        code: multiRoom.code,
        playerId: multiPlayerId,
      })
      setMultiRoom((prev) => preferNewerRoom(prev, res.room))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setMultiBusy(false)
    }
  }

  async function handleMultiNext() {
    if (!multiRoom || !multiPlayerId || multiBusy) return
    setMultiBusy(true)
    setError(null)
    try {
      const res = await nextRoomQuestion({
        code: multiRoom.code,
        playerId: multiPlayerId,
      })
      setMultiRoom((prev) => preferNewerRoom(prev, res.room))
      if (res.room.status === 'finished') setScreen('multi-score')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setMultiBusy(false)
    }
  }

  const currentQuestion = session.currentHand[session.handIndex]
  const showHeader =
    screen !== 'mode' &&
    screen !== 'home' &&
    screen !== 'multi-gate' &&
    !(screen === 'multi-theme' && !multiRoom)
  const isHomeLike =
    screen === 'mode' ||
    screen === 'home' ||
    screen === 'multi-gate' ||
    (screen === 'multi-theme' && !multiRoom)

  return (
    <div className={`app${isHomeLike ? ' app--home' : ''}`}>
      <div className="app__atmosphere" aria-hidden />
      {showHeader && (
        <header className="app__header">
          <p className="brand">Quizz</p>
          <div className="app__header-right">
            {(session.theme || multiRoom?.theme) && (
              <p className="app__theme">
                {multiRoom?.theme ?? session.theme}
                {multiRoom?.code && (
                  <span className="app__scope"> · {multiRoom.code}</span>
                )}
                {!multiRoom && session.theme && (
                  <span className="app__scope">
                    {' '}
                    · {QUIZ_SCOPE_LABELS[session.scope]}
                  </span>
                )}
              </p>
            )}
            <button
              type="button"
              className="btn-home"
              onClick={() => {
                if (screen === 'multi-theme' && multiRoom) {
                  setError(null)
                  setScreen('multi-score')
                  return
                }
                if (multiRoom && multiPlayerId) {
                  void handleMultiLeave()
                  return
                }
                resetAll()
              }}
            >
              {screen === 'multi-theme' && multiRoom ? 'Retour' : 'Accueil'}
            </button>
          </div>
        </header>
      )}

      <main className="app__main">
        {screen === 'play' || screen === 'tier-result' || screen === 'finished' ? (
          <ProgressBar
            current={session.currentDifficulty}
            finished={screen === 'finished'}
            freeMode={session.playMode === 'manual'}
          />
        ) : null}

        {screen === 'mode' && (
          <ModeSelect
            onSolo={() => {
              setError(null)
              setScreen('home')
            }}
            onMulti={() => {
              setError(null)
              setScreen('multi-gate')
            }}
          />
        )}

        {screen === 'home' && (
          <ThemeSelect
            onStart={handleStart}
            variant="solo"
            busy={false}
            error={error}
          />
        )}

        {screen === 'multi-gate' && (
          <MultiGate
            onCreate={handleMultiCreateName}
            onJoin={handleMultiJoin}
            onBack={() => setScreen('mode')}
            busy={multiBusy}
            error={error}
          />
        )}

        {screen === 'multi-theme' && (
          <ThemeSelect
            onStart={handleMultiThemeStart}
            variant="multi"
            busy={multiBusy}
            error={error}
          />
        )}

        {screen === 'loading' && (
          <div className="loading" role="status">
            <div className="loading__pulse" />
            <p>{statusMsg ?? 'Chargement…'}</p>
          </div>
        )}

        {screen === 'play' && currentQuestion && (
          <>
            <QuizPlay
              question={currentQuestion}
              index={session.handIndex}
              total={session.currentHand.length}
              onAnswer={handleAnswer}
              selectedIndex={selectedIndex}
              onContinue={handleNextAfterFeedback}
              disabled={selectedIndex !== null}
              timerEnabled={session.timerEnabled}
            />
            <AnswerAudit entries={audit} compact />
          </>
        )}

        {screen === 'tier-result' && tierSnapshot && (
          <>
            {error && <p className="game-home__error">{error}</p>}
            <TierResult
              difficulty={tierSnapshot.difficulty}
              correct={tierSnapshot.correct}
              answered={tierSnapshot.answered}
              passed={tierSnapshot.passed}
              hasNext={tierSnapshot.hasNext}
              playMode={session.playMode}
              busy={false}
              onContinue={handleTierContinue}
              onReplay={() => void startSoloHand(tierSnapshot.difficulty)}
              onPickDifficulty={(d) => void startSoloHand(d)}
              onFinish={() => {
                setSession((s) => ({ ...s, status: 'finished' }))
                setScreen('finished')
              }}
            />
            <AnswerAudit entries={audit} compact={false} />
          </>
        )}

        {screen === 'finished' && (
          <Results
            playerName={session.playerName}
            theme={session.theme}
            totalScore={session.totalScore}
            tierAttempts={session.tierAttempts}
            onRestart={resetAll}
          />
        )}

        {screen === 'multi-lobby' && multiRoom && multiPlayerId && (
          <MultiLobby
            room={multiRoom}
            playerId={multiPlayerId}
            busy={multiBusy}
            error={error}
            statusMsg={
              multiRoom.storage === 'memory'
                ? 'Astuce : sur le même Wi‑Fi, utilise le lien local du PC hôte pour que tout le monde soit synchronisé.'
                : statusMsg
            }
            onStart={handleMultiStart}
            onLeave={() => void handleMultiLeave()}
            onKick={(id) => void handleMultiKick(id)}
          />
        )}

        {screen === 'multi-play' && multiRoom && multiPlayerId && (
          <>
            {multiRoom.playMode === 'progression' && (
              <ProgressBar
                current={
                  multiRoom.difficulty === 'medium' ||
                  multiRoom.difficulty === 'hard'
                    ? multiRoom.difficulty
                    : 'easy'
                }
              />
            )}
            <MultiPlay
              room={multiRoom}
              playerId={multiPlayerId}
              onAnswer={handleMultiAnswer}
              onBegin={() => void handleMultiBegin()}
              onPause={() => void handleMultiPause()}
              onResume={() => void handleMultiResume()}
              onNext={() => void handleMultiNext()}
              onLeave={() => void handleMultiLeave()}
              onKick={(id) => void handleMultiKick(id)}
              busy={multiBusy}
            />
          </>
        )}

        {screen === 'multi-score' && multiRoom && multiPlayerId && (
          <MultiScoreboard
            room={multiRoom}
            playerId={multiPlayerId}
            busy={multiBusy}
            error={error}
            onReplay={handleMultiStart}
            onContinueTier={() => void handleMultiContinueTier()}
            onRestartTiers={() => void handleMultiRestartTiers()}
            onChangeTheme={() => {
              setError(null)
              setScreen('multi-theme')
            }}
            onSetDifficulty={handleMultiSetDifficulty}
            onCloseRoom={handleMultiClose}
            onLeave={() => void handleMultiLeave()}
            onKick={(id) => void handleMultiKick(id)}
          />
        )}

        {statusMsg && screen === 'play' && (
          <p className="app__hint">{statusMsg}</p>
        )}
      </main>
    </div>
  )
}
