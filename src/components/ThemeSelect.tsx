import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  ORBIT_THEMES,
  formatThemeQuery,
  getThemeById,
  officialSubsForTheme,
  type ThemeTile,
} from '../lib/themes'
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
import './ThemeSelect.css'

export type GameModeOption = 'progression' | 'free'

export interface ThemeStartOptions {
  timerEnabled: boolean
  /** Deezer : démarrer l’extrait automatiquement */
  audioAutoplay: boolean
  difficulty: Difficulty
  gameMode: GameModeOption
  aiProvider: AiProvider
  quizMode: QuizContentMode
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
  soloLockHint?: string
  onReturnToRoom?: () => void
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
  soloLockHint,
  onReturnToRoom,
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

  const isMulti = variant === 'multi'
  const showDifficulty = gameMode === 'free'
  const isDeezer = quizMode === 'audio'

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
    if (themeId === 'custom' || themeId === 'pregen') {
      if (subtheme !== 'Général') setSubtheme('Général')
    }
  }, [themeId, subtheme])

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
    if (themeId === 'custom' || themeId === 'pregen') return ''
    if (generatedUnderTheme.includes(subtheme)) return subtheme.trim()
    if (subtheme === 'Custom') return ''
    return formatThemeQuery(parent.label, subtheme)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || (variant === 'solo' && soloLocked)) return

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

    const t = playThemeLabel()
    if (!t) return
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
    onStart(t, '', scope, {
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
  const canPlay =
    Boolean(activeLabel) && !busy && !(variant === 'solo' && soloLocked)
  const deezerUsingCustom = Boolean(deezerQuery.trim())

  function renderSubthemes(opts?: { inPanel?: boolean; showChosen?: boolean }) {
    if (!parent || customTheme.trim()) return null
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
            : 'Choisis un thème, puis joue !'}
      </p>
    </div>
  )

  const playButton = (
    <>
      {variant === 'solo' && soloLocked && (
        <div className="solo-lock" role="status">
          <p className="solo-lock__msg">
            {soloLockHint ??
              'Tu es encore dans une salle multi. Quitte la salle pour jouer en solo.'}
          </p>
          {onReturnToRoom && (
            <button
              type="button"
              className="btn btn--secondary solo-lock__btn"
              onClick={onReturnToRoom}
            >
              Retour à la salle
            </button>
          )}
        </div>
      )}
      <button className="btn-jouer" type="submit" disabled={!canPlay}>
        <span className="btn-jouer__icon" aria-hidden>
          ▶
        </span>
        {busy
          ? 'Préparation…'
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
    </>
  )

  const settingsFields = (
    <div className="game-home__options">
      <fieldset className="scope-field">
        <legend className="scope-field__label">Type</legend>
        <div className="scope-field__toggle" role="group" aria-label="Type">
          <button
            type="button"
            className={`scope-chip${!isDeezer ? ' is-selected' : ''}`}
            onClick={() => setQuizMode('standard')}
            disabled={busy}
            aria-pressed={!isDeezer}
          >
            Texte (IA)
          </button>
          <button
            type="button"
            className={`scope-chip${isDeezer ? ' is-selected' : ''}`}
            onClick={() => {
              setQuizMode('audio')
              setGameMode('free')
            }}
            disabled={busy}
            aria-pressed={isDeezer}
          >
            Deezer
          </button>
        </div>
      </fieldset>

      <fieldset className="scope-field">
        <legend className="scope-field__label">Portée</legend>
        <div className="scope-field__toggle" role="group">
          {(['fr', 'international'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`scope-chip${scope === s ? ' is-selected' : ''}`}
              onClick={() => {
                setScope(s)
                // Si le style actuel ne colle pas à la nouvelle portée → style neutre
                if (
                  deezerPoolMode === 'style' &&
                  !isDeezerStyleNativeToScope(deezerStyleId, s)
                ) {
                  setDeezerStyleId(s === 'fr' ? 'variete' : 'pop')
                }
              }}
              disabled={busy}
              aria-pressed={scope === s}
              aria-label={QUIZ_SCOPE_LABELS[s]}
              title={QUIZ_SCOPE_LABELS[s]}
            >
              {s === 'fr' ? (
                <span className="scope-chip__flag scope-chip__flag--fr" aria-hidden>
                  <svg viewBox="0 0 9 6" width="18" height="12">
                    <rect width="3" height="6" fill="#002395" />
                    <rect x="3" width="3" height="6" fill="#fff" />
                    <rect x="6" width="3" height="6" fill="#ED2939" />
                  </svg>
                </span>
              ) : (
                <span className="scope-chip__flag" aria-hidden>
                  🌍
                </span>
              )}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="scope-field">
        <legend className="scope-field__label">Mode</legend>
        <div className="scope-field__toggle" role="group" aria-label="Mode">
          <button
            type="button"
            className={`scope-chip${gameMode === 'progression' ? ' is-selected' : ''}`}
            onClick={() => setGameMode('progression')}
            disabled={busy || isDeezer}
            aria-pressed={gameMode === 'progression'}
          >
            Paliers
          </button>
          <button
            type="button"
            className={`scope-chip${gameMode === 'free' ? ' is-selected' : ''}`}
            onClick={() => setGameMode('free')}
            disabled={busy}
            aria-pressed={gameMode === 'free'}
          >
            Libre
          </button>
        </div>
      </fieldset>

      {showDifficulty && (
        <fieldset className="scope-field">
          <legend className="scope-field__label">Difficulté</legend>
          <div className="scope-field__toggle" role="group">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={`scope-chip${difficulty === d ? ' is-selected' : ''}`}
                onClick={() => setDifficulty(d)}
                disabled={busy}
                aria-pressed={difficulty === d}
                title={DIFFICULTY_LABELS[d]}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="game-home__ia-chrono">
        {!isDeezer && (
          <fieldset className="scope-field">
            <legend className="scope-field__label">IA</legend>
            <div className="scope-field__toggle" role="group" aria-label="IA">
              {AI_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`scope-chip${aiProvider === opt.id ? ' is-selected' : ''}`}
                  onClick={() => setAiProvider(opt.id)}
                  disabled={busy}
                  aria-pressed={aiProvider === opt.id}
                  title={opt.hint}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <button
          type="button"
          className={`chrono-switch${timerEnabled ? ' is-on' : ''}`}
          role="switch"
          aria-checked={timerEnabled}
          disabled={busy}
          onClick={() => setTimerEnabled((v) => !v)}
        >
          <span className="chrono-switch__label">Chrono</span>
          <span className="chrono-switch__track" aria-hidden>
            <span className="chrono-switch__thumb" />
          </span>
        </button>
      </div>
    </div>
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
        {brandBlock}
        {settingsFields}
        {customThemeField}
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
          if (soon) return
          selectTheme(t)
        }}
        disabled={busy || soon}
        aria-pressed={themeId === t.id && !customTheme && !soon}
        title={soon ? 'Disponible prochainement' : t.label}
        aria-label={
          soon ? `${t.label} — disponible prochainement` : t.label
        }
      >
        <span className="theme-bubble__icon">
          <ThemeIcon id={t.id} />
        </span>
        <span className="theme-bubble__label">{t.label}</span>
        {soon && <span className="theme-bubble__soon">Bientôt</span>}
      </button>
    )
  }

  return (
    <section
      className={`game-home${isMulti ? ' game-home--multi' : ''}${isDeezer ? ' game-home--deezer' : ''}`}
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
      <form className="game-home__form" onSubmit={handleSubmit}>
        {isDeezer ? (
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
              {playButton}
            </div>
          </div>
        ) : (
          <>
            <div className="game-home__mobile-brand">{brandBlock}</div>

            {topDock ? (
              <div className="game-home__top-dock">{topDock}</div>
            ) : null}

            {/* Mobile : réglages + thèmes côte à côte */}
            <div className="game-home__board">
              <aside className="game-home__settings-panel" aria-label="Réglages">
                <p className="game-home__panel-title">Réglages</p>
                {settingsFields}
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

            <div className="game-home__mobile-play">{playButton}</div>

            {/* Desktop : orbite */}
            <div className="game-home__stage">
              <div className="game-home__orbit-ring" aria-hidden />

              <div
                className="game-home__themes"
                role="group"
                aria-label="Thèmes"
              >
                {ORBIT_THEMES.map((t) => renderOrbitBubble(t, 'desk-'))}
              </div>

              <div className="game-home__desktop-center">
                {orbitCenter()}
              </div>
            </div>

            <div className="game-home__desktop-extras">
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
