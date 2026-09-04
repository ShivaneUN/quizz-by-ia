import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Question } from '../types'
import { ROUND_MS } from '../types'
import {
  readDeezerAutoplayPreference,
  writeDeezerAutoplayPreference,
} from '../lib/deezerStyles'
import { emitTtsStop } from '../lib/tts'
import { QuestionFeedback } from './QuestionFeedback'
import { PreviewAudio } from './PreviewAudio'
import { QuestionTtsBar } from './QuestionTtsBar'
import { AnswerTtsButton } from './AnswerTtsButton'
import { revealCorrectAnswer } from './AnswerAudit'
import { isLanguesTheme } from '../lib/themes'
import { displayLangueAnswerChoice } from '../lib/langueAnswerDisplay'
import './QuizPlay.css'

interface QuizPlayProps {
  question: Question
  index: number
  total: number
  /** index QCM, texte libre, ou -1 = timeout */
  onAnswer: (answer: number | string) => void
  /** -1 = timeout · -2 = free faux · 0–3 = QCM / free OK */
  selectedIndex: number | null
  onContinue?: () => void
  disabled?: boolean
  timerEnabled?: boolean
  durationMs?: number
  theme?: string
  /** @deprecated préférence locale via localStorage */
  audioAutoplay?: boolean
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
  const isFree = question.answerMode === 'free'
  const revealed = selectedIndex !== null
  const timedOut = selectedIndex === -1
  const wrongFree = selectedIndex === -2
  const isCorrect =
    revealed &&
    !timedOut &&
    !wrongFree &&
    selectedIndex === question.correctIndex
  const languesTts = isLanguesTheme(theme)
  const correctWord = revealCorrectAnswer(
    question.explanation,
    question.answers[question.correctIndex],
    question.revealAnswer,
  )

  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [freeText, setFreeText] = useState('')
  const [audioAutoplay, setAudioAutoplay] = useState(() =>
    readDeezerAutoplayPreference(true),
  )
  const timedOutRef = useRef(false)

  useEffect(() => {
    setStartedAt(Date.now())
    setNow(Date.now())
    setFreeText('')
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
    emitTtsStop()
    onAnswer(-1)
  }, [timerEnabled, revealed, leftMs, onAnswer])

  function submitFree(e: FormEvent) {
    e.preventDefault()
    if (disabled || revealed) return
    const t = freeText.trim()
    if (!t) return
    emitTtsStop()
    onAnswer(t)
  }

  function pickAnswer(answer: number | string) {
    if (disabled || revealed) return
    emitTtsStop()
    onAnswer(answer)
  }

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

      {!question.previewUrl && (
        <QuestionTtsBar
          questionId={question.id}
          question={question.question}
          answers={question.answers}
          answerMode={question.answerMode}
          halted={revealed}
        />
      )}
      <h2 className="quiz-play__question">{question.question}</h2>

      {question.previewUrl && (
        <PreviewAudio
          src={question.previewUrl}
          questionId={question.id}
          maxSeconds={30}
          autoPlay={audioAutoplay}
          halted={revealed}
          onAutoPlayChange={(on) => {
            setAudioAutoplay(on)
            writeDeezerAutoplayPreference(on)
          }}
        />
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

      {isFree ? (
        <form className="quiz-play__free" onSubmit={submitFree}>
          <label className="quiz-play__free-label" htmlFor={`free-${question.id}`}>
            {question.freeInputHint === 'title'
              ? 'Titre du morceau'
              : 'Titre ou artiste'}
          </label>
          <div className="quiz-play__free-row">
            <input
              id={`free-${question.id}`}
              className="quiz-play__free-input"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={
                question.freeInputHint === 'title'
                  ? 'Ex. titre du morceau'
                  : 'Ex. titre ou nom d’artiste'
              }
              value={freeText}
              disabled={disabled || revealed}
              onChange={(e) => setFreeText(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={disabled || revealed || !freeText.trim()}
            >
              Valider
            </button>
          </div>
        </form>
      ) : (
        <div
          className={`quiz-play__answers quiz-play__answers--n${question.answers.length}`}
          role="group"
          aria-label="Réponses"
        >
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
                onClick={() => pickAnswer(i)}
              >
                <span className="quiz-play__letter" aria-hidden>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="quiz-play__answer-text">
                  {languesTts
                    ? displayLangueAnswerChoice(
                        answer,
                        question.question,
                        revealed,
                      )
                    : answer}
                </span>
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
      )}

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
          {question.coverUrl && (
            <img
              className="quiz-play__feedback-cover"
              src={question.coverUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          )}
          {!isCorrect && (
            <p className="quiz-play__feedback-detail">
              La bonne réponse était :{' '}
              <strong>{correctWord}</strong>
              {languesTts && <AnswerTtsButton text={correctWord} />}
            </p>
          )}
          {isCorrect && languesTts && (
            <p className="quiz-play__feedback-detail">
              <strong>{correctWord}</strong>
              <AnswerTtsButton text={correctWord} />
            </p>
          )}
          {isCorrect && question.previewUrl && !languesTts && (
            <p className="quiz-play__feedback-detail">
              {correctWord}
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
