/**
 * Persistance locale de la session multi (reconnexion après refresh).
 */

const STORAGE_KEY = 'quizz:multiSession'

export interface MultiSession {
  code: string
  playerId: string
  playerName: string
  savedAt: number
}

export function saveMultiSession(
  session: Omit<MultiSession, 'savedAt'>,
): void {
  try {
    const payload: MultiSession = {
      ...session,
      code: session.code.trim().toUpperCase(),
      savedAt: Date.now(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* private mode / quota */
  }
}

export function loadMultiSession(): MultiSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<MultiSession>
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

export function clearMultiSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
