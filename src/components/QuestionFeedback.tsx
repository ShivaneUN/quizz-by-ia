import { useSyncExternalStore, useState } from 'react'
import {
  reportQuestionFeedback,
  type QuestionFeedbackPayload,
  type ReportTarget,
} from '../lib/questionFeedback'
import {
  getFeedbackSession,
  patchFeedbackSession,
  subscribeFeedbackSession,
} from '../lib/feedbackSession'
import './QuestionFeedback.css'

type Props = Omit<QuestionFeedbackPayload, 'kind' | 'reportTarget'> & {
  className?: string
  /** Compact = audit pendant le jeu */
  compact?: boolean
}

const REPORT_LABEL: Record<ReportTarget, string> = {
  question: 'Question',
  answer: 'Réponse',
  both: 'Les deux',
}

/** 👍 / 👎 / Signaler / Google — sync révélation ↔ audit */
export function QuestionFeedback(props: Props) {
  const session = useSyncExternalStore(
    subscribeFeedbackSession,
    () => getFeedbackSession(props.questionId),
    () => getFeedbackSession(props.questionId),
  )
  const [reportOpen, setReportOpen] = useState(false)
  const correctAnswer = props.answers[props.correctIndex] ?? ''
  const sent = session.vote
  const reported = session.report

  function sendVote(kind: 'up' | 'down') {
    if (session.vote) return
    patchFeedbackSession(props.questionId, { vote: kind })
    reportQuestionFeedback({ ...props, kind })
  }

  function sendReport(target: ReportTarget) {
    if (session.report) return
    patchFeedbackSession(props.questionId, { report: target })
    reportQuestionFeedback({ ...props, kind: 'report', reportTarget: target })
    setReportOpen(false)
  }

  function openGoogle() {
    const parts = [props.question.trim(), correctAnswer.trim()].filter(Boolean)
    const url = `https://www.google.com/search?q=${encodeURIComponent(parts.join(' '))}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className={`q-feedback${props.compact ? ' q-feedback--compact' : ''}${props.className ? ` ${props.className}` : ''}`}
    >
      {!props.compact && (
        <p className="q-feedback__label">Cette question</p>
      )}
      <div className="q-feedback__actions">
        <button
          type="button"
          className={`q-feedback__btn q-feedback__btn--report${reported ? ' is-on' : ''}`}
          disabled={Boolean(reported)}
          onClick={() => setReportOpen(true)}
          title="Signaler un problème"
        >
          {reported ? `Signalé (${REPORT_LABEL[reported]})` : 'Signaler'}
        </button>
        <button
          type="button"
          className="q-feedback__btn q-feedback__btn--google"
          onClick={openGoogle}
          title="Rechercher la question sur Google"
        >
          Google
        </button>
        <button
          type="button"
          className={`q-feedback__btn${sent === 'up' ? ' is-on' : ''}`}
          disabled={sent !== null && sent !== 'up'}
          onClick={() => sendVote('up')}
          aria-label="Bonne question"
        >
          👍
        </button>
        <button
          type="button"
          className={`q-feedback__btn${sent === 'down' ? ' is-on' : ''}`}
          disabled={sent !== null && sent !== 'down'}
          onClick={() => sendVote('down')}
          aria-label="Mauvaise question"
        >
          👎
        </button>
      </div>

      {reportOpen && !reported && (
        <div
          className="q-feedback__report-modal"
          role="dialog"
          aria-modal
          aria-label="Signaler"
        >
          <button
            type="button"
            className="q-feedback__report-backdrop"
            aria-label="Fermer"
            onClick={() => setReportOpen(false)}
          />
          <div className="q-feedback__report-card">
            <p className="q-feedback__report-title">Que signaler ?</p>
            <div className="q-feedback__report-choices">
              <button
                type="button"
                className="q-feedback__btn q-feedback__btn--report"
                onClick={() => sendReport('question')}
              >
                La question
              </button>
              <button
                type="button"
                className="q-feedback__btn q-feedback__btn--report"
                onClick={() => sendReport('answer')}
              >
                La réponse
              </button>
              <button
                type="button"
                className="q-feedback__btn q-feedback__btn--report"
                onClick={() => sendReport('both')}
              >
                Les deux
              </button>
            </div>
            <button
              type="button"
              className="q-feedback__btn"
              onClick={() => setReportOpen(false)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {(sent || reported) && (
        <p className="q-feedback__thanks" role="status">
          {reported && !sent
            ? 'Signalement envoyé'
            : sent && reported
              ? 'Merci — vote + signalement enregistrés'
              : 'Merci — envoyé pour analyse'}
        </p>
      )}
    </div>
  )
}
