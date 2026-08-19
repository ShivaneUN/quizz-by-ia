import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminSecret } from '../server/adminAuth.js'
import { getAiCapacitySnapshot } from '../server/aiRotate.js'

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  return res.json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { error: 'Method not allowed' })
  }

  const q = typeof req.query.secret === 'string' ? req.query.secret : ''
  const h = String(req.headers['x-calib-secret'] ?? '')
  if (!isAdminSecret(q) && !isAdminSecret(h)) {
    return json(res, 401, { error: 'secret invalide' })
  }

  try {
    const rows = await getAiCapacitySnapshot()
    return json(res, 200, {
      rows,
      note: "Les APIs free n'exposent pas un 'tokens restants' fiable en temps réel. Affichage = capacité/slots disponibles.",
    })
  } catch (e) {
    return json(res, 500, {
      error: e instanceof Error ? e.message : 'Erreur serveur',
    })
  }
}

