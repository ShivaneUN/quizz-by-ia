import { useEffect, useRef, useState } from 'react'
import { pickTypingWord } from '../lib/typingWords'
import './TypingDuel.css'

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
 * Stock local uniquement — se démonte dès que la génération finit.
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
  const inputRef = useRef<HTMLInputElement>(null)
  const flashTimer = useRef<number | null>(null)
  const scoreRef = useRef(0)
  const onScoreRef = useRef(onScoreChange)
  onScoreRef.current = onScoreChange

  useEffect(() => {
    inputRef.current?.focus()
  }, [word])

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      onScoreRef.current?.(scoreRef.current)
    }
  }, [])

  function nextWord(prev: string) {
    setWord(pickTypingWord(prev))
    setInput('')
  }

  function bumpFlash(kind: 'ok' | 'ko') {
    setFlash(kind)
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 120)
  }

  function onChange(value: string) {
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

  return (
    <section
      className={`typing-duel${embedded ? ' typing-duel--embedded' : ''}${flash === 'ok' ? ' is-ok' : ''}${flash === 'ko' ? ' is-ko' : ''}`}
    >
      {!embedded && (
        <>
          <p className="typing-duel__eyebrow">{statusLabel}</p>
          <h2 className="typing-duel__title">Duel de frappe</h2>
        </>
      )}
      <p className="typing-duel__hint">
        {mode === 'multi'
          ? 'Tape vite — chacun joue de son côté en attendant.'
          : 'Tape le mot le plus vite possible.'}
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
      </div>

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
    </section>
  )
}
