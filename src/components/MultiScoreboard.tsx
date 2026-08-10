import type { MultiRoom } from '../lib/multiApi'
import type { Difficulty } from '../types'
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  PASS_THRESHOLD,
} from '../types'
import { HostPlayersPanel } from './HostPlayersPanel'
import { ProgressBar } from './ProgressBar'
import './MultiScoreboard.css'

interface MultiScoreboardProps {
  room: MultiRoom
  playerId: string
  busy?: boolean
  error?: string | null
  onReplay: () => void
  onContinueTier: () => void
  onRestartTiers: () => void
  onChangeTheme: () => void
  onSetDifficulty: (difficulty: Difficulty) => void
  onCloseRoom: () => void
  onLeave: () => void
  onKick: (targetPlayerId: string) => void
}

export function MultiScoreboard({
  room,
  playerId,
  busy,
  error,
  onReplay,
  onContinueTier,
  onRestartTiers,
  onChangeTheme,
  onSetDifficulty,
  onCloseRoom,
  onLeave,
  onKick,
}: MultiScoreboardProps) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score)
  const total = room.questions.length || 10
  const isHost = playerId === room.hostId
  const difficulty: Difficulty =
    room.difficulty === 'medium' || room.difficulty === 'hard'
      ? room.difficulty
      : 'easy'
  const playMode = room.playMode === 'progression' ? 'progression' : 'free'
  const allPassed =
    room.players.length > 0 &&
    room.players.every((p) => p.score >= PASS_THRESHOLD)
  const curIdx = DIFFICULTIES.indexOf(difficulty)
  const nextDifficulty =
    allPassed && curIdx >= 0 && curIdx < DIFFICULTIES.length - 1
      ? DIFFICULTIES[curIdx + 1]
      : null
  const allTiersDone = allPassed && nextDifficulty === null

  const winner = ranked[0]
  const you = ranked.find((p) => p.id === playerId)
  const yourRank = ranked.findIndex((p) => p.id === playerId) + 1
  const avg =
    ranked.length > 0
      ? ranked.reduce((s, p) => s + p.score, 0) / ranked.length
      : 0
  const perfectCount = ranked.filter((p) => p.score >= total).length
  const timerOn = room.timerEnabled !== false

  return (
    <section className="multi-dash">
      <header className="multi-dash__hero">
        <p className="multi-dash__eyebrow">Fin de partie</p>
        <h2 className="multi-dash__title">Dashboard</h2>
        <p className="multi-dash__meta">
          {room.theme} · {DIFFICULTY_LABELS[difficulty]}
          {playMode === 'progression' ? ' · Paliers' : ' · Libre'}
          {timerOn ? ' · Chrono' : ' · Sans chrono'}
          {` · ${room.code}`}
        </p>
      </header>

      {winner && (
        <div className="multi-dash__winner">
          <p className="multi-dash__winner-label">1ʳᵉ place</p>
          <p className="multi-dash__winner-name">
            {winner.name}
            {winner.id === playerId ? ' (toi)' : ''}
          </p>
          <p className="multi-dash__winner-score">
            {winner.score}/{total}
          </p>
        </div>
      )}

      <div className="multi-dash__stats" aria-label="Statistiques">
        <div className="multi-dash__stat">
          <span className="multi-dash__stat-value">{ranked.length}</span>
          <span className="multi-dash__stat-label">Joueurs</span>
        </div>
        <div className="multi-dash__stat">
          <span className="multi-dash__stat-value">{total}</span>
          <span className="multi-dash__stat-label">Questions</span>
        </div>
        <div className="multi-dash__stat">
          <span className="multi-dash__stat-value">{avg.toFixed(1)}</span>
          <span className="multi-dash__stat-label">Moyenne</span>
        </div>
        <div className="multi-dash__stat">
          <span className="multi-dash__stat-value">{perfectCount}</span>
          <span className="multi-dash__stat-label">Sans faute</span>
        </div>
      </div>

      {you && (
        <p className="multi-dash__you">
          Toi : <strong>#{yourRank}</strong> — {you.score}/{total} (
          {Math.round((you.score / total) * 100)}%)
        </p>
      )}

      {playMode === 'progression' && (
        <>
          <ProgressBar current={difficulty} finished={allTiersDone} />
          <p className="multi-dash__tier-msg">
            {allTiersDone
              ? 'Tous les paliers sont terminés. Bravo à toute l’équipe !'
              : allPassed && nextDifficulty
                ? `10/10 pour tout le monde ! Palier ${DIFFICULTY_LABELS[nextDifficulty]} débloqué.`
                : `Il faut ${PASS_THRESHOLD}/${total} pour chaque joueur pour avancer.`}
          </p>
        </>
      )}

      <div className="multi-dash__board">
        <h3 className="multi-dash__board-title">Classement</h3>
        <ol className="multi-dash__list">
          {ranked.map((p, i) => {
            const isYou = p.id === playerId
            const passed = p.score >= PASS_THRESHOLD
            const pct = Math.round((p.score / total) * 100)
            return (
              <li
                key={p.id}
                className={`multi-dash__row${isYou ? ' is-you' : ''}${i === 0 ? ' is-first' : ''}`}
              >
                <span className="multi-dash__rank">#{i + 1}</span>
                <div className="multi-dash__player">
                  <span className="multi-dash__name">
                    {p.name}
                    {isYou ? ' (toi)' : ''}
                    {p.id === room.hostId ? ' · hôte' : ''}
                    {playMode === 'progression' && (
                      <span
                        className={`multi-dash__pass${passed ? ' is-ok' : ' is-ko'}`}
                      >
                        {passed ? ' · OK' : ' · —'}
                      </span>
                    )}
                  </span>
                  <span
                    className="multi-dash__bar"
                    aria-hidden
                  >
                    <span
                      className="multi-dash__bar-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </div>
                <span className="multi-dash__pts">
                  {p.score}/{total}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      {error && <p className="multi-dash__error">{error}</p>}

      {isHost && (
        <HostPlayersPanel
          room={room}
          playerId={playerId}
          busy={busy}
          onKick={onKick}
        />
      )}

      {isHost ? (
        <div className="multi-dash__actions">
          {playMode === 'progression' ? (
            <>
              {allTiersDone ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={onRestartTiers}
                  disabled={busy}
                >
                  Recommencer depuis Facile
                </button>
              ) : allPassed && nextDifficulty ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={onContinueTier}
                  disabled={busy}
                >
                  Continuer — {DIFFICULTY_LABELS[nextDifficulty]}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={onReplay}
                  disabled={busy}
                >
                  Réessayer {DIFFICULTY_LABELS[difficulty]}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="multi-dash__diffs">
                <p className="multi-dash__diffs-label">
                  Difficulté pour la suite
                </p>
                <div
                  className="multi-dash__diffs-btns"
                  role="group"
                  aria-label="Difficulté"
                >
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`btn${difficulty === d ? ' btn--primary' : ' btn--secondary'}`}
                      disabled={busy}
                      aria-pressed={difficulty === d}
                      onClick={() => onSetDifficulty(d)}
                    >
                      {DIFFICULTY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={onReplay}
                disabled={busy}
              >
                Rejouer ({DIFFICULTY_LABELS[difficulty]})
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onChangeTheme}
            disabled={busy}
          >
            Changer de thème
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCloseRoom}
            disabled={busy}
          >
            Fermer la salle
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onLeave}
            disabled={busy}
          >
            Quitter (les autres restent)
          </button>
        </div>
      ) : (
        <div className="multi-dash__actions">
          <p className="multi-dash__wait">En attente de l’hôte…</p>
          <button type="button" className="btn btn--ghost" onClick={onLeave}>
            Quitter la salle
          </button>
        </div>
      )}
    </section>
  )
}
