const STORAGE_KEY = 'quizz:morpionSession'

export interface MorpionSession {
  code: string
  playerId: string
  playerName: string
  savedAt: number
}

export function saveMorpionSession(
  session: Omit<MorpionSession, 'savedAt'>,
): void {
  try {
    const payload: MorpionSession = {
      ...session,
      code: session.code.trim().toUpperCase(),
      savedAt: Date.now(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* private mode / quota */
  }
}

export function loadMorpionSession(): MorpionSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<MorpionSession>
    if (
      typeof data.code !== 'string' ||
      typeof data.playerId !== 'string' ||
      typeof data.playerName !== 'string'
    ) {
      return null
    }
    return {
      code: data.code.trim().toUpperCase(),
      playerId: data.playerId,
      playerName: data.playerName,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function clearMorpionSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
