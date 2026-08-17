import { useState, type CSSProperties, type FormEvent } from 'react'
import {
  ORBIT_THEMES,
  SUBTHEMES,
  formatThemeQuery,
  getThemeById,
  type ThemeTile,
} from '../lib/themes'
import type { Difficulty, QuizScope } from '../types'
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
  /** Toujours standard — mode image désactivé */
  quizMode: 'standard'
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
  /** Retour vers le choix Solo / Multi */
  onBack?: () => void
  busy?: boolean
  error?: string | null
}

export function ThemeSelect({
  onStart,
  variant = 'solo',
  onBack,
  busy,
  error,
}: ThemeSelectProps) {
  const [themeId, setThemeId] = useState<string | null>(null)
  const [subtheme, setSubtheme] = useState('Général')
  const [customTheme, setCustomTheme] = useState('')
  const [scope, setScope] = useState<QuizScope>('fr')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [gameMode, setGameMode] = useState<GameModeOption>('free')
  const [aiProvider, setAiProvider] = useState<AiProvider>('auto')

  const isMulti = variant === 'multi'
  const showDifficulty = gameMode === 'free'

  const parent = themeId ? getThemeById(themeId) : undefined
  const subs = themeId ? (SUBTHEMES[themeId] ?? ['Général']) : []

  function selectTheme(t: ThemeTile) {
    setThemeId(t.id)
    setSubtheme('Général')
    setCustomTheme('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const custom = customTheme.trim()
    const t = custom
      ? custom
      : parent
        ? formatThemeQuery(parent.label, subtheme)
        : ''
    if (!t || busy) return
    onStart(t, '', scope, {
      timerEnabled,
      difficulty: gameMode === 'free' ? difficulty : 'easy',
      gameMode,
      aiProvider,
      quizMode: 'standard',
    })
  }

  const activeLabel = customTheme.trim()
    ? customTheme.trim()
    : parent
      ? formatThemeQuery(parent.label, subtheme)
      : ''
  const canPlay = Boolean(activeLabel) && !busy

  const centerBlock = (
    <div className="game-home__center">
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
      </div>

      <p className="brand-hero__tagline">
        Choisis un thème, puis joue !
      </p>

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
        <div className="scope-field__toggle" role="group">
          <button
            type="button"
            className={`scope-chip${gameMode === 'progression' ? ' is-selected' : ''}`}
            onClick={() => setGameMode('progression')}
            disabled={busy}
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

      <fieldset className="scope-field">
        <legend className="scope-field__label">Intelligence artificielle</legend>
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

      <button className="btn-jouer" type="submit" disabled={!canPlay}>
        <span className="btn-jouer__icon" aria-hidden>
          ▶
        </span>
        {busy ? 'Préparation…' : isMulti ? 'Créer la salle' : 'Jouer'}
      </button>
    </div>
  )

  return (
    <section className={`game-home${isMulti ? ' game-home--multi' : ''}`}>
      {onBack && (
        <button
          type="button"
          className="game-home__back"
          onClick={onBack}
          disabled={busy}
        >
          ← Retour
        </button>
      )}
      <form className="game-home__form" onSubmit={handleSubmit}>
        <div className="game-home__mobile-top">{centerBlock}</div>

        <div className="game-home__stage">
          <div className="game-home__orbit-ring" aria-hidden />

          <div className="game-home__themes" role="group" aria-label="Thèmes">
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

          <div className="game-home__desktop-center">{centerBlock}</div>
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
          <span className="custom-theme__label">Ou écris ton propre thème</span>
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

        {error && (
          <p className="game-home__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}
