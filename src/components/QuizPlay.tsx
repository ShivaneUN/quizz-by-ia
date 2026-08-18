import { useEffect, useMemo, useRef, useState } from 'react'
import type { Question } from '../types'
import { ROUND_MS } from '../types'
import { QuestionFeedback } from './QuestionFeedback'
import './QuizPlay.css'

interface QuizPlayProps {
  question: Question
  index: number
  total: number
  onAnswer: (answerIndex: number) => void
  /** -1 = temps écoulé sans réponse */
  selectedIndex: number | null
  onContinue?: () => void
  disabled?: boolean
  timerEnabled?: boolean
  durationMs?: number
  theme?: string
}

export function QuizPlay({
  question,
  index,
  total,
  onAnswer,
  selectedIndex,
  onContinue,
  disabled,
  timerEnabled = false,
  durationMs = ROUND_MS,
  theme,
}: QuizPlayProps) {
  const revealed = selectedIndex !== null
  const timedOut = selectedIndex === -1
  const isCorrect =
    revealed && !timedOut && selectedIndex === question.correctIndex

  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const timedOutRef = useRef(false)

  useEffect(() => {
    setStartedAt(Date.now())
    setNow(Date.now())
    timedOutRef.current = false
  }, [question.id])

  useEffect(() => {
    if (!timerEnabled || revealed) return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [timerEnabled, revealed, question.id])

  const leftMs = timerEnabled
    ? Math.max(0, startedAt + durationMs - now)
    : durationMs
  const leftSec = Math.ceil(leftMs / 1000)
  const progress = useMemo(
    () => Math.min(1, Math.max(0, leftMs / durationMs)),
    [leftMs, durationMs],
  )

  useEffect(() => {
    if (!timerEnabled || revealed || leftMs > 0 || timedOutRef.current) return
    timedOutRef.current = true
    onAnswer(-1)
  }, [timerEnabled, revealed, leftMs, onAnswer])

  return (
    <section className="quiz-play" aria-live="polite">
      <div className="quiz-play__top">
        <p className="quiz-play__meta">
          Question {index + 1} / {total}
        </p>
        {timerEnabled && !revealed && (
          <p
            className={`quiz-play__timer${leftSec <= 3 ? ' is-urgent' : ''}`}
            aria-live="polite"
          >
            {leftSec}s
          </p>
        )}
      </div>

      {timerEnabled && !revealed && (
        <div className="quiz-play__bar" aria-hidden>
          <div
            className="quiz-play__bar-fill"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      )}

      <h2 className="quiz-play__question">{question.question}</h2>

      {question.previewUrl && (
        <figure className="quiz-play__media quiz-play__media--audio">
          {question.coverUrl && (
            <img
              className="quiz-play__cover"
              src={question.coverUrl}
              alt=""
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          )}
          <audio
            key={question.id}
            className="quiz-play__audio"
            controls
            preload="auto"
            src={question.previewUrl}
          >
            Ton navigateur ne lit pas l’audio.
          </audio>
          <figcaption className="quiz-play__audio-caption">
            Extrait Deezer (~30 s)
          </figcaption>
        </figure>
      )}

      {question.imageUrl && !question.previewUrl && (
        <figure className="quiz-play__media">
          <img
            className="quiz-play__image"
            src={question.imageUrl}
            alt=""
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </figure>
      )}

      <div className="quiz-play__answers" role="group" aria-label="Réponses">
        {question.answers.map((answer, i) => {
          let state = ''
          if (revealed) {
            if (i === question.correctIndex) state = ' is-correct'
            else if (!timedOut && i === selectedIndex) state = ' is-wrong'
            else state = ' is-dimmed'
          }

          return (
            <button
              key={`${question.id}-${i}`}
              type="button"
              className={`quiz-play__answer${state}`}
              disabled={disabled || revealed}
              onClick={() => onAnswer(i)}
            >
              <span className="quiz-play__letter" aria-hidden>
                {String.fromCharCode(65 + i)}
              </span>
              <span className="quiz-play__answer-text">{answer}</span>
              {revealed && i === question.correctIndex && (
                <span className="quiz-play__badge quiz-play__badge--ok">
                  Correct
                </span>
              )}
              {revealed &&
                !timedOut &&
                i === selectedIndex &&
                i !== question.correctIndex && (
                  <span className="quiz-play__badge quiz-play__badge--ko">
                    Faux
                  </span>
                )}
            </button>
          )
        })}
      </div>

      {revealed && (
        <div
          className={`quiz-play__feedback quiz-play__feedback--${isCorrect ? 'ok' : 'ko'}`}
          role="status"
        >
          <p className="quiz-play__feedback-title">
            {isCorrect
              ? '✓ Bonne réponse !'
              : timedOut
                ? '⏱ Temps écoulé'
                : '✗ Mauvaise réponse'}
          </p>
          {!isCorrect && (
            <p className="quiz-play__feedback-detail">
              La bonne réponse était :{' '}
              <strong>{question.answers[question.correctIndex]}</strong>
            </p>
          )}
          {question.explanation && (
            <p className="quiz-play__explanation">{question.explanation}</p>
          )}
          {question.sourceType && (
            <p className="quiz-play__source">Source : {question.sourceType}</p>
          )}
          <QuestionFeedback
            questionId={question.id}
            question={question.question}
            answers={question.answers}
            correctIndex={question.correctIndex}
            explanation={question.explanation}
            sourceType={question.sourceType}
            theme={theme}
            difficulty={question.difficulty}
            mode="solo"
            playerCorrect={isCorrect}
            selectedIndex={selectedIndex ?? undefined}
          />
          {onContinue && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={onContinue}
            >
              {index + 1 >= total
                ? 'Voir le bilan du palier'
                : 'Question suivante'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
