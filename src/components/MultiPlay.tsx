import { useEffect, useMemo, useState } from 'react'
import type { MultiRoom } from '../lib/multiApi'
import { HostPlayersPanel } from './HostPlayersPanel'
import './MultiPlay.css'

interface MultiPlayProps {
  room: MultiRoom
  playerId: string
  onAnswer: (answerIndex: number) => void
  onNext: () => void
  onLeave: () => void
  onKick: (targetPlayerId: string) => void
  busy?: boolean
  disabled?: boolean
}

export function MultiPlay({
  room,
  playerId,
  onAnswer,
  onNext,
  onLeave,
  onKick,
  busy,
  disabled,
}: MultiPlayProps) {
  const q = room.questions[room.questionIndex]
  const myAnswer = room.currentAnswers[playerId]
  const hasAnswered = myAnswer !== undefined
  const timerOn = room.timerEnabled !== false
  const revealing = room.roundPhase === 'reveal'
  const isHost = playerId === room.hostId
  const correctIndex = q?.correctIndex
  const isLast =
    room.questionIndex + 1 >= room.questions.length

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timerOn || revealing) return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [timerOn, revealing, room.questionIndex])

  const leftMs = timerOn && !revealing ? Math.max(0, room.roundEndsAt - now) : 1
  const leftSec = Math.ceil(leftMs / 1000)
  const progress = useMemo(() => {
    const total = room.roundDurationMs || 10000
    return Math.min(1, Math.max(0, leftMs / total))
  }, [leftMs, room.roundDurationMs])

  if (!q) {
    return <p className="multi-play__empty">Chargement…</p>
  }

  const myCorrect =
    revealing &&
    typeof correctIndex === 'number' &&
    hasAnswered &&
    myAnswer === correctIndex

  return (
    <section className="multi-play">
      <div className="multi-play__top">
        <p className="multi-play__meta">
          Question {room.questionIndex + 1} / {room.questions.length}
          {(room.difficulty === 'easy' ||
            room.difficulty === 'medium' ||
            room.difficulty === 'hard') && (
            <>
              {' '}
              ·{' '}
              {room.difficulty === 'easy'
                ? 'Facile'
                : room.difficulty === 'medium'
                  ? 'Moyen'
                  : 'Difficile'}
            </>
          )}
        </p>
        {timerOn && !revealing && (
          <p
            className={`multi-play__timer${leftSec <= 3 ? ' is-urgent' : ''}`}
            aria-live="polite"
          >
            {leftSec}s
          </p>
        )}
      </div>

      {timerOn && !revealing && (
        <div className="multi-play__bar" aria-hidden>
          <div
            className="multi-play__bar-fill"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      )}

      {!revealing && (
        <p className="multi-play__answered">
          Réponses : {room.answeredCount}/{room.players.length}
        </p>
      )}

      <h2 className="multi-play__question">{q.question}</h2>

      {q.imageUrl && (
        <figure className="multi-play__media">
          <img
            className="multi-play__image"
            src={q.imageUrl}
            alt=""
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </figure>
      )}

      <div className="multi-play__answers" role="group" aria-label="Réponses">
        {q.answers.map((answer, i) => {
          const selected = hasAnswered && myAnswer === i
          let state = ''
          if (revealing && typeof correctIndex === 'number') {
            if (i === correctIndex) state = ' is-correct'
            else if (selected) state = ' is-wrong'
            else state = ' is-dimmed'
          } else if (selected) {
            state = ' is-selected'
          }

          return (
            <button
              key={`${q.id}-${i}`}
              type="button"
              className={`multi-play__answer${state}`}
              disabled={
                disabled ||
                revealing ||
                hasAnswered ||
                (timerOn && leftMs <= 0)
              }
              onClick={() => onAnswer(i)}
            >
              <span className="multi-play__letter" aria-hidden>
                {String.fromCharCode(65 + i)}
              </span>
              <span>{answer}</span>
              {revealing && typeof correctIndex === 'number' && i === correctIndex && (
                <span className="multi-play__badge multi-play__badge--ok">
                  Correct
                </span>
              )}
              {revealing &&
                selected &&
                typeof correctIndex === 'number' &&
                i !== correctIndex && (
                  <span className="multi-play__badge multi-play__badge--ko">
                    Faux
                  </span>
                )}
            </button>
          )
        })}
      </div>

      {revealing && (
        <div
          className={`multi-play__feedback multi-play__feedback--${myCorrect ? 'ok' : 'ko'}`}
          role="status"
        >
          <p className="multi-play__feedback-title">
            {!hasAnswered
              ? '⏱ Pas de réponse'
              : myCorrect
                ? '✓ Bonne réponse !'
                : '✗ Mauvaise réponse'}
          </p>
          {typeof correctIndex === 'number' && !myCorrect && (
            <p className="multi-play__feedback-detail">
              La bonne réponse était :{' '}
              <strong>{q.answers[correctIndex]}</strong>
            </p>
          )}
          {q.explanation && (
            <p className="multi-play__explanation">{q.explanation}</p>
          )}
          {q.sourceType && (
            <p className="multi-play__source">Source : {q.sourceType}</p>
          )}
        </div>
      )}

      {revealing && (
        <ul className="multi-play__results">
          {room.players.map((p) => {
            const ans = room.currentAnswers[p.id]
            const ok =
              typeof correctIndex === 'number' &&
              typeof ans === 'number' &&
              ans === correctIndex
            const noAnswer = ans === undefined
            return (
              <li
                key={p.id}
                className={`multi-play__result${ok ? ' is-ok' : ' is-ko'}${p.id === playerId ? ' is-you' : ''}`}
              >
                <span>
                  {p.name}
                  {p.id === playerId ? ' (toi)' : ''}
                </span>
                <span>
                  {noAnswer ? '⏱' : ok ? '✓' : '✗'} {p.score} pts
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {!revealing && hasAnswered && (
        <p className="multi-play__waiting" role="status">
          {timerOn
            ? 'Réponse enregistrée — en attente des autres ou de la fin du chrono…'
            : 'Réponse enregistrée — en attente des autres joueurs…'}
        </p>
      )}

      {revealing && isHost && (
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={onNext}
        >
          {busy
            ? '…'
            : isLast
              ? 'Voir le classement'
              : 'Question suivante'}
        </button>
      )}

      {revealing && !isHost && (
        <p className="multi-play__waiting" role="status">
          En attente de l’hôte pour continuer…
        </p>
      )}

      <HostPlayersPanel
        room={room}
        playerId={playerId}
        busy={busy}
        onKick={onKick}
      />

      <button
        type="button"
        className="multi-play__leave"
        onClick={onLeave}
        disabled={busy}
      >
        Quitter la salle
      </button>
    </section>
  )
}
