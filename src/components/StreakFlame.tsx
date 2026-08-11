import './StreakFlame.css'

interface StreakFlameProps {
  streak: number
}

/** Flamme visible dès 3 bonnes réponses d’affilée. */
export function StreakFlame({ streak }: StreakFlameProps) {
  if (streak < 3) return null
  const tier = streak >= 8 ? 'lg' : streak >= 5 ? 'md' : 'sm'
  return (
    <span
      className={`streak-flame streak-flame--${tier}`}
      title={`Série : ${streak}`}
      aria-label={`Série de ${streak}`}
    >
      🔥
      <span className="streak-flame__n">{streak}</span>
    </span>
  )
}
