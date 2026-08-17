import { useState } from 'react'
import {
  reportQuestionFeedback,
  type FeedbackKind,
  type QuestionFeedbackPayload,
} from '../lib/questionFeedback'
import './QuestionFeedback.css'

type Props = Omit<QuestionFeedbackPayload, 'kind'> & {
  className?: string
}

/** 👍 / 👎 / À vérifier — envoie le log complet côté serveur */
export function QuestionFeedback(props: Props) {
  const [sent, setSent] = useState<FeedbackKind | null>(null)
  const [verifyDone, setVerifyDone] = useState(false)

  function send(kind: FeedbackKind) {
    if (kind === 'verify') {
      if (verifyDone) return
      reportQuestionFeedback({ ...props, kind })
      setVerifyDone(true)
      return
    }
    if (sent) return
    reportQuestionFeedback({ ...props, kind })
    setSent(kind)
  }

  return (
    <div className={`q-feedback${props.className ? ` ${props.className}` : ''}`}>
      <p className="q-feedback__label">Cette question</p>
      <div className="q-feedback__actions">
        <button
          type="button"
          className={`q-feedback__btn${sent === 'up' ? ' is-on' : ''}`}
          disabled={sent !== null && sent !== 'up'}
          onClick={() => send('up')}
          aria-label="Bonne question"
        >
          👍
        </button>
        <button
          type="button"
          className={`q-feedback__btn${sent === 'down' ? ' is-on' : ''}`}
          disabled={sent !== null && sent !== 'down'}
          onClick={() => send('down')}
          aria-label="Mauvaise question"
        >
          👎
        </button>
        <button
          type="button"
          className={`q-feedback__btn q-feedback__btn--verify${verifyDone ? ' is-on' : ''}`}
          disabled={verifyDone}
          onClick={() => send('verify')}
        >
          {verifyDone ? 'Signalée' : 'À vérifier'}
        </button>
      </div>
      {(sent || verifyDone) && (
        <p className="q-feedback__thanks" role="status">
          Merci — envoyé pour analyse
        </p>
      )}
    </div>
  )
}
