import { useEffect, useMemo, useState } from 'react'
import type { MultiRoom } from '../lib/multiApi'
import type { Difficulty } from '../types'
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  PASS_THRESHOLD,
} from '../types'
import {
  FLAG_DIFFICULTIES,
  FLAG_DIFFICULTY_LABELS,
  clampFlagCount,
  flagCountSteps,
  isFlagTheme,
  parseFlagDifficulty,
  type FlagDifficulty,
} from '../lib/flagQuiz'
import { HostPlayersPanel } from './HostPlayersPanel'
import { ProgressBar } from './ProgressBar'
import './MultiScoreboard.css'

interface MultiScoreboardProps {
  room: MultiRoom
  playerId: string
  busy?: boolean
  error?: string | null
  onReplay: () => void
  onReplayFlags?: (input: {
    flagDifficulty: FlagDifficulty
    flagCount: number
  }) => void
  onContinueTier: () => void
  onRestartTiers: () => void
  onSetDifficulty: (difficulty: Difficulty) => void
  /** Hôte : ramène tout le monde au lobby (changer de thème, etc.) */
  onBackToLobby: () => void
  onLeave: () => void
  onKick: (targetPlayerId: string) => void
}

export function MultiScoreboard({
  room,
  playerId,
  busy,
  error,
  onReplay,
  onReplayFlags,
  onContinueTier,
  onRestartTiers,
  onSetDifficulty,
  onBackToLobby,
  onLeave,
  onKick,
}: MultiScoreboardProps) {
  const isFlags = isFlagTheme(room.theme)
  const roomFlagDifficulty = parseFlagDifficulty(room.flagDifficulty)
  const roomFlagCount = room.flagCount || room.questions.length || 10
  const [replayFlagDifficulty, setReplayFlagDifficulty] =
    useState<FlagDifficulty>(roomFlagDifficulty)
  const [replayFlagCount, setReplayFlagCount] = useState(roomFlagCount)

  useEffect(() => {
    if (!isFlags) return
    setReplayFlagDifficulty(roomFlagDifficulty)
    setReplayFlagCount(roomFlagCount)
  }, [isFlags, roomFlagDifficulty, roomFlagCount])

  const flagSteps = useMemo(
    () => flagCountSteps(replayFlagDifficulty),
    [replayFlagDifficulty],
  )
  const flagCountClamped = useMemo(
    () => clampFlagCount(replayFlagDifficulty, replayFlagCount),
    [replayFlagDifficulty, replayFlagCount],
  )

  const total = room.questions.length || (isFlags ? roomFlagCount : 10)
  const baseOf = (score: number, bonus?: number) =>
    Math.max(0, score - (bonus ?? 0))
  const ranked = [...room.players].sort((a, b) => b.score - a.score)
  const isHost = playerId === room.hostId
  const difficulty: Difficulty =
    room.difficulty === 'medium' || room.difficulty === 'hard'
      ? room.difficulty
      : 'easy'
  const playMode =
    isFlags || room.playMode !== 'progression' ? 'free' : 'progression'
  const allPassed =
    room.players.length > 0 &&
    room.players.every(
      (p) => baseOf(p.score, p.bonusApplique) >= PASS_THRESHOLD,
    )
  const curIdx = DIFFICULTIES.indexOf(difficulty)
  const nextDifficulty =
    !isFlags && allPassed && curIdx >= 0 && curIdx < DIFFICULTIES.length - 1
      ? DIFFICULTIES[curIdx + 1]
      : null
  const allTiersDone = !isFlags && allPassed && nextDifficulty === null

  const winner = ranked[0]
  const you = ranked.find((p) => p.id === playerId)
  const yourRank = ranked.findIndex((p) => p.id === playerId) + 1
  const avg =
    ranked.length > 0
      ? ranked.reduce((s, p) => s + p.score, 0) / ranked.length
      : 0
  const perfectCount = ranked.filter(
    (p) => baseOf(p.score, p.bonusApplique) >= total,
  ).length
  const timerOn = room.timerEnabled !== false

  return (
    <section className="multi-dash">
      <header className="multi-dash__hero">
        <p className="multi-dash__eyebrow">Fin de partie</p>
        <h2 className="multi-dash__title">Dashboard</h2>
        <p className="multi-dash__meta">
          {room.theme}
          {isFlags
            ? ` · ${FLAG_DIFFICULTY_LABELS[roomFlagDifficulty]} · ${roomFlagCount} drapeaux`
            : ` · ${DIFFICULTY_LABELS[difficulty]}${
                playMode === 'progression' ? ' · Paliers' : ' · Libre'
              }`}
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
            {(() => {
              const bonus = winner.bonusApplique ?? 0
              const base = Math.max(0, winner.score - bonus)
              return bonus > 0
                ? `${winner.score} pts (${base}/${total} +${bonus} 🔥)`
                : `${base}/${total}`
            })()}
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
          Toi : <strong>#{yourRank}</strong> —{' '}
          {(() => {
            const bonus = you.bonusApplique ?? 0
            const base = baseOf(you.score, bonus)
            return bonus > 0
              ? `${you.score} pts (${base}/${total} +${bonus} 🔥)`
              : `${base}/${total} (${Math.round((base / total) * 100)}%)`
          })()}
        </p>
      )}

      {playMode === 'progression' && (
        <>
          <ProgressBar current={difficulty} finished={allTiersDone} />
          <p className="multi-dash__tier-msg">
            {allTiersDone
              ? 'Tous les paliers sont terminés. Bravo à toute l’équipe !'
              : allPassed && nextDifficulty
                ? `Au moins ${PASS_THRESHOLD}/${total} pour tout le monde — palier ${DIFFICULTY_LABELS[nextDifficulty]} débloqué.`
                : `Il faut ${PASS_THRESHOLD}/${total} pour chaque joueur pour avancer.`}
          </p>
        </>
      )}

      <div className="multi-dash__board">
        <h3 className="multi-dash__board-title">Classement</h3>
        <ol className="multi-dash__list">
          {ranked.map((p, i) => {
            const isYou = p.id === playerId
            const bonus = p.bonusApplique ?? 0
            const base = baseOf(p.score, bonus)
            const passed = base >= PASS_THRESHOLD
            const pct = Math.round((base / total) * 100)
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
                  <div className="multi-dash__bar" aria-hidden>
                    <div
                      className="multi-dash__bar-fill"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
                <span className="multi-dash__pts">
                  {bonus > 0 ? (
                    <>
                      {p.score} pts
                      <small className="multi-dash__bonus">
                        {' '}
                        ({base}/{total}+{bonus}🔥)
                      </small>
                    </>
                  ) : (
                    <>
                      {base}/{total}
                    </>
                  )}
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
          {isFlags ? (
            <>
              <div className="multi-dash__diffs">
                <p className="multi-dash__diffs-label">
                  Rejouer — difficulté drapeaux
                </p>
                <div
                  className="multi-dash__diffs-btns multi-dash__diffs-btns--flags"
                  role="group"
                  aria-label="Difficulté drapeaux"
                >
                  {FLAG_DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`btn${replayFlagDifficulty === d ? ' btn--primary' : ' btn--secondary'}`}
                      disabled={busy}
                      aria-pressed={replayFlagDifficulty === d}
                      onClick={() => {
                        setReplayFlagDifficulty(d)
                        setReplayFlagCount((c) => clampFlagCount(d, c))
                      }}
                    >
                      {FLAG_DIFFICULTY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="multi-dash__diffs">
                <p className="multi-dash__diffs-label">Nombre de drapeaux</p>
                <div
                  className="multi-dash__flag-counts"
                  role="group"
                  aria-label="Nombre de drapeaux"
                >
                  {flagSteps.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`multi-dash__flag-count${flagCountClamped === n ? ' is-selected' : ''}`}
                      disabled={busy}
                      aria-pressed={flagCountClamped === n}
                      onClick={() => setReplayFlagCount(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() =>
                  onReplayFlags
                    ? onReplayFlags({
                        flagDifficulty: replayFlagDifficulty,
                        flagCount: flagCountClamped,
                      })
                    : onReplay()
                }
                disabled={busy}
              >
                Rejouer ({FLAG_DIFFICULTY_LABELS[replayFlagDifficulty]} ·{' '}
                {flagCountClamped})
              </button>
            </>
          ) : playMode === 'progression' ? (
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
                  Rejouer — choisis la difficulté
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
            onClick={onBackToLobby}
            disabled={busy}
            title="Ramène tout le monde au lobby pour changer de thème"
          >
            Retour lobby (tous)
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onLeave}
            disabled={busy}
          >
            Quitter la salle
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
