/** Classement mini-jeux local — séparé du cache questions IA */

const ARCADE_KEY = 'quizz:arcade:scores'

export interface ArcadeScores {
  typingBest: number
  flappyBest: number
  penduBest: number
  updatedAt: number
}

const EMPTY: ArcadeScores = {
  typingBest: 0,
  flappyBest: 0,
  penduBest: 0,
  updatedAt: 0,
}

export function loadArcadeScores(): ArcadeScores {
  try {
    const raw = localStorage.getItem(ARCADE_KEY)
    if (!raw) return { ...EMPTY }
    const data = JSON.parse(raw) as Partial<ArcadeScores>
    return {
      typingBest: Math.max(0, Math.floor(Number(data.typingBest) || 0)),
      flappyBest: Math.max(0, Math.floor(Number(data.flappyBest) || 0)),
      penduBest: Math.max(0, Math.floor(Number(data.penduBest) || 0)),
      updatedAt: Number(data.updatedAt) || 0,
    }
  } catch {
    return { ...EMPTY }
  }
}

/** Enregistre un record si meilleur — ne touche pas aux banques IA. */
export function recordArcadeBest(
  game: 'typing' | 'flappy' | 'pendu',
  score: number,
): ArcadeScores {
  const n = Math.max(0, Math.floor(score))
  const cur = loadArcadeScores()
  const key =
    game === 'typing'
      ? 'typingBest'
      : game === 'flappy'
        ? 'flappyBest'
        : 'penduBest'
  if (n <= cur[key]) return cur
  const next: ArcadeScores = {
    ...cur,
    [key]: n,
    updatedAt: Date.now(),
  }
  localStorage.setItem(ARCADE_KEY, JSON.stringify(next))
  return next
}

/** Vide uniquement le classement mini-jeux (pas les questions IA). */
export function clearArcadeScores(): boolean {
  const had = localStorage.getItem(ARCADE_KEY) != null
  localStorage.removeItem(ARCADE_KEY)
  return had
}
