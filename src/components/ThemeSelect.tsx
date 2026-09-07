import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  ORBIT_THEMES,
  formatThemeQuery,
  getThemeById,
  officialSubsForTheme,
  type ThemeTile,
} from '../lib/themes'
import { resolveQuizScope, themeSupportsFrScope } from '../lib/quizScope'
import { drawRandomThemePair } from '../lib/randomTheme'
import {
  DEEZER_GLOBAL_OPTION,
  DEEZER_STYLE_OPTIONS,
  formatDeezerTheme,
  getDeezerDecadeOptions,
  isDeezerStyleNativeToScope,
  scopeForDeezerStyle,
  deezerStyleScopeHint,
  type DeezerPoolMode,
} from '../lib/deezerStyles'
import type { Difficulty, QuizContentMode, QuizScope } from '../types'
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  QUIZ_SCOPE_LABELS,
} from '../types'
import type { AiProvider } from '../types'
import { ThemeIcon } from './ThemeIcon'
import { ensureCuratedThemeFromPlay } from '../lib/curatedBank'
import {
  FLAG_CHOICE_COUNT,
  FLAG_DIFFICULTIES,
  FLAG_DIFFICULTY_LABELS,
  FLAG_MAX_COUNT,
  clampFlagCount,
  flagCountSteps,
  flagDifficultyToQuestionDifficulty,
  type FlagDifficulty,
} from '../lib/flagQuiz'
import { type PenduMode } from '../lib/pendu'
import { type PenduWordSource } from '../lib/penduWords'
import './ThemeSelect.css'
import './theme-selector.css'

const WHEEL_THEMES = ORBIT_THEMES
const WHEEL_N = WHEEL_THEMES.length
const WHEEL_SIZE = 700
const WHEEL_CX = WHEEL_SIZE / 2
const WHEEL_CY = WHEEL_SIZE / 2
const WHEEL_R = WHEEL_SIZE * 0.42
const WHEEL_MARKER = 90

const wheelAngleOf = (idx: number) => idx * (360 / WHEEL_N) - 90
const norm360 = (a: number) => ((a % 360) + 360) % 360

function wheelShortLabel(t: ThemeTile) {
  if (t.id === 'pregen') return 'Pré-généré'
  return t.label
}

export type GameModeOption = 'progression' | 'free'

export interface ThemeStartOptions {
  timerEnabled: boolean
  /** Deezer : démarrer l’extrait automatiquement */
  audioAutoplay: boolean
  difficulty: Difficulty
  gameMode: GameModeOption
  aiProvider: AiProvider
  quizMode: QuizContentMode
  flagDifficulty?: FlagDifficulty
  flagCount?: number
  penduVariant?: 'duo' | 'multi'
  penduWordSource?: 'bank' | 'ai'
}

export type PenduStartPayload = {
  mode: PenduMode
  names?: string[]
  difficulty?: Difficulty
  words?: string[]
  wordSource?: PenduWordSource
}

const AI_OPTIONS: { id: AiProvider; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Rotation Gemini / Groq' },
  { id: 'groq', label: 'Groq', hint: 'Free rapide' },
  { id: 'gemini', label: 'Gemini', hint: 'Free Google' },
]

interface ThemeSelectProps {
  onStart: (
    theme: string,
    playerName: string,
    scope: QuizScope,
    options: ThemeStartOptions,
  ) => void
  /** Accueil solo ou création / changement de thème multi */
  variant?: 'solo' | 'multi'
  /** Salle multi déjà créée — valide le thème sans recréer la salle */
  existingRoom?: boolean
  /** Retour vers le choix Solo / Multi / lobby */
  onBack?: () => void
  backLabel?: string
  busy?: boolean
  error?: string | null
  /** Solo bloqué tant qu’une salle multi est ouverte */
  soloLocked?: boolean
  /** Type Pendu — lance le jeu local (pas de génération IA) */
  onPendu?: (payload: PenduStartPayload) => void
  /** Joueurs déjà dans la salle (multi) — Duo grisé si > 2 */
  playerCount?: number
  /** Barre nav icônes sous le titre (accueil) */
  topDock?: ReactNode
}

export function ThemeSelect({
  onStart,
  variant = 'solo',
  existingRoom = false,
  onBack,
  backLabel,
  busy,
  error,
  soloLocked = false,
  onPendu,
  playerCount = 1,
  topDock,
}: ThemeSelectProps) {
  const [themeId, setThemeId] = useState<string | null>(null)
  const [subtheme, setSubtheme] = useState('Général')
  const [customTheme, setCustomTheme] = useState('')
  const [customSubsByTheme, setCustomSubsByTheme] = useState<
    Record<string, string[]>
  >({})
  const [orphanCustomSubs, setOrphanCustomSubs] = useState<string[]>([])
  /** Parent catalogue si Custom → bascule saisie manuelle (centre) */
  const [customFromThemeId, setCustomFromThemeId] = useState<string | null>(
    null,
  )
  const [scope, setScope] = useState<QuizScope>('fr')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [gameMode, setGameMode] = useState<GameModeOption>('free')
  const [aiProvider, setAiProvider] = useState<AiProvider>('auto')
  const [quizMode, setQuizMode] = useState<QuizContentMode>('standard')
  const [deezerPoolMode, setDeezerPoolMode] = useState<DeezerPoolMode>('global')
  const [deezerStyleId, setDeezerStyleId] = useState<string>('pop')
  const [deezerDecadeId, setDeezerDecadeId] = useState<string>('all')
  const [deezerQuery, setDeezerQuery] = useState('')
  const [flagDifficulty, setFlagDifficulty] = useState<FlagDifficulty>('easy')
  const [flagCount, setFlagCount] = useState(10)
  const [isPendu, setIsPendu] = useState(false)
  const [penduMode, setPenduMode] = useState<PenduMode>('solo')
  const [penduWordSource, setPenduWordSource] = useState<PenduWordSource>('bank')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const rafRef = useRef<number | null>(null)
  const spinTimerRef = useRef<number | null>(null)

  const isMulti = variant === 'multi'
  const duoLocked = isMulti && playerCount > 2
  const showDifficulty = gameMode === 'free'
  const isDeezer = quizMode === 'audio' && !isPendu
  const isFlags = themeId === 'drapeaux' && !isPendu

  const parent = themeId ? getThemeById(themeId) : undefined
  const officialSubs = themeId ? officialSubsForTheme(themeId) : []
  const generatedUnderTheme =
    themeId && themeId !== 'custom' && themeId !== 'pregen'
      ? (customSubsByTheme[themeId] ?? [])
      : []
  const orphanSubs = orphanCustomSubs
  const deezerStyle =
    DEEZER_STYLE_OPTIONS.find((s) => s.id === deezerStyleId) ??
    DEEZER_STYLE_OPTIONS[0]

  /** Thèmes hors ancrage FR → bascule auto International (sauf Deezer / Aléatoire). */
  useEffect(() => {
    if (isDeezer || themeId === 'aleatoire') return
    const label =
      customTheme.trim() ||
      (parent && themeId !== 'custom' && themeId !== 'pregen'
        ? formatThemeQuery(parent.label, subtheme === 'Custom' ? 'Général' : subtheme)
        : '')
    if (!label) return
    if (scope === 'fr' && !themeSupportsFrScope(label)) {
      setScope('international')
    }
  }, [isDeezer, customTheme, parent, themeId, subtheme, scope])

  useEffect(() => {
    if (duoLocked && penduMode === 'duo') setPenduMode('multi')
  }, [duoLocked, penduMode])

  useEffect(() => {
    if (!isFlags) return
    setGameMode('free')
    setQuizMode('standard')
    setFlagCount((n) => clampFlagCount(flagDifficulty, n))
  }, [isFlags, flagDifficulty])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/curated-bank?slots=1')
      .then((r) => r.json())
      .then(
        (data: {
          byThemeId?: Record<string, unknown>
          orphans?: unknown
          subs?: unknown
        }) => {
          if (cancelled) return
          const by: Record<string, string[]> = {}
          if (data.byThemeId && typeof data.byThemeId === 'object') {
            for (const [id, list] of Object.entries(data.byThemeId)) {
              if (Array.isArray(list)) {
                by[id] = list.map(String).filter(Boolean)
              }
            }
          }
          setCustomSubsByTheme(by)
          const orphans = Array.isArray(data.orphans)
            ? data.orphans.map(String).filter(Boolean)
            : Array.isArray(data.subs)
              ? data.subs.map(String).filter(Boolean)
              : []
          setOrphanCustomSubs(orphans)
        },
      )
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (themeId === 'custom' || themeId === 'pregen' || themeId === 'aleatoire') {
      if (subtheme !== 'Général') setSubtheme('Général')
    }
  }, [themeId, subtheme])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (spinTimerRef.current) window.clearTimeout(spinTimerRef.current)
    },
    [],
  )

  function deezerThemeLabel(): string {
    return formatDeezerTheme({
      mode: deezerPoolMode,
      styleLabel: deezerStyle.label,
      decadeId: deezerDecadeId,
      custom: deezerQuery,
    })
  }

  function selectTheme(t: ThemeTile) {
    setThemeId(t.id)
    setSubtheme('Général')
    setCustomTheme('')
    setCustomFromThemeId(null)
    setOpenDropdown(null)
    if (t.id === 'drapeaux') {
      setGameMode('free')
      setQuizMode('standard')
      setIsPendu(false)
    }
  }

  function exactRotationFor(idx: number, aroundRotation: number, extraSpins: number) {
    const targetAngle = wheelAngleOf(idx)
    const base = norm360(norm360(WHEEL_MARKER) - targetAngle)
    const fullTurns = Math.round(aroundRotation / 360) + extraSpins
    return fullTurns * 360 + base
  }

  function startSpin() {
    if (spinning || busy) return
    const playable = WHEEL_THEMES.map((t, i) => (t.soon ? -1 : i)).filter((i) => i >= 0)
    if (playable.length === 0) return
    const target = playable[Math.floor(Math.random() * playable.length)]
    setSpinning(true)
    setOpenDropdown(null)

    const from = rotation
    let to = exactRotationFor(target, rotation, 4)
    if (to <= from) to += 360

    const duration = 3200
    const start = performance.now()

    function animate(now: number) {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setRotation(from + (to - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setRotation(to)
        setSpinning(false)
        selectTheme(WHEEL_THEMES[target])
      }
    }
    rafRef.current = requestAnimationFrame(animate)
  }

  function spinRandomMobile() {
    if (spinning || busy) return
    const playable = WHEEL_THEMES.filter((t) => !t.soon)
    if (playable.length === 0) return
    const winner = playable[Math.floor(Math.random() * playable.length)]
    setSpinning(true)
    setOpenDropdown(null)
    let step = 0
    const totalSteps = 22
    let delay = 60

    function tick() {
      const t = playable[step % playable.length]
      setThemeId(t.id)
      setSubtheme('Général')
      setCustomTheme('')
      setCustomFromThemeId(null)
      step++
      delay += 6
      if (step < totalSteps || playable[step % playable.length] !== winner) {
        spinTimerRef.current = window.setTimeout(tick, delay)
      } else {
        setSpinning(false)
        selectTheme(winner)
      }
    }
    tick()
  }

  function toggleDropdown(key: string) {
    setOpenDropdown((cur) => (cur === key ? null : key))
  }

  /** Custom d’un thème → même flux que la barre manuelle du centre */
  function enterManualFromCustom() {
    if (!themeId || themeId === 'custom' || themeId === 'pregen') return
    setCustomFromThemeId(themeId)
    setThemeId(null)
    setSubtheme('Général')
    setCustomTheme('')
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>(
        '.custom-theme input',
      )
      for (const input of inputs) {
        if (input.offsetParent !== null) {
          input.focus()
          break
        }
      }
    })
  }

  function playThemeLabel(): string {
    const manual = customTheme.trim()
    if (manual) return manual
    if (!parent || !themeId) return ''
    if (themeId === 'aleatoire') return parent.label
    if (themeId === 'custom' || themeId === 'pregen') return ''
    if (generatedUnderTheme.includes(subtheme)) return subtheme.trim()
    if (subtheme === 'Custom') return ''
    return formatThemeQuery(parent.label, subtheme)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || (variant === 'solo' && soloLocked)) return

    if (isPendu) {
      if (!isMulti) {
        onPendu?.({ mode: 'solo', difficulty, wordSource: penduWordSource })
        return
      }
      const variantPendu: 'duo' | 'multi' =
        duoLocked || penduMode !== 'duo' ? 'multi' : 'duo'
      onStart(variantPendu === 'duo' ? 'Pendu — Duo' : 'Pendu — Multi', '', 'fr', {
        timerEnabled: false,
        audioAutoplay: false,
        difficulty,
        gameMode: 'free',
        aiProvider,
        quizMode: 'pendu',
        penduVariant: variantPendu,
        penduWordSource,
      })
      return
    }

    if (isDeezer) {
      const t = deezerThemeLabel()
      if (!t) return
      onStart(t, '', scope, {
        timerEnabled,
        audioAutoplay: true,
        difficulty: gameMode === 'free' ? difficulty : 'easy',
        gameMode,
        aiProvider,
        quizMode: 'audio',
      })
      return
    }

    if (themeId === 'drapeaux') {
      const t = parent?.label ?? 'Drapeaux'
      onStart(t, '', 'international', {
        timerEnabled,
        audioAutoplay: false,
        difficulty: flagDifficultyToQuestionDifficulty(flagDifficulty),
        gameMode: 'free',
        aiProvider,
        quizMode: 'standard',
        flagDifficulty,
        flagCount: clampFlagCount(flagDifficulty, flagCount),
      })
      return
    }

    if (themeId === 'aleatoire') {
      const picked = drawRandomThemePair()
      const t = picked.query
      const effectiveScope = resolveQuizScope(t, scope)
      if (effectiveScope !== scope) setScope(effectiveScope)
      ensureCuratedThemeFromPlay(t, {
        themeId: picked.themeId,
        subTheme: picked.sub,
      })
      onStart(t, '', effectiveScope, {
        timerEnabled,
        audioAutoplay: false,
        difficulty: gameMode === 'free' ? difficulty : 'easy',
        gameMode,
        aiProvider,
        quizMode: 'standard',
      })
      return
    }

    const t = playThemeLabel()
    if (!t) return
    const effectiveScope = resolveQuizScope(t, scope)
    if (effectiveScope !== scope) setScope(effectiveScope)
    const placeUnder =
      customFromThemeId ||
      (themeId &&
      themeId !== 'custom' &&
      themeId !== 'pregen' &&
      generatedUnderTheme.includes(subtheme)
        ? themeId
        : null)
    ensureCuratedThemeFromPlay(
      t,
      placeUnder ? { themeId: placeUnder, subTheme: t } : undefined,
    )
    onStart(t, '', effectiveScope, {
      timerEnabled,
      audioAutoplay: false,
      difficulty: gameMode === 'free' ? difficulty : 'easy',
      gameMode,
      aiProvider,
      quizMode: 'standard',
    })
  }

  const activeLabel = isDeezer
    ? deezerThemeLabel()
    : playThemeLabel()
  const canPlay = isPendu
    ? !busy &&
      !spinning &&
      (isMulti
        ? true
        : Boolean(onPendu) && !soloLocked)
    : Boolean(activeLabel) && !busy && !spinning && !(variant === 'solo' && soloLocked)
  const deezerUsingCustom = Boolean(deezerQuery.trim())

  function renderSubthemes(opts?: { inPanel?: boolean; showChosen?: boolean }) {
    if (!parent || customTheme.trim()) return null
    if (themeId === 'drapeaux') {
      const inPanel = Boolean(opts?.inPanel)
      return (
        <fieldset
          className={`subthemes${inPanel ? ' subthemes--in-panel' : ''}`}
        >
          <legend className="subthemes__title">Drapeaux du monde</legend>
          <p className="subthemes__chosen">
            {FLAG_CHOICE_COUNT[flagDifficulty]} choix · pool{' '}
            {flagDifficulty === 'easy'
              ? '44 pays (très connus)'
              : flagDifficulty === 'medium'
                ? '132 pays'
                : '196 pays'}{' '}
            · max {FLAG_MAX_COUNT[flagDifficulty]}
          </p>
          {opts?.showChosen && (
            <p className="subthemes__chosen">
              Partie : <strong>{flagCount} drapeaux</strong>
            </p>
          )}
        </fieldset>
      )
    }
    if (themeId === 'aleatoire') {
      const inPanel = Boolean(opts?.inPanel)
      return (
        <fieldset
          className={`subthemes${inPanel ? ' subthemes--in-panel' : ''}`}
        >
          <legend className="subthemes__title">Aléatoire</legend>
          <p className="subthemes__chosen">
            Un thème + sous-thème au hasard — sans rejouer le même couple tant
            que tous n’ont pas tourné.
          </p>
        </fieldset>
      )
    }
    const inPanel = Boolean(opts?.inPanel)
    const isOrbitCustom = themeId === 'custom'
    const primarySubs = isOrbitCustom
      ? ['Général', ...orphanSubs.filter((s) => s !== 'Général')]
      : officialSubs

    return (
      <fieldset
        className={`subthemes${inPanel ? ' subthemes--in-panel' : ''}`}
      >
        <legend className="subthemes__title">
          Sous-thèmes — {parent.label}
        </legend>
        <div className="subthemes__grid" role="group">
          {primarySubs.map((s) => {
            const isCustomChip = s === 'Custom'
            const selected =
              subtheme === s ||
              (isCustomChip && generatedUnderTheme.includes(subtheme))
            return (
              <button
                key={s}
                type="button"
                className={`subtheme-chip${selected ? ' is-selected' : ''}${isCustomChip ? ' subtheme-chip--custom' : ''}`}
                onClick={() => {
                  if (isCustomChip) {
                    enterManualFromCustom()
                    return
                  }
                  setSubtheme(s)
                  setCustomFromThemeId(null)
                }}
                disabled={busy}
                aria-pressed={selected}
                title={
                  isCustomChip
                    ? 'Générer un thème libre (comme la saisie manuelle)'
                    : s
                }
              >
                {s}
              </button>
            )
          })}
        </div>
        {generatedUnderTheme.length > 0 && (
          <div className="subthemes__generated">
            <p className="subthemes__generated-title">
              Custom — déjà associés
            </p>
            <div className="subthemes__grid" role="group">
              {generatedUnderTheme.map((s) => (
                <button
                  key={`gen-${s}`}
                  type="button"
                  className={`subtheme-chip subtheme-chip--gen${subtheme === s ? ' is-selected' : ''}`}
                  onClick={() => {
                    setSubtheme(s)
                    setCustomTheme('')
                    setCustomFromThemeId(null)
                  }}
                  disabled={busy}
                  aria-pressed={subtheme === s}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {opts?.showChosen && (
          <p className="subthemes__chosen">
            Thème choisi : <strong>{activeLabel || '…'}</strong>
          </p>
        )}
      </fieldset>
    )
  }

  const brandBlock = (
    <div className="brand-hero">
      <span className="brand-hero__crown" aria-hidden>
        <svg viewBox="0 0 64 40" width="28" height="17">
          <path
            fill="#f0c14b"
            d="M8 32 4 12l14 10L32 4l14 18 14-10-4 20H8z"
          />
          <rect x="6" y="30" width="52" height="6" rx="2" fill="#e0a820" />
          <circle cx="4" cy="12" r="3" fill="#ffe08a" />
          <circle cx="32" cy="4" r="3.5" fill="#ffe08a" />
          <circle cx="60" cy="12" r="3" fill="#ffe08a" />
        </svg>
      </span>
      <h1 className="brand-hero__title">Quizz By IA</h1>
      <p className="brand-hero__tagline">
        {existingRoom
          ? 'Change de thème — la salle et les joueurs restent.'
          : isDeezer
            ? 'Quiz musical avec vrais extraits Deezer'
            : isPendu
              ? isMulti
                ? 'Pendu en salle — Duo ou Multi · Facile / Moyen / Difficile'
                : 'Pendu solo — petits mots, mélange, ou grands / composés'
              : 'Choisis un thème, puis joue !'}
      </p>
    </div>
  )

  const playButton = (
    <button className="btn-jouer" type="submit" disabled={!canPlay}>
      <span className="btn-jouer__icon" aria-hidden>
        ▶
      </span>
      {busy
        ? 'Préparation…'
        : isPendu
          ? isMulti
            ? existingRoom
              ? 'Valider le pendu'
              : 'Créer la salle'
            : 'Jouer au pendu'
          : existingRoom
            ? 'Valider le thème'
            : isMulti
              ? isDeezer
                ? 'Créer la salle musicale'
                : 'Créer la salle'
              : soloLocked
                ? 'Solo indisponible'
                : isDeezer
                  ? 'Lancer le quiz musical'
                  : 'Jouer'}
    </button>
  )

  const typeLabel = isPendu ? 'Pendu' : isDeezer ? 'Deezer' : 'Texte IA'

  function applyScope(s: QuizScope) {
    if (s === 'fr' && !isDeezer && themeId !== 'aleatoire') {
      const label =
        customTheme.trim() ||
        (parent && themeId !== 'custom' && themeId !== 'pregen'
          ? parent.label
          : '')
      if (label && !themeSupportsFrScope(label)) {
        setScope('international')
        return
      }
    }
    setScope(s)
    if (
      deezerPoolMode === 'style' &&
      !isDeezerStyleNativeToScope(deezerStyleId, s)
    ) {
      setDeezerStyleId(s === 'fr' ? 'variete' : 'pop')
    }
  }

  const settingsFields = (
    <div className="game-home__options">
      <div className="qz-type-row">
        <div className="qz-setting-wrap" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="qz-type-pill"
            onClick={() => toggleDropdown('type')}
            disabled={busy || spinning}
            aria-expanded={openDropdown === 'type'}
            aria-haspopup="listbox"
          >
            {typeLabel}
            <IconChevron />
          </button>
          {openDropdown === 'type' && (
            <div className="qz-dropdown" role="listbox" aria-label="Type">
              <button
                type="button"
                className={`qz-dropdown-option${!isDeezer && !isPendu ? ' selected' : ''}`}
                onClick={() => {
                  setIsPendu(false)
                  setQuizMode('standard')
                  setOpenDropdown(null)
                }}
              >
                Texte IA
              </button>
              <button
                type="button"
                className={`qz-dropdown-option${isDeezer ? ' selected' : ''}`}
                onClick={() => {
                  setIsPendu(false)
                  setQuizMode('audio')
                  setGameMode('free')
                  setOpenDropdown(null)
                }}
              >
                Deezer
              </button>
              <button
                type="button"
                className={`qz-dropdown-option${isPendu ? ' selected' : ''}`}
                onClick={() => {
                  setIsPendu(true)
                  setQuizMode('standard')
                  setGameMode('free')
                  setPenduMode(
                    isMulti ? (playerCount > 2 ? 'multi' : 'duo') : 'solo',
                  )
                  setOpenDropdown(null)
                }}
                disabled={!isMulti && !onPendu}
              >
                Pendu
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="qz-settings-row">
        {!isFlags && !isPendu && (
          <div className="qz-setting-wrap" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="qz-setting-tile"
              onClick={() => toggleDropdown('portee')}
              disabled={busy || spinning}
              aria-label={`Portée : ${QUIZ_SCOPE_LABELS[scope]}`}
            >
              <div className="qz-setting-label">Portée</div>
              <div className="qz-setting-value">
                {scope === 'fr' ? <FrFlagIcon /> : <WorldIcon />}
              </div>
            </button>
            {openDropdown === 'portee' && (
              <div className="qz-dropdown" role="listbox" aria-label="Portée">
                <button
                  type="button"
                  className={`qz-dropdown-option${scope === 'fr' ? ' selected' : ''}`}
                  onClick={() => {
                    applyScope('fr')
                    setOpenDropdown(null)
                  }}
                >
                  <FrFlagIcon /> France
                </button>
                <button
                  type="button"
                  className={`qz-dropdown-option${scope === 'international' ? ' selected' : ''}`}
                  onClick={() => {
                    applyScope('international')
                    setOpenDropdown(null)
                  }}
                >
                  <WorldIcon /> Monde
                </button>
              </div>
            )}
          </div>
        )}

        {showDifficulty && !isFlags && !isPendu && (
          <SettingDropdown
            label="Diff."
            value={DIFFICULTY_LABELS[difficulty]}
            isOpen={openDropdown === 'difficulte'}
            disabled={busy || spinning}
            options={DIFFICULTIES.map((d) => ({
              id: d,
              label: DIFFICULTY_LABELS[d],
            }))}
            onToggle={() => toggleDropdown('difficulte')}
            onSelect={(id) => {
              setDifficulty(id as Difficulty)
              setOpenDropdown(null)
            }}
          />
        )}

        {!isFlags && !isPendu && (
          <SettingDropdown
            label="Mode"
            value={gameMode === 'progression' ? 'Paliers' : 'Libre'}
            isOpen={openDropdown === 'mode'}
            disabled={busy || spinning}
            options={[
              { id: 'progression', label: 'Paliers', disabled: isDeezer },
              { id: 'free', label: 'Libre' },
            ]}
            onToggle={() => toggleDropdown('mode')}
            onSelect={(id) => {
              if (id === 'progression' && isDeezer) return
              setGameMode(id as GameModeOption)
              setOpenDropdown(null)
            }}
          />
        )}

        {!isPendu && !isDeezer && !isFlags && (
          <SettingDropdown
            label="IA"
            value={
              AI_OPTIONS.find((o) => o.id === aiProvider)?.label ?? 'Auto'
            }
            isOpen={openDropdown === 'ia'}
            disabled={busy || spinning}
            options={AI_OPTIONS.map((opt) => ({
              id: opt.id,
              label: opt.label,
            }))}
            onToggle={() => toggleDropdown('ia')}
            onSelect={(id) => {
              setAiProvider(id as AiProvider)
              setOpenDropdown(null)
            }}
          />
        )}

        {!isPendu && (
          <div className="qz-setting-wrap" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="qz-setting-tile"
              onClick={() => setTimerEnabled((v) => !v)}
              disabled={busy || spinning}
              role="switch"
              aria-checked={timerEnabled}
            >
              <div className="qz-setting-label">Chrono</div>
              <div className={`qz-setting-value${timerEnabled ? ' on' : ''}`}>
                {timerEnabled ? 'Oui' : 'Non'}
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  )

  const extraSettings = (
    <>
      {isPendu && isMulti && (
        <fieldset className="scope-field">
          <legend className="scope-field__label">Partie</legend>
          <div
            className="scope-field__toggle scope-field__toggle--2"
            role="group"
            aria-label="Mode pendu"
          >
            <button
              type="button"
              className={`scope-chip${penduMode === 'duo' ? ' is-selected' : ''}`}
              onClick={() => setPenduMode('duo')}
              disabled={busy || duoLocked}
              aria-pressed={penduMode === 'duo'}
              title={
                duoLocked
                  ? 'Plus de 2 joueurs dans la salle — Duo indisponible'
                  : 'Équipe · pendu partagé · 2 joueurs'
              }
            >
              Duo
            </button>
            <button
              type="button"
              className={`scope-chip${penduMode === 'multi' ? ' is-selected' : ''}`}
              onClick={() => setPenduMode('multi')}
              disabled={busy}
              aria-pressed={penduMode === 'multi'}
              title="2–8 joueurs · pendu individuel"
            >
              Multi
            </button>
          </div>
          {duoLocked && (
            <p className="subthemes__chosen">
              Duo grisé : plus de 2 joueurs dans la salle
            </p>
          )}
        </fieldset>
      )}

      {isPendu && (
        <fieldset className="scope-field">
          <legend className="scope-field__label">Difficulté</legend>
          <div className="scope-field__toggle" role="group" aria-label="Difficulté pendu">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={`scope-chip${difficulty === d ? ' is-selected' : ''}`}
                onClick={() => setDifficulty(d)}
                disabled={busy}
                aria-pressed={difficulty === d}
                title={
                  d === 'easy'
                    ? 'Petits mots (5–6 lettres)'
                    : d === 'hard'
                      ? 'Grands mots et mots composés'
                      : 'Tous les mots simples'
                }
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
          <p className="subthemes__chosen">
            {difficulty === 'easy'
              ? 'Petits mots · 5–6 lettres'
              : difficulty === 'hard'
                ? 'Grands mots (8+ lettres) et composés · tirets déjà visibles'
                : 'Mélange de toute la banque'}
          </p>
        </fieldset>
      )}

      {isPendu && (
        <fieldset className="scope-field">
          <legend className="scope-field__label">Mots</legend>
          <div
            className="scope-field__toggle scope-field__toggle--2"
            role="group"
            aria-label="Source des mots pendu"
          >
            <button
              type="button"
              className={`scope-chip${penduWordSource === 'bank' ? ' is-selected' : ''}`}
              onClick={() => setPenduWordSource('bank')}
              disabled={busy}
              aria-pressed={penduWordSource === 'bank'}
              title="Banque locale uniquement — recycle si tout est joué"
            >
              Banque locale
            </button>
            <button
              type="button"
              className={`scope-chip${penduWordSource === 'ai' ? ' is-selected' : ''}`}
              onClick={() => setPenduWordSource('ai')}
              disabled={busy}
              aria-pressed={penduWordSource === 'ai'}
              title="Banque puis mots IA (log admin)"
            >
              Banque + IA
            </button>
          </div>
          <p className="subthemes__chosen">
            {penduWordSource === 'bank'
              ? 'Pas d’IA — mots aléatoires dans la banque quand tout est joué'
              : 'Nouveaux mots IA quand la banque est épuisée (onglet Pendu admin)'}
          </p>
        </fieldset>
      )}

      {isFlags && (
        <>
          <fieldset className="scope-field">
            <legend className="scope-field__label">Difficulté</legend>
            <div
              className="scope-field__toggle scope-field__toggle--4"
              role="group"
              aria-label="Difficulté drapeaux"
            >
              {FLAG_DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`scope-chip${flagDifficulty === d ? ' is-selected' : ''}`}
                  onClick={() => {
                    setFlagDifficulty(d)
                    setFlagCount((n) => clampFlagCount(d, n))
                  }}
                  disabled={busy}
                  aria-pressed={flagDifficulty === d}
                  title={`${FLAG_CHOICE_COUNT[d]} choix · max ${FLAG_MAX_COUNT[d]}`}
                >
                  {FLAG_DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="scope-field">
            <legend className="scope-field__label">Nombre de drapeaux</legend>
            <div className="flag-count-grid" role="group" aria-label="Nombre">
              {flagCountSteps(flagDifficulty).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`subtheme-chip${flagCount === n ? ' is-selected' : ''}`}
                  onClick={() => setFlagCount(n)}
                  disabled={busy}
                  aria-pressed={flagCount === n}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </>
  )

  const customThemeField = (
    <label className="custom-theme custom-theme--center">
      <span className="custom-theme__label visually-hidden">
        Écrire ton propre thème
      </span>
      <input
        value={customTheme}
        onChange={(e) => {
          const v = e.target.value
          setCustomTheme(v)
          if (v.trim()) {
            // Saisie manuelle pure (pas via Custom d’un thème)
            if (!customFromThemeId) {
              setThemeId(null)
              setSubtheme('Général')
            }
          } else {
            setCustomFromThemeId(null)
          }
        }}
        placeholder={
          customFromThemeId
            ? `Thème libre sous ${getThemeById(customFromThemeId)?.label ?? 'ce thème'}…`
            : 'Ex. Musique — K-pop…'
        }
        maxLength={80}
        enterKeyHint="go"
        disabled={busy}
      />
    </label>
  )

  function orbitCenter() {
    return (
      <div className="game-home__center">
        {settingsFields}
        {isFlags ? null : customThemeField}
        {playButton}
      </div>
    )
  }

  function renderOrbitBubble(t: ThemeTile, keyPrefix = '') {
    const soon = Boolean(t.soon)
    return (
      <button
        key={`${keyPrefix}${t.id}`}
        type="button"
        className={`theme-bubble${themeId === t.id && !customTheme && !soon ? ' is-selected' : ''}${soon ? ' theme-bubble--soon' : ''}`}
        style={
          {
            '--angle': `${t.angle}deg`,
            '--bubble-color': t.color,
          } as CSSProperties
        }
        onClick={() => {
          if (soon || spinning) return
          selectTheme(t)
        }}
        disabled={busy || soon || spinning}
        aria-pressed={themeId === t.id && !customTheme && !soon}
        title={soon ? 'Disponible prochainement' : t.label}
        aria-label={
          soon ? `${t.label} — disponible prochainement` : t.label
        }
      >
        <span className="theme-bubble__icon">
          <ThemeIcon id={t.id} />
        </span>
        <span className="theme-bubble__label">{wheelShortLabel(t)}</span>
        {soon && <span className="theme-bubble__soon">Bientôt</span>}
      </button>
    )
  }

  function renderWheelItem(t: ThemeTile, idx: number) {
    const angle = (wheelAngleOf(idx) * Math.PI) / 180
    const x = WHEEL_CX + WHEEL_R * Math.cos(angle)
    const y = WHEEL_CY + WHEEL_R * Math.sin(angle)
    const soon = Boolean(t.soon)
    const selected = themeId === t.id && !customTheme && !soon
    return (
      <button
        key={`wheel-${t.id}`}
        type="button"
        className={`qz-wheel-item${selected ? ' is-selected' : ''}${soon ? ' is-soon' : ''}`}
        style={{
          left: x,
          top: y,
          transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
          ['--i' as string]: idx,
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (soon || spinning) return
          selectTheme(t)
        }}
        disabled={busy || soon || spinning}
        aria-pressed={selected}
        title={soon ? `${t.label} — disponible prochainement` : t.label}
        aria-label={soon ? `${t.label} — disponible prochainement` : t.label}
      >
        <span className="qz-theme-badge" style={{ background: t.color }}>
          <ThemeIcon id={t.id} />
          {soon && <span className="qz-wheel-soon">Bientôt</span>}
        </span>
        <span className="qz-wheel-name">{wheelShortLabel(t)}</span>
      </button>
    )
  }

  return (
    <section
      className={`game-home${isMulti ? ' game-home--multi' : ''}${isDeezer ? ' game-home--deezer' : ''}${isPendu ? ' game-home--pendu' : ''}`}
    >
      {onBack && (
        <button
          type="button"
          className="game-home__back"
          onClick={onBack}
          disabled={busy}
        >
          {backLabel ?? '← Retour'}
        </button>
      )}
      <form
        className="game-home__form"
        onSubmit={handleSubmit}
        onClick={() => setOpenDropdown(null)}
      >
        {isPendu ? (
          <>
            {topDock ? (
              <div className="game-home__top-dock">{topDock}</div>
            ) : null}
            <div className="deezer-layout">
              <div className="deezer-layout__hero">{brandBlock}</div>
              <div className="deezer-layout__settings">
                {settingsFields}
                {extraSettings}
                {playButton}
              </div>
            </div>
          </>
        ) : isDeezer ? (
          <>
            {topDock ? (
              <div className="game-home__top-dock">{topDock}</div>
            ) : null}
            <div className="deezer-layout">
            <div className="deezer-layout__hero">{brandBlock}</div>

            <div className="deezer-panel">
              <fieldset className="subthemes">
                <legend className="subthemes__title">Tirage</legend>
                <div className="subthemes__grid" role="group" aria-label="Tirage">
                  <button
                    type="button"
                    className={`subtheme-chip${deezerPoolMode === 'global' && !deezerUsingCustom ? ' is-selected' : ''}`}
                    onClick={() => {
                      setDeezerPoolMode('global')
                      setDeezerQuery('')
                    }}
                    disabled={busy}
                    aria-pressed={deezerPoolMode === 'global' && !deezerUsingCustom}
                  >
                    {DEEZER_GLOBAL_OPTION.label}
                  </button>
                  <button
                    type="button"
                    className={`subtheme-chip${deezerPoolMode === 'style' && !deezerUsingCustom ? ' is-selected' : ''}`}
                    onClick={() => {
                      setDeezerPoolMode('style')
                      setDeezerQuery('')
                    }}
                    disabled={busy}
                    aria-pressed={deezerPoolMode === 'style' && !deezerUsingCustom}
                  >
                    Hits par style
                  </button>
                </div>
              </fieldset>

              {deezerPoolMode === 'style' && (
                <fieldset className="subthemes">
                  <legend className="subthemes__title">Hits par style</legend>
                  <p className="deezer-panel__hint deezer-panel__hint--scope">
                    {scope === 'fr'
                      ? '🇫🇷 Francophone — les styles mondiaux basculent en 🌍'
                      : '🌍 International — la variété FR bascule en 🇫🇷'}
                  </p>
                  <div className="subthemes__grid" role="group">
                    {DEEZER_STYLE_OPTIONS.map((s) => {
                      const native = isDeezerStyleNativeToScope(s.id, scope)
                      const hint = deezerStyleScopeHint(s.id, scope)
                      const selected =
                        deezerStyleId === s.id && !deezerUsingCustom
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`subtheme-chip${selected ? ' is-selected' : ''}${!native ? ' is-scope-mismatch' : ''}`}
                          onClick={() => {
                            setDeezerPoolMode('style')
                            setDeezerStyleId(s.id)
                            setDeezerQuery('')
                            const nextScope = scopeForDeezerStyle(s.id, scope)
                            if (nextScope !== scope) setScope(nextScope)
                          }}
                          disabled={busy}
                          aria-pressed={selected}
                          title={hint ?? s.label}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )}

              <fieldset className="subthemes">
                <legend className="subthemes__title">Période</legend>
                <div className="subthemes__grid" role="group" aria-label="Période">
                  {getDeezerDecadeOptions().map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`subtheme-chip${deezerDecadeId === d.id && !deezerUsingCustom ? ' is-selected' : ''}`}
                      onClick={() => {
                        setDeezerDecadeId(d.id)
                        setDeezerQuery('')
                      }}
                      disabled={busy}
                      aria-pressed={
                        deezerDecadeId === d.id && !deezerUsingCustom
                      }
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="custom-theme deezer-search">
                <span className="custom-theme__label">
                  Ou recherche libre (artiste, genre, année…)
                </span>
                <input
                  value={deezerQuery}
                  onChange={(e) => setDeezerQuery(e.target.value)}
                  placeholder="Ex. Daft Punk, jazz manouche…"
                  maxLength={80}
                  enterKeyHint="go"
                  disabled={busy}
                />
              </label>

              <p className="subthemes__chosen">
                Thème musical : <strong>{activeLabel}</strong>
              </p>
              <p className="deezer-panel__hint">
                Facile / Moyen = QCM · Difficile = saisie libre : style / décennie
                / hits → titre ou artiste ; artiste précis → titre seul
              </p>
            </div>

            <div className="deezer-layout__settings">
              {settingsFields}
              {extraSettings}
              {playButton}
            </div>
            </div>
          </>
        ) : (
          <>
            <div className="game-home__mobile-brand">{brandBlock}</div>

            {/* Mobile : réglages + thèmes */}
            <div className="game-home__board">
              <aside className="game-home__settings-panel" aria-label="Réglages">
                <p className="game-home__panel-title">Réglages</p>
                {settingsFields}
                {extraSettings}
              </aside>

              <div className="game-home__themes-panel">
                <p className="game-home__panel-title">Thèmes</p>
                <label className="custom-theme custom-theme--in-panel">
                  <span className="custom-theme__label visually-hidden">
                    Écrire ton propre thème
                  </span>
                  <input
                    value={customTheme}
                    onChange={(e) => {
                      const v = e.target.value
                      setCustomTheme(v)
                      if (v.trim()) {
                        if (!customFromThemeId) {
                          setThemeId(null)
                          setSubtheme('Général')
                        }
                      } else {
                        setCustomFromThemeId(null)
                      }
                    }}
                    placeholder={
                      customFromThemeId
                        ? `Thème libre sous ${getThemeById(customFromThemeId)?.label ?? 'ce thème'}…`
                        : 'Ex. Musique — K-pop…'
                    }
                    maxLength={80}
                    enterKeyHint="go"
                  />
                </label>
                <div className="game-home__themes-scroll">
                  <div
                    className="game-home__themes game-home__themes--board"
                    role="group"
                    aria-label="Thèmes"
                  >
                    {ORBIT_THEMES.map((t) => renderOrbitBubble(t))}
                  </div>
                </div>
                {renderSubthemes({ inPanel: true })}
              </div>
            </div>

            <div className="game-home__mobile-play">
              <div className="qz-action-row">
                <button
                  type="button"
                  className="qz-btn qz-btn-secondary"
                  onClick={spinRandomMobile}
                  disabled={busy || spinning}
                >
                  <IconDice /> Aléatoire
                </button>
                <div className="qz-play-wrap">{playButton}</div>
              </div>
            </div>

            {topDock ? (
              <div className="game-home__mobile-nav">{topDock}</div>
            ) : null}

            {/* Desktop : roue */}
            <div className="game-home__stage">
              <div
                className="qz-wheel-wrap"
                style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
                onClick={(e) => e.stopPropagation()}
              >
                <svg
                  width={WHEEL_SIZE}
                  height={WHEEL_SIZE}
                  style={{ position: 'absolute', top: 0, left: 0 }}
                  aria-hidden
                >
                  <circle
                    cx={WHEEL_CX}
                    cy={WHEEL_CY}
                    r={WHEEL_R}
                    fill="none"
                    stroke="var(--qz-border)"
                    strokeWidth="1"
                    strokeDasharray="4 6"
                  />
                </svg>

                <div
                  className="qz-wheel-ring"
                  style={{
                    width: WHEEL_SIZE,
                    height: WHEEL_SIZE,
                    transformOrigin: `${WHEEL_CX}px ${WHEEL_CY}px`,
                    transform: `rotate(${rotation}deg)`,
                  }}
                  role="group"
                  aria-label="Thèmes"
                >
                  {WHEEL_THEMES.map((t, idx) => renderWheelItem(t, idx))}
                </div>

                <div
                  className="qz-wheel-pointer"
                  style={{
                    left: WHEEL_CX,
                    top: WHEEL_CY + WHEEL_R - 34,
                    transform: 'translate(-50%, 0)',
                  }}
                >
                  <div
                    className={`qz-wheel-triangle${spinning ? ' active' : ''}`}
                  />
                </div>

                <div className="qz-wheel-brand">{brandBlock}</div>
                <div className="qz-wheel-panel">{orbitCenter()}</div>

                <div
                  className="qz-wheel-footer"
                  style={{
                    left: WHEEL_CX,
                    top: WHEEL_CY + WHEEL_R - 52,
                  }}
                >
                  {topDock ? (
                    <div className="game-home__wheel-nav">{topDock}</div>
                  ) : null}
                  <button
                    type="button"
                    className="qz-btn qz-btn-secondary qz-wheel-spin"
                    onClick={(e) => {
                      e.stopPropagation()
                      startSpin()
                    }}
                    disabled={busy || spinning}
                  >
                    <IconDice /> Aléatoire
                  </button>
                </div>
              </div>
            </div>

            <div className="game-home__desktop-extras">
              {extraSettings}
              {renderSubthemes({ showChosen: true })}
            </div>
          </>
        )}

        {error && (
          <p className="game-home__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}

function SettingDropdown({
  label,
  value,
  options,
  isOpen,
  onToggle,
  onSelect,
  disabled,
}: {
  label: string
  value: string
  options: { id: string; label: ReactNode; disabled?: boolean }[]
  isOpen: boolean
  onToggle: () => void
  onSelect: (id: string) => void
  disabled?: boolean
}) {
  return (
    <div className="qz-setting-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="qz-setting-tile"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="qz-setting-label">{label}</div>
        <div className="qz-setting-value">{value}</div>
      </button>
      {isOpen && (
        <div className="qz-dropdown" role="listbox" aria-label={label}>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
            className={`qz-dropdown-option${String(opt.label) === value ? ' selected' : ''}`}
              onClick={() => onSelect(opt.id)}
              disabled={opt.disabled}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FrFlagIcon() {
  return (
    <span className="qz-flag" aria-hidden>
      <svg viewBox="0 0 9 6" width="18" height="12">
        <rect width="3" height="6" fill="#002395" />
        <rect x="3" width="3" height="6" fill="#fff" />
        <rect x="6" width="3" height="6" fill="#ED2939" />
      </svg>
    </span>
  )
}

function WorldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M3 12h18M12 3c-3 3.2-4.5 6.5-4.5 9S9 17.8 12 21c3-3.2 4.5-6.5 4.5-9S15 6.2 12 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconDice() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="9" cy="9" r="1.3" fill="currentColor" />
      <circle cx="15" cy="9" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="9" cy="15" r="1.3" fill="currentColor" />
      <circle cx="15" cy="15" r="1.3" fill="currentColor" />
    </svg>
  )
}
