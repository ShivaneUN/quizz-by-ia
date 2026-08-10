/**
 * Persistance locale de la session multi (reconnexion après refresh)
 * + dernière salle rejoignée (rejoin volontaire).
 */

const STORAGE_KEY = 'quizz:multiSession'
const LAST_ROOM_KEY = 'quizz:multiLastRoom'

export interface MultiSession {
  code: string
  playerId: string
  playerName: string
  savedAt: number
}

export interface LastMultiRoom {
  code: string
  playerName: string
  theme?: string
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

/** Mémorise la dernière salle (survît au « Quitter »). */
export function saveLastMultiRoom(
  room: Omit<LastMultiRoom, 'savedAt'>,
): void {
  try {
    const payload: LastMultiRoom = {
      code: room.code.trim().toUpperCase(),
      playerName: room.playerName.trim().slice(0, 24),
      theme: room.theme?.trim() || undefined,
      savedAt: Date.now(),
    }
    if (payload.code.length < 4 || payload.playerName.length < 2) return
    localStorage.setItem(LAST_ROOM_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function loadLastMultiRoom(): LastMultiRoom | null {
  try {
    const raw = localStorage.getItem(LAST_ROOM_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<LastMultiRoom>
    if (typeof data.code !== 'string' || typeof data.playerName !== 'string') {
      return null
    }
    const code = data.code.trim().toUpperCase()
    const playerName = data.playerName.trim()
    if (code.length < 4 || playerName.length < 2) return null
    return {
      code,
      playerName,
      theme: typeof data.theme === 'string' ? data.theme : undefined,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function clearLastMultiRoom(): void {
  try {
    localStorage.removeItem(LAST_ROOM_KEY)
  } catch {
    /* ignore */
  }
}
