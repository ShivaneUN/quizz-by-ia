import { useEffect, useMemo, useState } from 'react'
import type { MultiRoom } from '../lib/multiApi'
import { HostPlayersPanel } from './HostPlayersPanel'
import { PlayersStreakBar } from './PlayersStreakBar'
import { QuestionFeedback } from './QuestionFeedback'
import { StreakFlame } from './StreakFlame'
import './MultiPlay.css'

interface MultiPlayProps {
  room: MultiRoom
  playerId: string
  onAnswer: (answerIndex: number) => void
  onBegin: () => void
  onPause: () => void
  onResume: () => void
  onNext: () => void
  onLeave: () => void
  onKick: (targetPlayerId: string) => void
  busy?: boolean
  disabled?: boolean
}

function hasActiveDeadline(room: MultiRoom): boolean {
  if (typeof room.roundDeadlineAt === 'number' && room.roundDeadlineAt > 0) {
    return true
  }
  return room.roundStartedAt > 0 && room.roundPhase === 'answering'
}

export function MultiPlay({
  room,
  playerId,
  onAnswer,
  onBegin,
  onPause,
  onResume,
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
  const waiting = room.roundPhase === 'waiting'
  const revealing = room.roundPhase === 'reveal'
  const answering = room.roundPhase === 'answering'
  const paused = Boolean(room.timerPaused)
  const isHost = playerId === room.hostId
  const correctIndex = q?.correctIndex
  const isLast = room.questionIndex + 1 >= room.questions.length
  const needsHostStart =
    timerOn &&
    !revealing &&
    (waiting || (answering && !paused && !hasActiveDeadline(room)))
  const timerRunning =
    timerOn && answering && !waiting && !needsHostStart && hasActiveDeadline(room)

  /** Décalage horloge client ↔ serveur (ms). Positif si le client est en avance. */
  const clockSkew = useMemo(() => {
    if (typeof room.serverNow === 'number' && room.serverNow > 0) {
      return Date.now() - room.serverNow
    }
    return 0
  }, [room.serverNow, room.roundDeadlineAt, room.roundEndsAt, room.updatedAt])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
  }, [
    room.roundPhase,
    room.roundStartedAt,
    room.roundDeadlineAt,
    room.roundEndsAt,
    room.questionIndex,
    paused,
    room.serverNow,
  ])

  useEffect(() => {
    if (!timerRunning || paused || revealing) return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [timerRunning, paused, revealing, room.questionIndex])

  const leftMs = needsHostStart
    ? room.roundDurationMs || 10000
    : !timerRunning
      ? 1
      : paused
        ? Math.max(0, room.timerPausedLeftMs ?? room.roundDurationMs)
        : Math.max(0, room.roundEndsAt - (now - clockSkew))
  const leftSec = Math.max(0, Math.ceil(leftMs / 1000))
  const progress = useMemo(() => {
    const total = room.roundDurationMs || 10000
    if (needsHostStart) return 1
    return Math.min(1, Math.max(0, leftMs / total))
  }, [leftMs, room.roundDurationMs, needsHostStart])

  if (!q) {
    return <p className="multi-play__empty">Chargement…</p>
  }

  const myCorrect =
    revealing &&
    typeof correctIndex === 'number' &&
    hasAnswered &&
    myAnswer === correctIndex

  const timeExpired = timerRunning && !paused && leftMs <= 0
  const answersLocked =
    disabled ||
    revealing ||
    needsHostStart ||
    hasAnswered ||
    timeExpired

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
        {timerRunning && (
          <p
            className={`multi-play__timer${
              !paused && leftSec <= 3 ? ' is-urgent' : ''
            }`}
            aria-live="polite"
          >
            {paused ? `Pause ${leftSec}s` : `${leftSec}s`}
          </p>
        )}
        {needsHostStart && (
          <p className="multi-play__timer" aria-live="polite">
            {Math.ceil((room.roundDurationMs || 10000) / 1000)}s
          </p>
        )}
      </div>

      {timerRunning && !paused && (
        <div className="multi-play__bar" aria-hidden>
          <div
            className="multi-play__bar-fill"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      )}

      {needsHostStart && (
        <p className="multi-play__answered" aria-live="polite">
          {isHost
            ? 'Tout le monde est prêt ? Lance le chrono une fois — il enchaînera ensuite.'
            : 'En attente que l’hôte lance le chrono…'}
        </p>
      )}

      {paused && (
        <p className="multi-play__answered" aria-live="polite">
          Chrono en pause
          {isHost ? ' — tu peux le relancer quand tu veux.' : '.'}
        </p>
      )}

      {!revealing && !needsHostStart && (
        <p className="multi-play__answered">
          Réponses : {room.answeredCount}/{room.players.length}
        </p>
      )}

      <h2 className="multi-play__question">{q.question}</h2>

      {q.previewUrl && (
        <figure className="multi-play__media multi-play__media--audio">
          {q.coverUrl && (
            <img
              className="multi-play__cover"
              src={q.coverUrl}
              alt=""
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          )}
          <audio
            key={q.id}
            className="multi-play__audio"
            controls
            preload="auto"
            src={q.previewUrl}
          >
            Ton navigateur ne lit pas l’audio.
          </audio>
          <figcaption className="multi-play__audio-caption">
            Extrait Deezer (~30 s)
          </figcaption>
        </figure>
      )}

      {q.imageUrl && !q.previewUrl && (
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
              disabled={answersLocked}
              onClick={() => onAnswer(i)}
            >
              <span className="multi-play__letter" aria-hidden>
                {String.fromCharCode(65 + i)}
              </span>
              <span>{answer}</span>
              {revealing &&
                typeof correctIndex === 'number' &&
                i === correctIndex && (
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

      {needsHostStart && isHost && (
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={onBegin}
        >
          {busy ? '…' : 'Lancer le chrono'}
        </button>
      )}

      {needsHostStart && !isHost && (
        <p className="multi-play__waiting" role="status">
          L’hôte lancera le chrono dès que tout le monde est prêt.
        </p>
      )}

      {timerRunning && isHost && (
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={paused ? onResume : onPause}
        >
          {busy ? '…' : paused ? 'Relancer le chrono' : 'Pause chrono'}
        </button>
      )}

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
          {typeof correctIndex === 'number' &&
            correctIndex >= 0 &&
            correctIndex <= 3 && (
            <QuestionFeedback
              questionId={q.id}
              question={q.question}
              answers={q.answers}
              correctIndex={correctIndex as 0 | 1 | 2 | 3}
              explanation={q.explanation}
              sourceType={q.sourceType}
              theme={room.theme}
              difficulty={room.difficulty}
              mode="multi"
              playerCorrect={Boolean(myCorrect)}
              selectedIndex={typeof myAnswer === 'number' ? myAnswer : -1}
            />
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
                  <StreakFlame streak={p.streakActuelle ?? 0} />
                </span>
                <span>
                  {noAnswer ? '⏱' : ok ? '✓' : '✗'} {p.score} pts
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {!revealing && !needsHostStart && hasAnswered && (
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

      <PlayersStreakBar room={room} playerId={playerId} />

      <HostPlayersPanel
        room={room}
        playerId={playerId}
        busy={busy}
        onKick={onKick}
      />

      <button type="button" className="multi-play__leave" onClick={onLeave}>
        Quitter
      </button>
    </section>
  )
}
