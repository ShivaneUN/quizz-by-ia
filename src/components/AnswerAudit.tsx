import type { AuditEntry } from '../types/audit'
import { QuestionFeedback } from './QuestionFeedback'
import './AnswerAudit.css'

interface AnswerAuditProps {
  entries: AuditEntry[]
  /** Compacte pendant le jeu ; détaillée en fin de palier */
  compact?: boolean
  theme?: string
  difficulty?: string
  mode?: 'solo' | 'multi'
}

/** Prefère le libellé audit (Titre — Artiste Deezer) si fourni. */
export function revealCorrectAnswer(
  explanation: string | undefined,
  fallback: string,
  revealAnswer?: string,
): string {
  if (revealAnswer?.trim()) return revealAnswer.trim()
  const deezer = explanation?.match(
    /«\s*(.+?)\s*»\s*de\s*([^(]+?)(?:\s*\(|\.|$)/i,
  )
  if (deezer?.[1] && deezer[2]) {
    return `${deezer[1].trim()} — ${deezer[2].trim()}`
  }
  const m = explanation?.match(/^Bonne réponse\s*:\s*(.+?)(?:\.\s|$)/i)
  if (m?.[1]?.trim()) return m[1].trim()
  return fallback
}

/** Historique correct / faux au fil des réponses */
export function AnswerAudit({
  entries,
  compact = true,
  theme,
  difficulty,
  mode = 'solo',
}: AnswerAuditProps) {
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
        {entries.map((e, i) => {
          const good = revealCorrectAnswer(
            e.explanation,
            e.answers[e.correctIndex] ?? '',
            e.revealAnswer,
          )
          return (
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

                <p className="answer-audit__good">
                  {e.correct ? 'Réponse' : 'Bonne réponse'} : {good}
                </p>

                {e.coverUrl && (
                  <img
                    className="answer-audit__cover"
                    src={e.coverUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                )}

                {e.explanation && (
                  <p className="answer-audit__explain">{e.explanation}</p>
                )}
                {e.sourceType && (
                  <p className="answer-audit__source">Source : {e.sourceType}</p>
                )}

                {e.correctIndex >= 0 && e.correctIndex <= 3 && (
                  <QuestionFeedback
                    compact={compact}
                    questionId={e.questionId}
                    question={e.question}
                    answers={e.answers}
                    correctIndex={e.correctIndex as 0 | 1 | 2 | 3}
                    explanation={e.explanation}
                    sourceType={e.sourceType}
                    theme={theme}
                    difficulty={difficulty}
                    mode={mode}
                    playerCorrect={e.correct}
                    selectedIndex={e.selectedIndex}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
