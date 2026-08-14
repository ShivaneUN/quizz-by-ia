import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getGenerationEstimateSec } from '../server/genStats.js'

/**
 * GET /api/gen-eta?kind=solo|multi
 * Estimation médiane basée sur les durées réelles récentes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
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
