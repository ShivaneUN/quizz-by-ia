import type { AuditEntry } from '../types/audit'
import './AnswerAudit.css'

interface AnswerAuditProps {
  entries: AuditEntry[]
  /** Compacte pendant le jeu ; détaillée en fin de palier */
  compact?: boolean
}

/** Historique correct / faux au fil des réponses */
export function AnswerAudit({ entries, compact = true }: AnswerAuditProps) {
  if (entries.length === 0) return null

  const ok = entries.filter((e) => e.correct).length

  return (
    <aside className={`answer-audit${compact ? ' answer-audit--compact' : ''}`}>
      <div className="answer-audit__head">
        <h3 className="answer-audit__title">Audit</h3>
        <p className="answer-audit__score">
          {ok}/{entries.length} correct{ok > 1 ? 's' : ''}
        </p>
      </div>
      <ol className="answer-audit__list">
        {entries.map((e, i) => (
          <li
            key={`${e.questionId}-${i}`}
            className={`answer-audit__item answer-audit__item--${e.correct ? 'ok' : 'ko'}`}
          >
            <span className="answer-audit__mark" aria-hidden>
              {e.correct ? '✓' : '✗'}
            </span>
            <div className="answer-audit__body">
              <p className="answer-audit__q">
                <span className="answer-audit__n">Q{i + 1}.</span> {e.question}
              </p>

              {!compact && (
                <p className="answer-audit__a">
                  Ta réponse :{' '}
                  {e.selectedIndex < 0
                    ? 'Temps écoulé / pas de réponse'
                    : e.answers[e.selectedIndex]}
                </p>
              )}

              {!e.correct && (
                <p className="answer-audit__good">
                  Bonne réponse : {e.answers[e.correctIndex]}
                </p>
              )}

              {e.explanation && (
                <p className="answer-audit__explain">{e.explanation}</p>
              )}
              {e.sourceType && (
                <p className="answer-audit__source">Source : {e.sourceType}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}
