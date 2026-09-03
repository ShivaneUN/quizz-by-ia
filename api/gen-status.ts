import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getGenerationEstimateSec } from '../server/genStats.js'
import {
  getGenProgress,
  isValidProgressId,
} from '../server/genProgress.js'

/**
 * GET /api/gen-status?kind=solo|multi — ETA génération
 * GET /api/gen-status?id=… — progression lot en cours
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const progressId = String(req.query.id ?? '').trim()
  if (progressId) {
    if (!isValidProgressId(progressId)) {
      return res.status(400).json({ error: 'id invalide' })
    }
    try {
      const prog = await getGenProgress(progressId)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      return res.status(200).json({
        done: prog?.done ?? 0,
        total: prog?.total ?? 10,
        engine: prog?.engine ?? null,
        stage: prog?.stage ?? null,
      })
    } catch (e) {
      return res.status(500).json({
        error: e instanceof Error ? e.message : 'Erreur serveur',
      })
    }
  }

  try {
    const raw = String(req.query.kind ?? 'solo')
    const kind = raw === 'multi' ? 'multi' : 'solo'
    const { estimateSec, samples } = await getGenerationEstimateSec(kind)
    return res.status(200).json({ estimateSec, samples, kind })
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : 'Erreur serveur',
    })
  }
}
