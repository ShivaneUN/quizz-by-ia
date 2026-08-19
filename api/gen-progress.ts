import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getGenProgress,
  isValidProgressId,
} from '../server/genProgress.js'

/**
 * GET /api/gen-progress?id=…
 * Compteur questions générées pendant un appel solo.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const id = String(req.query.id ?? '').trim()
  if (!isValidProgressId(id)) {
    return res.status(400).json({ error: 'id invalide' })
  }

  try {
    const prog = await getGenProgress(id)
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
