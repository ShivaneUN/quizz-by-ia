/** Envoie anonyme le résultat d’une manche pour calibrer la difficulté IA */

export interface CalibHandPayload {
  mode: 'solo' | 'multi'
  theme: string
  scope: 'fr' | 'international'
  difficulty: 'easy' | 'medium' | 'hard'
  correct: number
  answered: number
  playMode?: 'progression' | 'free' | 'manual'
  roomCode?: string
}

/** Fire-and-forget — ne bloque jamais le jeu */
export function reportCalibHand(payload: CalibHandPayload): void {
  try {
    void fetch('/api/calib-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, at: Date.now() }),
      keepalive: true,
    }).catch(() => {
      /* ignore */
    })
  } catch {
    /* ignore */
  }
}
