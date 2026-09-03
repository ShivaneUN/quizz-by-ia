import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminSecret } from '../server/adminAuth.js'
import {
  clearPenduAiLog,
  fillPenduWords,
  listPenduAiLog,
} from '../server/penduAi.js'
import { logError } from '../server/errorLog.js'

export const config = {
  maxDuration: 20,
}

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  return res.json(body)
}

function authorized(req: VercelRequest): boolean {
  const q = typeof req.query.secret === 'string' ? req.query.secret : ''
  const h = String(req.headers['x-calib-secret'] ?? '')
  return isAdminSecret(q) || isAdminSecret(h)
}

/**
 * POST /api/pendu-words { action: 'fill'|'list'|'clear', … }
 * GET  /api/pendu-words?secret=… — log admin
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-Calib-Secret',
    )
    return res.status(204).end()
  }

  try {
    if (req.method === 'GET') {
      if (!authorized(req)) {
        return json(res, 401, { error: 'secret invalide' })
      }
      const events = await listPenduAiLog(400)
      const words = [...new Set(events.flatMap((e) => e.words))]
      return json(res, 200, {
        count: events.length,
        wordCount: words.length,
        events,
        dump: words,
      })
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' })
    }

    const body = (req.body ?? {}) as Record<string, unknown>
    const action = String(body.action ?? 'fill')

    if (action === 'list' || action === 'clear') {
      if (!isAdminSecret(body.secret)) {
        return json(res, 401, { error: 'secret invalide' })
      }
      if (action === 'clear') {
        await clearPenduAiLog()
        return json(res, 200, { ok: true })
      }
      const events = await listPenduAiLog(400)
      const words = [...new Set(events.flatMap((e) => e.words))]
      return json(res, 200, {
        count: events.length,
        wordCount: words.length,
        events,
        dump: words,
      })
    }

    if (action === 'fill') {
      const difficulty =
        body.difficulty === 'medium' || body.difficulty === 'hard'
          ? body.difficulty
          : 'easy'
      const count = Number(body.count)
      const exclude = Array.isArray(body.exclude)
        ? body.exclude.filter((x): x is string => typeof x === 'string')
        : []
      const filled = await fillPenduWords({
        count,
        difficulty,
        exclude,
        mode: typeof body.mode === 'string' ? body.mode : 'solo',
        allowAi: body.wordSource !== 'bank' && body.allowAi !== false,
      })
      return json(res, 200, filled)
    }

    return json(res, 400, { error: 'action inconnue' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur serveur'
    logError({
      scope: 'api',
      message,
      path: '/api/pendu-words',
      instead: 'Filet pendu — recycle banque si possible',
    })
    return json(res, 500, { error: message })
  }
}
