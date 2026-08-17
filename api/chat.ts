import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminSecret } from '../server/adminAuth.js'
import {
  clearChatForEveryone,
  listChatMessages,
  sendChatMessage,
  touchSitePresence,
} from '../server/chat.js'

export const config = {
  maxDuration: 15,
}

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  return res.json(body)
}

/**
 * POST /api/chat { action: 'send'|'list'|'presence'|'clearAll', … }
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
    const action = String(body.action ?? 'list')
    const channel = body.channel === 'global' ? 'global' : 'room'
    const code = String(body.code ?? '').trim().toUpperCase()

    if (action === 'presence') {
      const online = await touchSitePresence(String(body.playerId ?? ''))
      return json(res, 200, { online })
    }

    if (action === 'clearAll') {
      if (!isAdminSecret(body.secret)) {
        return json(res, 401, { error: 'secret invalide' })
      }
      const clearedAt = await clearChatForEveryone()
      return json(res, 200, { ok: true, clearedAt })
    }

    if (action === 'list') {
      const { messages, clearedAt } = await listChatMessages({
        channel,
        roomCode: code || undefined,
        afterId:
          typeof body.afterId === 'string' ? body.afterId : undefined,
      })
      return json(res, 200, { messages, clearedAt })
    }

    if (action === 'send') {
      const result = await sendChatMessage({
        channel,
        roomCode: code || undefined,
        playerId: String(body.playerId ?? ''),
        playerName: String(body.playerName ?? ''),
        text: String(body.text ?? ''),
      })
      if (result.ok === false) {
        return json(res, 400, { error: result.error })
      }
      return json(res, 200, { message: result.message })
    }

    return json(res, 400, { error: 'action inconnue' })
  } catch (e) {
    return json(res, 500, {
      error: e instanceof Error ? e.message : 'Erreur serveur',
    })
  }
}
