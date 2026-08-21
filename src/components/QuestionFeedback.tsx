import { useState } from 'react'
import {
  reportQuestionFeedback,
  isVerifyImplausible,
  type FeedbackKind,
  type QuestionFeedbackPayload,
} from '../lib/questionFeedback'
import { lookupFactCheck, type FactCheckResult } from '../lib/factCheck'
import './QuestionFeedback.css'

type Props = Omit<QuestionFeedbackPayload, 'kind'> & {
  className?: string
  /** Compact = audit pendant le jeu */
  compact?: boolean
}

type VerifyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; result: FactCheckResult }
  | { status: 'empty' }
  | { status: 'error'; message: string }

const VERDICT_LABEL: Record<string, string> = {
  ok: 'Fait plausible',
  douteux: 'Douteux',
  faux: 'Probablement faux',
  inconnu: 'Non confirmé',
}

function logReviewIfNeeded(
  props: Props,
  partial: {
    verdict?: FactCheckResult['verdict']
    answerVerdict?: FactCheckResult['answerVerdict']
    sourceVerdict?: FactCheckResult['sourceVerdict']
    sourcesConfirmed?: number
    confirmingSources?: string
    title?: string
    extract?: string
    provider?: string
    note?: string
  },
) {
  if (
    !isVerifyImplausible({
      verdict: partial.verdict,
      answerVerdict: partial.answerVerdict,
      sourceVerdict: partial.sourceVerdict,
      sourcesConfirmed: partial.sourcesConfirmed,
    })
  ) {
    return
  }
  reportQuestionFeedback({
    ...props,
    kind: 'review',
    verdict: partial.verdict ?? 'inconnu',
    answerVerdict: partial.answerVerdict ?? partial.verdict ?? 'inconnu',
    sourceVerdict: partial.sourceVerdict ?? 'inconnu',
    verifyProvider: partial.provider,
    verifyTitle: partial.title,
    verifyNote: partial.note ?? partial.extract?.slice(0, 400),
    sourcesConfirmed: partial.sourcesConfirmed,
    confirmingSources: partial.confirmingSources,
  })
}

/** 👍 / 👎 / Vérifier — contrôle réponse + source déclarée */
export function QuestionFeedback(props: Props) {
  const [sent, setSent] = useState<FeedbackKind | null>(null)
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' })
  const correctAnswer = props.answers[props.correctIndex] ?? ''

  async function runVerify() {
    if (verify.status === 'loading') return
    setVerify({ status: 'loading' })
    reportQuestionFeedback({ ...props, kind: 'verify' })
    try {
      const result = await lookupFactCheck(
        props.question,
        correctAnswer,
        props.theme,
        props.explanation,
        props.sourceType,
        props.answers,
      )
      if (result) {
        setVerify({ status: 'ok', result })
        logReviewIfNeeded(props, {
          verdict: result.verdict,
          answerVerdict: result.answerVerdict,
          sourceVerdict: result.sourceVerdict,
          sourcesConfirmed:
            result.sourcesConfirmed ?? result.confirmingSources?.length ?? 0,
          confirmingSources: (result.confirmingSources ?? [])
            .map((s) => (s.detail ? `${s.name}: ${s.detail}` : s.name))
            .join(' | '),
          title: result.title,
          extract: result.extract,
          provider: result.provider,
          note: [result.answerNote, result.sourceNote].filter(Boolean).join(' · '),
        })
      } else {
        setVerify({ status: 'empty' })
        logReviewIfNeeded(props, {
          verdict: 'inconnu',
          answerVerdict: 'inconnu',
          sourceVerdict: 'inconnu',
          note: 'Vérification sans résultat',
        })
      }
    } catch {
      setVerify({
        status: 'error',
        message: 'Vérification indisponible pour le moment.',
      })
      logReviewIfNeeded(props, {
        verdict: 'inconnu',
        answerVerdict: 'inconnu',
        sourceVerdict: 'inconnu',
        note: 'Erreur de vérification',
      })
    }
  }

  function sendVote(kind: 'up' | 'down') {
    if (sent) return
    reportQuestionFeedback({ ...props, kind })
    setSent(kind)
  }

  const panelOpen = verify.status !== 'idle'

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
          className={`q-feedback__btn q-feedback__btn--verify${panelOpen ? ' is-on' : ''}`}
          disabled={verify.status === 'loading'}
          onClick={() => void runVerify()}
          title="Vérifier la bonne réponse et la source déclarée"
        >
          {verify.status === 'loading'
            ? 'Vérif…'
            : panelOpen
              ? 'Revérifier'
              : 'Vérifier'}
        </button>
        {!props.compact && (
          <>
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
          </>
        )}
      </div>

      {panelOpen && (
        <div className="q-feedback__panel" role="region" aria-live="polite">
          <p className="q-feedback__panel-query">
            Contrôle : réponse <strong>{correctAnswer}</strong>
            {props.sourceType?.trim() ? (
              <>
                {' '}
                · source <strong>{props.sourceType.trim()}</strong>
              </>
            ) : null}
          </p>
          {verify.status === 'loading' && (
            <p className="q-feedback__panel-status">
              Vérification IA (réponse + source, min. 2 confirmations)…
            </p>
          )}
          {verify.status === 'ok' && (
            <>
              <p className="q-feedback__panel-title">
                {verify.result.title}
                <span className="q-feedback__panel-lang"> · IA</span>
              </p>
              <ul className="q-feedback__checks">
                <li
                  className={`q-feedback__check q-feedback__check--${verify.result.answerVerdict ?? verify.result.verdict ?? 'inconnu'}`}
                >
                  <span className="q-feedback__check-label">Réponse</span>
                  <span className="q-feedback__check-verdict">
                    {VERDICT_LABEL[
                      verify.result.answerVerdict ??
                        verify.result.verdict ??
                        'inconnu'
                    ]}
                  </span>
                  {verify.result.answerNote ? (
                    <span className="q-feedback__check-note">
                      {verify.result.answerNote}
                    </span>
                  ) : null}
                </li>
                <li
                  className={`q-feedback__check q-feedback__check--${verify.result.sourceVerdict ?? 'inconnu'}`}
                >
                  <span className="q-feedback__check-label">Source</span>
                  <span className="q-feedback__check-verdict">
                    {VERDICT_LABEL[verify.result.sourceVerdict ?? 'inconnu']}
                  </span>
                  {verify.result.sourceNote ? (
                    <span className="q-feedback__check-note">
                      {verify.result.sourceNote}
                    </span>
                  ) : props.sourceType?.trim() ? (
                    <span className="q-feedback__check-note">
                      Source déclarée : {props.sourceType.trim()}
                      {verify.result.source
                        ? ` → ${verify.result.source}`
                        : ''}
                    </span>
                  ) : null}
                </li>
                <li
                  className={`q-feedback__check q-feedback__check--${
                    (verify.result.sourcesConfirmed ?? 0) >= 2 ? 'ok' : 'douteux'
                  }`}
                >
                  <span className="q-feedback__check-label">Confirmations</span>
                  <span className="q-feedback__check-verdict">
                    {verify.result.sourcesConfirmed ?? 0}/2 sources
                  </span>
                  {(verify.result.confirmingSources?.length ?? 0) > 0 ? (
                    <span className="q-feedback__check-note">
                      {verify.result.confirmingSources!
                        .map((s) =>
                          s.detail ? `${s.name} (${s.detail})` : s.name,
                        )
                        .join(' · ')}
                    </span>
                  ) : (
                    <span className="q-feedback__check-note">
                      Moins de 2 sources indépendantes — pas de validation.
                    </span>
                  )}
                </li>
              </ul>
              <p className="q-feedback__panel-extract">{verify.result.extract}</p>
              {verify.result.source ? (
                <p className="q-feedback__panel-source">
                  Source déclarée : {verify.result.source}
                </p>
              ) : null}
            </>
          )}
          {verify.status === 'empty' && (
            <p className="q-feedback__panel-status">
              Impossible de confirmer « {correctAnswer} »
              {props.sourceType?.trim()
                ? ` ni la source « ${props.sourceType.trim()} »`
                : ''}
              . Méfie-toi si l’explication paraît inventée.
            </p>
          )}
          {verify.status === 'error' && (
            <p className="q-feedback__panel-status">{verify.message}</p>
          )}
        </div>
      )}

      {!props.compact && sent && (
        <p className="q-feedback__thanks" role="status">
          Merci — envoyé pour analyse
        </p>
      )}
    </div>
  )
}
