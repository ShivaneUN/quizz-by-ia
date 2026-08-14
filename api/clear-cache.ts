import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearAllQuestionHistory } from '../server/questionHistory.js'

/**
 * POST /api/clear-cache
 * Vide l’historique multi des questions déjà servies (tous thèmes).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const cleared = await clearAllQuestionHistory()
    return res.status(200).json({ ok: true, multiHistoriesCleared: cleared })
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : 'Erreur serveur',
    })
  }
}
