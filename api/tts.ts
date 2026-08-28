import type { VercelRequest, VercelResponse } from '@vercel/node'
import { synthesizeQuizSpeech } from '../server/tts.js'

export const config = {
  maxDuration: 25,
}

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  return res.json(body)
}

/**
 * POST /api/tts { voice, question, answers, answerMode? }
 * Réponse : audio/mpeg
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const result = await synthesizeQuizSpeech(body)
    if (result.ok === false) {
      return json(res, result.status, { error: result.error })
    }
    res.statusCode = 200
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.send(result.audio)
  } catch (e) {
    return json(res, 500, {
      error: e instanceof Error ? e.message : 'Erreur serveur',
    })
  }
}
