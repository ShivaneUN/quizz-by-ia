import { useCallback, useEffect, useRef, useState } from 'react'
import { generateQuestions } from './lib/api'
import { attachImagesToQuestions } from './lib/resolveImage'
import {
  collectExcludeQuestionTexts,
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
import { reportCalibHand } from './lib/calibTelemetry'
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
  runRoomGenerate,
  reportTypingScore,
  cancelRoomGenerate,
  backRoomToLobby,
  type MultiRoom,
} from './lib/multiApi'
import {
  clearMultiSession,
  loadMultiSession,
  saveLastMultiRoom,
  saveMultiSession,
} from './lib/multiSession'
import { AnswerAudit } from './components/AnswerAudit'
import { WaitMiniGames } from './components/WaitMiniGames'
import {
  TypingScorePopup,
  type TypingScoreEntry,
} from './components/TypingScorePopup'
import { HomeSideNav } from './components/HomeSideNav'
import { AdminPanel } from './components/AdminPanel'
import { MultiChat } from './components/MultiChat'
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
  | 'minigames'
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

/** Timeout client solo — évite un loading infini si le fetch ne revient jamais. */
const SOLO_GEN_TIMEOUT_MS = 65_000

function armSoloGenTimeout(ac: AbortController): {
  clear: () => void
  didTimeout: () => boolean
} {
  let timedOut = false
  const id = window.setTimeout(() => {
    timedOut = true
    ac.abort()
  }, SOLO_GEN_TIMEOUT_MS)
  return {
    clear: () => window.clearTimeout(id),
    didTimeout: () => timedOut,
  }
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
  playMode: 'manual',
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
  const [screen, setScreen] = useState<Screen>('home')
  const [session, setSession] = useState<GameSession>(initialSession)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [genQuestionsDone, setGenQuestionsDone] = useState(0)
  const [genAiSource, setGenAiSource] = useState<string | null>(null)

  function applyGenMsg(msg: string | undefined) {
    if (!msg) return
    setStatusMsg(msg)
    // Extraire le nom du provider depuis "Généré avec groq (model) — easy"
    const m = msg.match(/généré avec\s+(\S+)/i)
    if (m) setGenAiSource(m[1])
  }
  const [tierSnapshot, setTierSnapshot] = useState<TierSnapshot | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [pendingScored, setPendingScored] = useState(false)
  /** Évite de doubler l’audit multi à chaque poll en phase reveal */
  const multiAuditKeysRef = useRef<Set<string>>(new Set())
  const soloGenAbortRef = useRef<AbortController | null>(null)
  /** true si l’utilisateur a cliqué Annuler / Accueil — pas d’erreur parasite */
  const soloCancelRef = useRef(false)
  const multiGenAbortRef = useRef<AbortController | null>(null)
  const multiThemeReturnRef = useRef<'lobby' | 'score'>('lobby')
  const screenRef = useRef(screen)
  screenRef.current = screen

  // Ancien écran mode → accueil solo
  useEffect(() => {
    if (screen === 'mode') setScreen('home')
  }, [screen])

  // —— Multijoueur ——
  const [multiName, setMultiName] = useState('')
  const [multiPlayerId, setMultiPlayerId] = useState<string | null>(null)
  const [multiRoom, setMultiRoom] = useState<MultiRoom | null>(null)
  const [multiBusy, setMultiBusy] = useState(false)
  /** Popup scores duel de frappe (fin de génération) */
  const [typingBoard, setTypingBoard] = useState<{
    kind: 'solo' | 'multi'
    entries: TypingScoreEntry[]
  } | null>(null)
  const soloTypingScoreRef = useRef(0)
  const multiTypingFlushRef = useRef(0)
  const multiPrevStatusRef = useRef<MultiRoom['status'] | null>(null)
  const typingReportTimer = useRef<number | null>(null)

  // Audit multi : enregistre à chaque révélation de question
  useEffect(() => {
    if (!multiRoom || !multiPlayerId) return
    if (multiRoom.status !== 'playing' && multiRoom.status !== 'finished') return
    if (multiRoom.roundPhase !== 'reveal') return
    const q = multiRoom.questions[multiRoom.questionIndex]
    if (!q) return
    const key = `${multiRoom.code}:${multiRoom.questionIndex}:${q.id}`
    if (multiAuditKeysRef.current.has(key)) return
    multiAuditKeysRef.current.add(key)
    const raw = multiRoom.currentAnswers[multiPlayerId]
    const selectedIndex = typeof raw === 'number' ? raw : -1
    const correctIndex =
      typeof q.correctIndex === 'number' ? q.correctIndex : 0
    const correct = selectedIndex >= 0 && selectedIndex === correctIndex
    setAudit((prev) => [
      ...prev,
      {
        questionId: q.id,
        question: q.question,
        answers: q.answers,
        selectedIndex,
        correctIndex,
        correct,
        explanation: q.explanation,
        sourceType: q.sourceType,
        revealAnswer: q.revealAnswer,
        coverUrl: q.coverUrl,
      },
    ])
  }, [
    multiRoom,
    multiPlayerId,
    multiRoom?.code,
    multiRoom?.status,
    multiRoom?.roundPhase,
    multiRoom?.questionIndex,
    multiRoom?.updatedAt,
  ])

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
      quizMode: 'standard' | 'image' | 'audio' = 'standard',
      signal?: AbortSignal,
    ): Promise<{ hand: Question[]; msg?: string } | { error: string }> => {
      const playerId = getOrCreatePlayerId()
      let history = loadHistory(playerId, themeSlug)
      let msg: string | undefined

      async function finalizeImageQs(qs: Question[]): Promise<Question[]> {
        if (quizMode !== 'image') return qs
        return attachImagesToQuestions(qs)
      }

      function finalizeAudioQs(qs: Question[]): Question[] {
        if (quizMode !== 'audio') return qs
        return qs.filter((q) => Boolean(q.previewUrl))
      }

      // Actualité / Deezer : régénérer (pas de banque figée)
      if (isEphemeralTheme(theme, themeSlug) || quizMode === 'audio') {
        try {
          const gen = await generateQuestions(
            {
              theme,
              mode: 'complementary',
              difficulty,
              scope,
              provider,
              quizMode,
              excludeQuestions: collectExcludeQuestionTexts(themeSlug, playerId),
            },
            signal,
            (done, _total, engine, stage) => {
              setGenQuestionsDone((n) => Math.max(n, done))
              if (engine) setGenAiSource(engine)
              if (stage) setStatusMsg(stage)
            },
          )
          let hand = await finalizeImageQs(
            gen.questions.filter((q) => q.difficulty === difficulty),
          )
          hand = finalizeAudioQs(hand)
          hand = hand.slice(0, QUESTIONS_PER_TIER)
          if (hand.length < QUESTIONS_PER_TIER) {
            return {
              error:
                quizMode === 'audio'
                  ? `Impossible de constituer 10 questions musicales (${hand.length}/10). Réessaie avec un autre style.`
                  : `Impossible de constituer 10 questions illustrées (${hand.length}/10). Réessaie.`,
            }
          }
          history = markSeen(
            history,
            difficulty,
            hand.map((q) => q.id),
            hand.map((q) => q.question),
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
      let lastGenError: string | undefined

      async function generateAndMerge(): Promise<boolean> {
        try {
          const gen = await generateQuestions(
            {
              theme,
              mode: 'complementary',
              difficulty,
              scope,
              provider,
              quizMode,
              excludeQuestions: collectExcludeQuestionTexts(themeSlug, playerId),
            },
            signal,
            (done, _total, engine, stage) => {
              setGenQuestionsDone((n) => Math.max(n, done))
              if (engine) setGenAiSource(engine)
              if (stage) setStatusMsg(stage)
            },
          )
          const tierQs = await finalizeImageQs(
            gen.questions.filter((q) => q.difficulty === difficulty),
          )
          if (tierQs.length === 0) {
            lastGenError = 'Aucune question valide reçue pour ce palier.'
            return false
          }

          if (!bank) {
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
          } else {
            bank = mergeQuestionsIntoBank(bank, tierQs)
          }
          saveBank(bank)
          msg =
            gen.message ??
            (gen.source === 'mock' ? 'Mode mock (pas de clé API)' : undefined)
          return true
        } catch (e) {
          lastGenError =
            e instanceof Error
              ? e.message
              : 'Thème non valide ou génération impossible'
          return false
        }
      }

      if (!bank) {
        const ok = await generateAndMerge()
        if (!ok) {
          return {
            error: lastGenError ?? 'Thème non valide ou génération impossible',
          }
        }
      }

      let hand = drawUnseen(bank!, history, difficulty, QUESTIONS_PER_TIER)
      if (quizMode === 'image') {
        hand = hand.filter((q) => Boolean(q.imageUrl))
      }

      // Si la banque locale ne suffit pas (palier vide ou déjà vu), 1-2 générations complémentaires max.
      let refillTries = 0
      while (hand.length < QUESTIONS_PER_TIER && refillTries < 2) {
        refillTries++
        setStatusMsg(`Complément de génération (${hand.length}/10)…`)
        const ok = await generateAndMerge()
        if (!ok) break
        hand = drawUnseen(bank!, history, difficulty, QUESTIONS_PER_TIER)
        if (quizMode === 'image') {
          hand = hand.filter((q) => Boolean(q.imageUrl))
        }
      }

      if (hand.length < QUESTIONS_PER_TIER) {
        return {
          error:
            quizMode === 'image'
              ? `Impossible de constituer 10 questions illustrées (${hand.length}/10). Réessaie.`
              : lastGenError ??
                `Impossible de constituer 10 questions pour ce palier (${hand.length}/10). Réessaie.`,
        }
      }

      hand = hand.slice(0, QUESTIONS_PER_TIER)
      history = markSeen(
        history,
        difficulty,
        hand.map((q) => q.id),
        hand.map((q) => q.question),
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
        let merged = room
        setMultiRoom((prev) => {
          merged = preferNewerRoom(prev, room)
          return merged
        })
        // Pendant le choix de thème, ne pas forcer le lobby / score
        if (screenRef.current === 'multi-theme') return
        // Navigation pilotée par le status fusionné (évite poll stale)
        const next = multiScreenForStatus(merged.status)
        if (merged.status === 'error') {
          setStatusMsg(null)
        }
        if (next !== screenRef.current) {
          // Efface une vieille erreur 504 de génération une fois la partie OK
          if (next === 'multi-play' || next === 'multi-score') {
            setError(null)
            setStatusMsg(null)
          }
          setScreen(next)
        }
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
          setScreen('home')
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

  // Ouvre le dashboard frappe quand la génération multi se termine
  useEffect(() => {
    const status = multiRoom?.status ?? null
    const prev = multiPrevStatusRef.current
    multiPrevStatusRef.current = status
    if (!multiRoom || !multiPlayerId) return
    if (prev === 'generating' && status === 'playing') {
      // Flush le dernier score local avant d’afficher le classement
      if (typingReportTimer.current) {
        window.clearTimeout(typingReportTimer.current)
        typingReportTimer.current = null
      }
      const localScore = multiTypingFlushRef.current
      void reportTypingScore({
        code: multiRoom.code,
        playerId: multiPlayerId,
        typingScore: localScore,
      })
        .then((res) => {
          setMultiRoom((prevRoom) => preferNewerRoom(prevRoom, res.room))
          setTypingBoard({
            kind: 'multi',
            entries: res.room.players.map((p) => ({
              id: p.id,
              name: p.name,
              score:
                p.id === multiPlayerId
                  ? Math.max(p.typingScore ?? 0, localScore)
                  : (p.typingScore ?? 0),
            })),
          })
        })
        .catch(() => {
          setTypingBoard({
            kind: 'multi',
            entries: multiRoom.players.map((p) => ({
              id: p.id,
              name: p.name,
              score:
                p.id === multiPlayerId
                  ? Math.max(p.typingScore ?? 0, localScore)
                  : (p.typingScore ?? 0),
            })),
          })
        })
    }
  }, [multiRoom, multiPlayerId, multiRoom?.status, multiRoom?.updatedAt])

  // Ferme auto : hôte a lancé le chrono / la manche
  const typingBoardKind = typingBoard?.kind ?? null
  useEffect(() => {
    if (typingBoardKind !== 'multi' || !multiRoom) return
    if (multiRoom.timerStarted) {
      setTypingBoard(null)
      return
    }
    // Sans chrono : la manche démarre toute seule → laisse lire puis ferme
    if (
      multiRoom.timerEnabled === false &&
      multiRoom.roundPhase === 'answering'
    ) {
      const id = window.setTimeout(() => setTypingBoard(null), 5000)
      return () => window.clearTimeout(id)
    }
  }, [
    typingBoardKind,
    multiRoom,
    multiRoom?.timerStarted,
    multiRoom?.timerEnabled,
    multiRoom?.roundPhase,
  ])

  // Rafraîchit le classement multi pendant que le popup est ouvert
  useEffect(() => {
    if (typingBoardKind !== 'multi' || !multiRoom) return
    const next = multiRoom.players.map((p) => ({
      id: p.id,
      name: p.name,
      score:
        p.id === multiPlayerId
          ? Math.max(p.typingScore ?? 0, multiTypingFlushRef.current)
          : (p.typingScore ?? 0),
    }))
    setTypingBoard((prev) => {
      if (!prev || prev.kind !== 'multi') return prev
      const same =
        prev.entries.length === next.length &&
        prev.entries.every(
          (e, i) =>
            e.id === next[i]?.id &&
            e.name === next[i]?.name &&
            e.score === next[i]?.score,
        )
      return same ? prev : { kind: 'multi', entries: next }
    })
  }, [typingBoardKind, multiRoom, multiRoom?.players, multiPlayerId])

  // Solo : ferme auto après quelques secondes (le quiz est déjà prêt)
  useEffect(() => {
    if (typingBoardKind !== 'solo') return
    const id = window.setTimeout(() => setTypingBoard(null), 5000)
    return () => window.clearTimeout(id)
  }, [typingBoardKind])

  // Solo : ferme aussi dès la 1ʳᵉ réponse
  useEffect(() => {
    if (typingBoardKind === 'solo' && selectedIndex !== null) {
      setTypingBoard(null)
    }
  }, [selectedIndex, typingBoardKind])

  function pushSoloTypingBoard(score: number) {
    setTypingBoard({
      kind: 'solo',
      entries: [
        {
          id: 'solo',
          name: 'Toi',
          score,
        },
      ],
    })
  }

  function handleSoloTypingScore(score: number) {
    soloTypingScoreRef.current = score
  }

  function handleMultiTypingScore(score: number) {
    if (!multiRoom || !multiPlayerId) return
    multiTypingFlushRef.current = score
    if (typingReportTimer.current) window.clearTimeout(typingReportTimer.current)
    typingReportTimer.current = window.setTimeout(() => {
      void reportTypingScore({
        code: multiRoom.code,
        playerId: multiPlayerId,
        typingScore: multiTypingFlushRef.current,
      })
        .then((res) => {
          setMultiRoom((prev) => preferNewerRoom(prev, res.room))
        })
        .catch(() => {
          /* poll rattrapera */
        })
    }, 400)
  }

  // Flush immédiat du score frappe à la fin (démontage TypingDuel)
  useEffect(() => {
    return () => {
      if (typingReportTimer.current) {
        window.clearTimeout(typingReportTimer.current)
      }
    }
  }, [])

  async function handleStart(
    theme: string,
    playerName: string,
    scope: QuizScope,
    options: ThemeStartOptions,
  ) {
    // Solo uniquement hors salle multi
    if (multiRoom && multiPlayerId) {
      setError(
        `Salle ${multiRoom.code} encore ouverte — quitte la salle pour jouer en solo.`,
      )
      setScreen('home')
      return
    }

    setError(null)
    setStatusMsg(null)
    setGenQuestionsDone(0)
    setGenAiSource(null)
    soloCancelRef.current = false
    soloGenAbortRef.current?.abort()
    const ac = new AbortController()
    soloGenAbortRef.current = ac
    const genTimeout = armSoloGenTimeout(ac)
    setScreen('loading')
    soloTypingScoreRef.current = 0

    const themeSlug = bankSlug(theme, scope, options.quizMode)
    const playMode = options.gameMode === 'free' ? 'manual' : 'progression'
    const startDiff: Difficulty =
      playMode === 'manual' ? options.difficulty : 'easy'
    const unlocked: Difficulty[] =
      playMode === 'manual' ? [...DIFFICULTIES] : ['easy']
    const aiProvider = options.aiProvider ?? 'auto'
    const quizMode = options.quizMode === 'audio' ? 'audio' : 'standard'

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
        ac.signal,
      )
      if (ac.signal.aborted || ('error' in result && result.error === 'Génération annulée')) {
        if (soloCancelRef.current) return
        setError(
          genTimeout.didTimeout()
            ? 'La génération a pris trop de temps. Réessaie.'
            : 'error' in result && result.error !== 'Génération annulée'
              ? result.error
              : 'Génération interrompue. Réessaie.',
        )
        setScreen('home')
        return
      }
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
      applyGenMsg(result.msg)
      pushSoloTypingBoard(soloTypingScoreRef.current)
      setScreen('play')
    } catch (e) {
      if (ac.signal.aborted) {
        if (soloCancelRef.current) return
        setError(
          genTimeout.didTimeout()
            ? 'La génération a pris trop de temps. Réessaie.'
            : 'Génération interrompue. Réessaie.',
        )
        setScreen('home')
        return
      }
      setError(e instanceof Error ? e.message : 'Erreur au démarrage')
      setScreen('home')
    } finally {
      genTimeout.clear()
      if (soloGenAbortRef.current === ac) soloGenAbortRef.current = null
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
        revealAnswer: q.revealAnswer,
        coverUrl: q.coverUrl,
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
      reportCalibHand({
        mode: 'solo',
        theme: session.theme,
        scope: session.scope,
        difficulty: session.currentDifficulty,
        correct: tier.correct,
        answered: tier.answered,
        playMode: 'manual',
      })
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

    reportCalibHand({
      mode: 'solo',
      theme: session.theme,
      scope: session.scope,
      difficulty: session.currentDifficulty,
      correct: tier.correct,
      answered: tier.answered,
      playMode: 'progression',
    })

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
    setGenQuestionsDone(0)
    setGenAiSource(null)
    soloCancelRef.current = false
    soloGenAbortRef.current?.abort()
    const ac = new AbortController()
    soloGenAbortRef.current = ac
    const genTimeout = armSoloGenTimeout(ac)
    setScreen('loading')
    soloTypingScoreRef.current = 0
    setStatusMsg('Préparation de la manche…')

    try {
      const result = await ensureHand(
        session.theme,
        session.themeSlug,
        nextDiff,
        session.scope,
        session.aiProvider ?? 'auto',
        session.quizMode ?? 'standard',
        ac.signal,
      )
      if (ac.signal.aborted) {
        if (genTimeout.didTimeout()) {
          setError('La génération a pris trop de temps. Réessaie.')
          setScreen('tier-result')
        }
        return
      }
      if ('error' in result) {
        if (result.error === 'Génération annulée' && soloCancelRef.current) return
        setError(
          result.error === 'Génération annulée'
            ? 'Génération interrompue. Réessaie.'
            : result.error,
        )
        setScreen('tier-result')
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
      applyGenMsg(result.msg)
      setTierSnapshot(null)
      pushSoloTypingBoard(soloTypingScoreRef.current)
      setScreen('play')
    } catch (e) {
      if (ac.signal.aborted) {
        if (genTimeout.didTimeout()) {
          setError('La génération a pris trop de temps. Réessaie.')
          setScreen('tier-result')
        }
        return
      }
      setError(e instanceof Error ? e.message : 'Erreur')
      setScreen('tier-result')
    } finally {
      genTimeout.clear()
      if (soloGenAbortRef.current === ac) soloGenAbortRef.current = null
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
    setGenQuestionsDone(0)
    setGenAiSource(null)
    soloTypingScoreRef.current = 0
    setStatusMsg(
      outcome.passed && outcome.nextDifficulty
        ? `Génération du palier ${DIFFICULTY_LABELS[outcome.nextDifficulty]}…`
        : `Nouvelle manche ${DIFFICULTY_LABELS[nextDiff]}…`,
    )

    soloCancelRef.current = false
    soloGenAbortRef.current?.abort()
    const ac = new AbortController()
    soloGenAbortRef.current = ac
    const genTimeout = armSoloGenTimeout(ac)

    try {
      const result = await ensureHand(
        session.theme,
        session.themeSlug,
        nextDiff,
        session.scope,
        session.aiProvider ?? 'auto',
        session.quizMode ?? 'standard',
        ac.signal,
      )
      if (ac.signal.aborted) {
        if (genTimeout.didTimeout()) {
          setError('La génération a pris trop de temps. Réessaie.')
          setScreen('tier-result')
        }
        return
      }
      if ('error' in result) {
        if (result.error === 'Génération annulée' && soloCancelRef.current) return
        setError(
          result.error === 'Génération annulée'
            ? 'Génération interrompue. Réessaie.'
            : result.error,
        )
        setScreen('tier-result')
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
      applyGenMsg(result.msg)
      setTierSnapshot(null)
      pushSoloTypingBoard(soloTypingScoreRef.current)
      setScreen('play')
    } catch (e) {
      if (ac.signal.aborted) {
        if (genTimeout.didTimeout()) {
          setError('La génération a pris trop de temps. Réessaie.')
          setScreen('tier-result')
        }
        return
      }
      setError(e instanceof Error ? e.message : 'Erreur')
      setScreen('tier-result')
    } finally {
      genTimeout.clear()
      if (soloGenAbortRef.current === ac) soloGenAbortRef.current = null
    }
  }

  function resetAll() {
    soloGenAbortRef.current?.abort()
    soloGenAbortRef.current = null
    multiGenAbortRef.current?.abort()
    multiGenAbortRef.current = null
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
    setTypingBoard(null)
    setScreen('home')
  }

  /** Accueil : reset solo uniquement — ne quitte JAMAIS la salle multi. */
  function goHomeKeepRoom() {
    soloCancelRef.current = true
    soloGenAbortRef.current?.abort()
    soloGenAbortRef.current = null
    setSession(initialSession())
    setTierSnapshot(null)
    setAudit([])
    setSelectedIndex(null)
    setPendingScored(false)
    setError(null)
    setStatusMsg(null)
    setTypingBoard(null)
    setScreen('home')
  }

  function openMultiFromHome() {
    setError(null)
    if (multiRoom && multiPlayerId) {
      setScreen(multiScreenForStatus(multiRoom.status))
      return
    }
    setScreen('multi-gate')
  }

  function returnToActiveRoom() {
    setError(null)
    if (!multiRoom || !multiPlayerId) {
      setScreen('home')
      return
    }
    setScreen(multiScreenForStatus(multiRoom.status))
  }

  /** Quitte la salle seul — les autres restent (hôte : transfert d’hôte). */
  async function handleMultiLeave() {
    const code = multiRoom?.code
    const pid = multiPlayerId
    const name = multiName.trim()
    const theme = multiRoom?.theme
    const wasGenerating = multiRoom?.status === 'generating'
    const isHost = Boolean(pid && multiRoom && pid === multiRoom.hostId)
    if (code && name) {
      saveLastMultiRoom({ code, playerName: name, theme })
    }
    multiGenAbortRef.current?.abort()
    multiGenAbortRef.current = null
    if (code && pid && wasGenerating && isHost) {
      try {
        await cancelRoomGenerate({ code, playerId: pid })
      } catch {
        /* on quitte quand même */
      }
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
          quizMode: options.quizMode === 'audio' ? 'audio' : 'standard',
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
        quizMode: options.quizMode === 'audio' ? 'audio' : 'standard',
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

  async function runSharedMultiStart() {
    if (!multiRoom || !multiPlayerId) return
    const code = multiRoom.code
    const playerId = multiPlayerId
    setMultiBusy(true)
    setError(null)
    setStatusMsg('Génération des questions…')
    setAudit([])
    multiAuditKeysRef.current = new Set()
    // Même flux que le lancement initial : tout le monde voit « generating » via le poll
    const genStamp = Date.now()
    setMultiRoom((prev) =>
      prev
        ? {
            ...prev,
            status: 'generating',
            generatingStartedAt: genStamp,
            updatedAt: genStamp,
            questions: [],
            questionIndex: 0,
            currentAnswers: {},
            timerStarted: false,
            timerPaused: false,
            roundDeadlineAt: 0,
            players: prev.players.map((p) => ({
              ...p,
              score: 0,
              streakActuelle: 0,
              meilleurStreak: 0,
              bonusApplique: 0,
            })),
          }
        : prev,
    )
    setScreen('multi-lobby')
    multiGenAbortRef.current?.abort()
    const ac = new AbortController()
    multiGenAbortRef.current = ac

    async function syncFromPoll(): Promise<MultiRoom | null> {
      try {
        const { room } = await pollRoom(code)
        setMultiRoom((prev) => preferNewerRoom(prev, room))
        return room
      } catch {
        return null
      }
    }

    try {
      // 1) Marque generating (rapide) — plus de 504 sur ce POST
      const started = await startRoom({ code, playerId }, ac.signal)
      if (ac.signal.aborted) return
      setMultiRoom(started.room)

      // 2) Génération IA (peut être longue) — en cas de timeout, on se fie au poll
      let genRoom: MultiRoom | null = null
      try {
        const gen = await runRoomGenerate({ code, playerId }, ac.signal)
        if (ac.signal.aborted) return
        genRoom = gen.room
        setMultiRoom(gen.room)
        setStatusMsg(gen.message ?? null)
      } catch (e) {
        if (ac.signal.aborted) return
        const fromErr = roomFromError(e)
        if (fromErr) {
          setMultiRoom(fromErr)
          genRoom = fromErr
        }
        // Timeout / 504 : la gen a peut‑être quand même fini côté serveur
        const polled = await syncFromPoll()
        if (polled) genRoom = polled
        if (
          genRoom &&
          (genRoom.status === 'playing' || genRoom.status === 'finished')
        ) {
          setError(null)
          setStatusMsg(null)
          setScreen(multiScreenForStatus(genRoom.status))
          return
        }
        if (genRoom?.status === 'error') {
          setError(
            genRoom.errorMessage ||
              (e instanceof Error ? e.message : 'Génération échouée'),
          )
          setScreen('multi-lobby')
          return
        }
        // Toujours generating : le poll + watchdog serveur (~75s) débloquent
        setError(null)
        setStatusMsg(
          'Génération longue… Si rien ne bouge, annule puis réessaie.',
        )
        setScreen('multi-lobby')
        return
      }

      if (genRoom) {
        setError(null)
        setScreen(multiScreenForStatus(genRoom.status))
      }
    } catch (e) {
      if (ac.signal.aborted) return
      const polled = await syncFromPoll()
      if (
        polled &&
        (polled.status === 'playing' ||
          polled.status === 'finished' ||
          polled.status === 'generating')
      ) {
        setError(null)
        setScreen(multiScreenForStatus(polled.status))
        return
      }
      const room = roomFromError(e)
      if (room) setMultiRoom(room)
      setError(e instanceof Error ? e.message : 'Erreur')
      setScreen('multi-lobby')
    } finally {
      const stillMine = multiGenAbortRef.current === ac
      if (stillMine) multiGenAbortRef.current = null
      // Abort de *cette* gen seulement (pas une relance plus recente)
      if (ac.signal.aborted && stillMine) {
        try {
          await cancelRoomGenerate({ code, playerId })
        } catch {
          /* ignore */
        }
      }
      setMultiBusy(false)
    }
  }

  async function handleMultiCancelGenerate() {
    if (!multiRoom || !multiPlayerId) return
    multiGenAbortRef.current?.abort()
    multiGenAbortRef.current = null
    setMultiBusy(true)
    setError(null)
    try {
      const res = await cancelRoomGenerate({
        code: multiRoom.code,
        playerId: multiPlayerId,
      })
      setMultiRoom(res.room)
      setStatusMsg(res.message ?? 'Génération annulée')
      setScreen('multi-lobby')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setMultiBusy(false)
    }
  }

  function handleMultiChangeTheme(from: 'lobby' | 'score' = 'lobby') {
    multiThemeReturnRef.current = 'lobby'
    setError(null)
    setStatusMsg(null)
    void (async () => {
      if (!multiRoom || !multiPlayerId) {
        setScreen('multi-theme')
        return
      }
      setMultiBusy(true)
      try {
        // Remet tout le monde au lobby + signale que l’hôte choisit un thème
        const res = await backRoomToLobby({
          code: multiRoom.code,
          playerId: multiPlayerId,
          pickingTheme: true,
        })
        setMultiRoom(res.room)
        setScreen('multi-theme')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
        if (from === 'score') setScreen('multi-score')
      } finally {
        setMultiBusy(false)
      }
    })()
  }

  /** Quitte l’écran thèmes → salle active (multi) ou accueil (solo). */
  async function handleLeaveThemePage() {
    setError(null)
    setStatusMsg(null)

    // Solo / pas encore en salle
    if (!multiRoom || !multiPlayerId) {
      if (screen === 'multi-theme') setScreen('multi-gate')
      else setScreen('home')
      return
    }

    // Multi : ramène hôte + participants sur le lobby de la salle
    setMultiBusy(true)
    try {
      const res = await backRoomToLobby({
        code: multiRoom.code,
        playerId: multiPlayerId,
        pickingTheme: false,
      })
      setMultiRoom(res.room)
    } catch (e) {
      // Même si l’API échoue, on affiche le lobby localement
      setMultiRoom((prev) =>
        prev
          ? { ...prev, status: 'lobby', hostPickingTheme: false }
          : prev,
      )
      setError(e instanceof Error ? e.message : null)
    } finally {
      setMultiBusy(false)
    }
    multiThemeReturnRef.current = 'lobby'
    setScreen('multi-lobby')
  }

  function handleCancelSoloGenerate() {
    soloCancelRef.current = true
    soloGenAbortRef.current?.abort()
    setStatusMsg(null)
    setError(null)
    if (tierSnapshot) {
      setScreen('tier-result')
    } else {
      setScreen('home')
    }
  }

  async function handleMultiStart() {
    await runSharedMultiStart()
  }

  async function handleMultiContinueTier() {
    if (!multiRoom || !multiPlayerId) return
    const baseOf = (score: number, bonus?: number) =>
      Math.max(0, score - (bonus ?? 0))
    const allPassed =
      multiRoom.players.length > 0 &&
      multiRoom.players.every(
        (p) => baseOf(p.score, p.bonusApplique) >= PASS_THRESHOLD,
      )
    if (!allPassed) {
      setError(
        `Il faut ${PASS_THRESHOLD}/${QUESTIONS_PER_TIER} pour chaque joueur pour avancer`,
      )
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setMultiBusy(false)
      return
    }
    setMultiBusy(false)
    await runSharedMultiStart()
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setMultiBusy(false)
      return
    }
    setMultiBusy(false)
    await runSharedMultiStart()
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

  /** Hôte : arrête le quiz en cours et ramène tout le monde au lobby (salle ouverte). */
  async function handleMultiBackToLobby() {
    if (!multiRoom || !multiPlayerId) return
    setMultiBusy(true)
    setError(null)
    try {
      const res = await backRoomToLobby({
        code: multiRoom.code,
        playerId: multiPlayerId,
        pickingTheme: false,
      })
      setMultiRoom(res.room)
      setAudit([])
      setScreen('multi-lobby')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
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
      if (res.room.status === 'finished') {
        setError(null)
        setScreen('multi-score')
      }
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
      // Forcer l’état renvoyé (évite qu’un poll stale annule le begin)
      setMultiRoom(res.room)
      setTypingBoard(null)
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
      setMultiRoom(res.room)
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
      setMultiRoom(res.room)
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
      if (res.room.status === 'finished') {
        setError(null)
        setScreen('multi-score')
      }
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
    screen !== 'multi-theme'
  const isHomeLike =
    screen === 'mode' ||
    screen === 'home' ||
    screen === 'multi-gate' ||
    (screen === 'multi-theme' && !multiRoom)

  return (
    <div
      className={`app${isHomeLike ? ' app--home' : ''}${screen === 'minigames' ? ' app--center' : ''}`}
    >
      <div className="app__atmosphere" aria-hidden />
      {typingBoard && (
        <TypingScorePopup
          entries={typingBoard.entries}
          playerId={typingBoard.kind === 'multi' ? multiPlayerId : 'solo'}
          onClose={() => setTypingBoard(null)}
        />
      )}
      {(() => {
        const chatId = multiPlayerId ?? getOrCreatePlayerId()
        const preferred =
          multiName.trim().length >= 2
            ? multiName.trim()
            : session.playerName.trim().length >= 2
              ? session.playerName.trim()
              : ''
        const inRoom = Boolean(multiRoom && multiPlayerId)
        return (
          <MultiChat
            playerId={chatId}
            preferredName={preferred}
            roomCode={inRoom ? multiRoom!.code : null}
            roomChatEnabled={inRoom}
          />
        )
      })()}
      {showHeader && (
        <header className="app__header">
          <p className="brand">Quizz By IA</p>
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
                // Ne quitte JAMAIS la salle — solo reset + accueil
                goHomeKeepRoom()
              }}
            >
              Accueil
            </button>
          </div>
        </header>
      )}

      <main className="app__main">
        {(screen === 'play' ||
          screen === 'tier-result' ||
          screen === 'finished') &&
        session.playMode === 'progression' ? (
          <ProgressBar
            current={session.currentDifficulty}
            finished={screen === 'finished'}
          />
        ) : null}

        {screen === 'mode' && (
          // Ancien écran Solo/Multi — redirigé vers l’accueil thèmes
          <AdminPanel />
        )}

        {screen === 'minigames' && (
          <div className="minigames-hub">
            <WaitMiniGames freePlay mode="solo" />
          </div>
        )}

        {screen === 'home' && (
          <>
            <AdminPanel />
            <HomeSideNav
              onMulti={openMultiFromHome}
              onMinigames={() => {
                setError(null)
                setScreen('minigames')
              }}
              inRoom={Boolean(multiRoom && multiPlayerId)}
              roomCode={multiRoom?.code}
              onReturnToRoom={returnToActiveRoom}
            />
            <ThemeSelect
              onStart={handleStart}
              variant="solo"
              busy={false}
              error={error}
              soloLocked={Boolean(multiRoom && multiPlayerId)}
              soloLockHint={
                multiRoom
                  ? `Salle ${multiRoom.code} ouverte — quitte la salle pour jouer en solo.`
                  : undefined
              }
              onReturnToRoom={returnToActiveRoom}
            />
          </>
        )}

        {screen === 'multi-gate' && (
          <MultiGate
            onCreate={handleMultiCreateName}
            onJoin={handleMultiJoin}
            onBack={() => setScreen('home')}
            busy={multiBusy}
            error={error}
          />
        )}

        {screen === 'multi-theme' && (
          <ThemeSelect
            onStart={handleMultiThemeStart}
            variant="multi"
            existingRoom={Boolean(multiRoom)}
            busy={multiBusy}
            error={error}
            onBack={() => void handleLeaveThemePage()}
            backLabel={
              multiRoom ? '← Retour à la salle' : '← Retour'
            }
          />
        )}

        {screen === 'loading' && (
          <div className="loading loading--duel" role="status">
            <WaitMiniGames
              mode="solo"
              statusLabel={statusMsg ?? 'Génération du quiz…'}
              onScoreChange={handleSoloTypingScore}
              questionsDone={genQuestionsDone}
              questionsTotal={10}
              aiSource={genAiSource}
            />
            <button
              type="button"
              className="btn btn--secondary loading__cancel"
              onClick={handleCancelSoloGenerate}
            >
              Annuler la génération
            </button>
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
              theme={session.theme}
            />
            <AnswerAudit
              entries={audit}
              compact
              theme={session.theme}
              difficulty={session.currentDifficulty}
              mode="solo"
            />
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
            <AnswerAudit
              entries={audit}
              compact={false}
              theme={session.theme}
              difficulty={tierSnapshot.difficulty}
              mode="solo"
            />
          </>
        )}

        {screen === 'finished' && (
          <Results
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
            onCloseRoom={() => void handleMultiClose()}
            onKick={(id) => void handleMultiKick(id)}
            onChangeTheme={() => handleMultiChangeTheme('lobby')}
            onCancelGenerate={() => void handleMultiCancelGenerate()}
            onTypingScore={handleMultiTypingScore}
          />
        )}

        {screen === 'multi-play' && multiRoom && multiPlayerId && (
          <>
            {multiRoom.playMode === 'progression' ? (
              <ProgressBar
                current={
                  multiRoom.difficulty === 'medium' ||
                  multiRoom.difficulty === 'hard'
                    ? multiRoom.difficulty
                    : 'easy'
                }
              />
            ) : null}
            <MultiPlay
              room={multiRoom}
              playerId={multiPlayerId}
              onAnswer={handleMultiAnswer}
              onBegin={() => void handleMultiBegin()}
              onPause={() => void handleMultiPause()}
              onResume={() => void handleMultiResume()}
              onNext={() => void handleMultiNext()}
              onLeave={() => void handleMultiLeave()}
              onBackToLobby={() => void handleMultiBackToLobby()}
              onKick={(id) => void handleMultiKick(id)}
              busy={multiBusy}
            />
            <AnswerAudit
              entries={audit}
              compact
              theme={multiRoom.theme}
              difficulty={multiRoom.difficulty}
              mode="multi"
            />
          </>
        )}

        {screen === 'multi-score' && multiRoom && multiPlayerId && (
          <>
            <MultiScoreboard
              room={multiRoom}
              playerId={multiPlayerId}
              busy={multiBusy}
              error={error}
              onReplay={handleMultiStart}
              onContinueTier={() => void handleMultiContinueTier()}
              onRestartTiers={() => void handleMultiRestartTiers()}
              onSetDifficulty={handleMultiSetDifficulty}
              onBackToLobby={() => void handleMultiBackToLobby()}
              onLeave={() => void handleMultiLeave()}
              onKick={(id) => void handleMultiKick(id)}
            />
            <AnswerAudit
              entries={audit}
              compact={false}
              theme={multiRoom.theme}
              difficulty={multiRoom.difficulty}
              mode="multi"
            />
          </>
        )}

        {statusMsg && screen === 'play' && (
          <p className="app__hint">{statusMsg}</p>
        )}
      </main>
    </div>
  )
}
