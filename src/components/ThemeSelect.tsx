import { useState, type CSSProperties, type FormEvent } from 'react'
import {
  ORBIT_THEMES,
  SUBTHEMES,
  formatThemeQuery,
  getThemeById,
  type ThemeTile,
} from '../lib/themes'
import {
  DEEZER_DECADE_OPTIONS,
  DEEZER_GLOBAL_OPTION,
  DEEZER_STYLE_OPTIONS,
  formatDeezerTheme,
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
import './ThemeSelect.css'

export type GameModeOption = 'progression' | 'free'

export interface ThemeStartOptions {
  timerEnabled: boolean
  difficulty: Difficulty
  gameMode: GameModeOption
  aiProvider: AiProvider
  quizMode: QuizContentMode
}

const AI_OPTIONS: { id: AiProvider; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Rotation Groq / Gemini / OpenRouter' },
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
}: ThemeSelectProps) {
  const [themeId, setThemeId] = useState<string | null>(null)
  const [subtheme, setSubtheme] = useState('Général')
  const [customTheme, setCustomTheme] = useState('')
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
  const subs = themeId ? (SUBTHEMES[themeId] ?? ['Général']) : []
  const deezerStyle =
    DEEZER_STYLE_OPTIONS.find((s) => s.id === deezerStyleId) ??
    DEEZER_STYLE_OPTIONS[0]

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
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || (variant === 'solo' && soloLocked)) return

    if (isDeezer) {
      const t = deezerThemeLabel()
      if (!t) return
      onStart(t, '', scope, {
        timerEnabled,
        difficulty: gameMode === 'free' ? difficulty : 'easy',
        gameMode,
        aiProvider,
        quizMode: 'audio',
      })
      return
    }

    const custom = customTheme.trim()
    const t = custom
      ? custom
      : parent
        ? formatThemeQuery(parent.label, subtheme)
        : ''
    if (!t) return
    onStart(t, '', scope, {
      timerEnabled,
      difficulty: gameMode === 'free' ? difficulty : 'easy',
      gameMode,
      aiProvider,
      quizMode: 'standard',
    })
  }

  const activeLabel = isDeezer
    ? deezerThemeLabel()
    : customTheme.trim()
      ? customTheme.trim()
      : parent
        ? formatThemeQuery(parent.label, subtheme)
        : ''
  const canPlay =
    Boolean(activeLabel) && !busy && !(variant === 'solo' && soloLocked)
  const deezerUsingCustom = Boolean(deezerQuery.trim())

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
              onClick={() => setScope(s)}
              disabled={busy}
              aria-pressed={scope === s}
            >
              {QUIZ_SCOPE_LABELS[s]}
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
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {!isDeezer && (
        <fieldset className="scope-field">
          <legend className="scope-field__label">
            Intelligence artificielle
          </legend>
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
        <span className="chrono-switch__label">Chrono 10 s</span>
        <span className="chrono-switch__track" aria-hidden>
          <span className="chrono-switch__thumb" />
        </span>
      </button>
    </div>
  )

  function orbitCenter() {
    return (
      <div className="game-home__center">
        {brandBlock}
        {settingsFields}
        {playButton}
      </div>
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
                    Par style
                  </button>
                </div>
              </fieldset>

              {deezerPoolMode === 'style' && (
                <fieldset className="subthemes">
                  <legend className="subthemes__title">Styles musicaux</legend>
                  <div className="subthemes__grid" role="group">
                    {DEEZER_STYLE_OPTIONS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`subtheme-chip${deezerStyleId === s.id && !deezerUsingCustom ? ' is-selected' : ''}`}
                        onClick={() => {
                          setDeezerPoolMode('style')
                          setDeezerStyleId(s.id)
                          setDeezerQuery('')
                        }}
                        disabled={busy}
                        aria-pressed={
                          deezerStyleId === s.id && !deezerUsingCustom
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset className="subthemes">
                <legend className="subthemes__title">Décennie</legend>
                <div className="subthemes__grid" role="group" aria-label="Décennie">
                  {DEEZER_DECADE_OPTIONS.map((d) => (
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
                Réponses = titres seuls · l’audit affiche titre + artiste
              </p>
            </div>

            <div className="deezer-layout__settings">
              {settingsFields}
              {playButton}
            </div>
          </div>
        ) : (
          <>
            <div className="game-home__mobile-top">{orbitCenter()}</div>

            <div className="game-home__stage">
              <div className="game-home__orbit-ring" aria-hidden />

              <div
                className="game-home__themes"
                role="group"
                aria-label="Thèmes"
              >
                {ORBIT_THEMES.map((t: ThemeTile) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`theme-bubble${themeId === t.id && !customTheme ? ' is-selected' : ''}`}
                    style={
                      {
                        '--angle': `${t.angle}deg`,
                        '--bubble-color': t.color,
                      } as CSSProperties
                    }
                    onClick={() => selectTheme(t)}
                    disabled={busy}
                    aria-pressed={themeId === t.id && !customTheme}
                  >
                    <span className="theme-bubble__icon">
                      <ThemeIcon id={t.id} />
                    </span>
                    <span className="theme-bubble__label">{t.label}</span>
                  </button>
                ))}
              </div>

              <div className="game-home__desktop-center">
                {orbitCenter()}
              </div>
            </div>

            {parent && !customTheme.trim() && (
              <fieldset className="subthemes">
                <legend className="subthemes__title">
                  Sous-thèmes — {parent.label}
                </legend>
                <div className="subthemes__grid" role="group">
                  {subs.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`subtheme-chip${subtheme === s ? ' is-selected' : ''}`}
                      onClick={() => setSubtheme(s)}
                      disabled={busy}
                      aria-pressed={subtheme === s}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="subthemes__chosen">
                  Thème choisi : <strong>{activeLabel}</strong>
                </p>
              </fieldset>
            )}

            <label className="custom-theme">
              <span className="custom-theme__label">
                Ou écris ton propre thème
              </span>
              <input
                value={customTheme}
                onChange={(e) => {
                  setCustomTheme(e.target.value)
                  if (e.target.value.trim()) {
                    setThemeId(null)
                    setSubtheme('Général')
                  }
                }}
                placeholder="Ex. Musique — K-pop…"
                maxLength={80}
                enterKeyHint="go"
              />
            </label>
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
