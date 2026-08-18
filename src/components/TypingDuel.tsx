import { useEffect, useRef, useState } from 'react'
import { pickTypingWord } from '../lib/typingWords'
import './TypingDuel.css'

const ROUND_SEC = 30

interface TypingDuelProps {
  /** Message sous le titre (génération en cours…) — ignoré si embedded */
  statusLabel?: string
  /** Solo ou multi (texte d’ambiance) */
  mode?: 'solo' | 'multi'
  /** Score mis à jour à chaque mot validé (+ flush au démontage) */
  onScoreChange?: (score: number) => void
  /** Intégré dans WaitMiniGames (sans en-tête / ETA) */
  embedded?: boolean
}

/**
 * Mini-jeu d’attente ultra-rapide : taper le mot affiché.
 * Manche chronométrée 30 s — se démonte aussi si la génération finit.
 */
export function TypingDuel({
  statusLabel = 'Génération du quiz…',
  mode = 'solo',
  onScoreChange,
  embedded = false,
}: TypingDuelProps) {
  const [word, setWord] = useState(() => pickTypingWord())
  const [input, setInput] = useState('')
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [flash, setFlash] = useState<'ok' | 'ko' | null>(null)
  const [leftSec, setLeftSec] = useState(ROUND_SEC)
  const [finished, setFinished] = useState(false)
  const [roundId, setRoundId] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const flashTimer = useRef<number | null>(null)
  const scoreRef = useRef(0)
  const onScoreRef = useRef(onScoreChange)
  onScoreRef.current = onScoreChange

  useEffect(() => {
    if (finished) return
    inputRef.current?.focus()
  }, [word, finished, roundId])

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      onScoreRef.current?.(scoreRef.current)
    }
  }, [])

  // Chrono 30 s par manche
  useEffect(() => {
    setLeftSec(ROUND_SEC)
    setFinished(false)
    const started = Date.now()
    const id = window.setInterval(() => {
      const left = Math.max(
        0,
        ROUND_SEC - Math.floor((Date.now() - started) / 1000),
      )
      setLeftSec(left)
      if (left <= 0) {
        window.clearInterval(id)
        setFinished(true)
        onScoreRef.current?.(scoreRef.current)
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [roundId])

  function nextWord(prev: string) {
    setWord(pickTypingWord(prev))
    setInput('')
  }

  function bumpFlash(kind: 'ok' | 'ko') {
    setFlash(kind)
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 120)
  }

  function restart() {
    scoreRef.current = 0
    setScore(0)
    setCombo(0)
    setInput('')
    setFlash(null)
    setWord(pickTypingWord())
    setRoundId((n) => n + 1)
  }

  function onChange(value: string) {
    if (finished) return
    const clean = value.toUpperCase().replace(/[^A-Z]/g, '')
    setInput(clean)
    if (!clean) return

    if (clean === word) {
      const nextCombo = combo + 1
      const gained = 1 + Math.min(3, Math.floor(nextCombo / 3))
      const nextScore = score + gained
      setCombo(nextCombo)
      setScore(nextScore)
      scoreRef.current = nextScore
      onScoreRef.current?.(nextScore)
      bumpFlash('ok')
      nextWord(word)
      return
    }

    // Erreur dès qu’un caractère ne match plus le début du mot
    if (!word.startsWith(clean)) {
      setCombo(0)
      bumpFlash('ko')
      setInput('')
    }
  }

  const urgent = !finished && leftSec <= 5

  return (
    <section
      className={`typing-duel${embedded ? ' typing-duel--embedded' : ''}${flash === 'ok' ? ' is-ok' : ''}${flash === 'ko' ? ' is-ko' : ''}${finished ? ' is-finished' : ''}`}
    >
      {!embedded && (
        <>
          <p className="typing-duel__eyebrow">{statusLabel}</p>
          <h2 className="typing-duel__title">Duel de frappe</h2>
        </>
      )}
      <p className="typing-duel__hint">
        {finished
          ? 'Temps écoulé — manche terminée.'
          : mode === 'multi'
            ? '30 s — tape vite, chacun de son côté.'
            : '30 s — tape le mot le plus vite possible.'}
      </p>

      <div className="typing-duel__scores" aria-live="polite">
        <div className="typing-duel__score">
          <span className="typing-duel__score-label">Score</span>
          <span className="typing-duel__score-value">{score}</span>
        </div>
        <div className="typing-duel__score">
          <span className="typing-duel__score-label">Combo</span>
          <span className="typing-duel__score-value">×{combo}</span>
        </div>
        <div
          className={`typing-duel__score${urgent ? ' is-urgent' : ''}${finished ? ' is-done' : ''}`}
        >
          <span className="typing-duel__score-label">Chrono</span>
          <span className="typing-duel__score-value">{leftSec}s</span>
        </div>
      </div>

      {finished ? (
        <div className="typing-duel__end" role="status">
          <p className="typing-duel__end-score">
            Score final : <strong>{score}</strong>
          </p>
          <button
            type="button"
            className="btn btn--primary typing-duel__replay"
            onClick={restart}
          >
            Rejouer 30 s
          </button>
        </div>
      ) : (
        <>
          <p className="typing-duel__word" aria-live="polite">
            {word}
          </p>

          <label className="typing-duel__field">
            <span className="visually-hidden">Tape le mot</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => onChange(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              inputMode="text"
              placeholder="Tape ici…"
              maxLength={word.length + 2}
            />
          </label>
        </>
      )}
    </section>
  )
}
