import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  createMorpion,
  joinMorpion,
  leaveMorpion,
  listMorpionRooms,
  moveMorpion,
  publicMorpion,
  replayMorpion,
  syncMorpion,
} from '../server/morpion.js'

export const config = {
  maxDuration: 10,
}

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  return res.json(body)
}

function isUserError(message: string): boolean {
  return (
    /introuvable|obligatoire|invalide|déjà prise|Pas ton tour|complète|occupée|code requis/i.test(
      message,
    )
  )
}

/**
 * GET  /api/morpion?code=ABC123
 * GET  /api/morpion?list=1
 * POST /api/morpion  actions: create | join | move | replay | state | list | leave
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }

  try {
    if (req.method === 'GET') {
      if (String(req.query.list ?? '') === '1') {
        const lists = await listMorpionRooms()
        return json(res, 200, lists)
      }
      const code = String(req.query.code ?? '')
      if (!code) return json(res, 400, { error: 'code requis' })
      const playerId = String(req.query.playerId ?? '')
      const room = await syncMorpion(code, playerId || undefined)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      return json(res, 200, { room: publicMorpion(room) })
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' })
    }

    const body = req.body ?? {}
    const action = String(body.action ?? '')

    if (action === 'create') {
      const { room, playerId } = await createMorpion(
        String(body.playerName ?? ''),
      )
      return json(res, 200, { playerId, room: publicMorpion(room) })
    }

    if (action === 'join') {
      const { room, playerId } = await joinMorpion(
        String(body.code ?? ''),
        String(body.playerName ?? ''),
      )
      return json(res, 200, { playerId, room: publicMorpion(room) })
    }

    if (action === 'move') {
      const room = await moveMorpion(
        String(body.code ?? ''),
        String(body.playerId ?? ''),
        Number(body.cell),
      )
      return json(res, 200, { room: publicMorpion(room) })
    }

    if (action === 'replay') {
      const room = await replayMorpion(
        String(body.code ?? ''),
        String(body.playerId ?? ''),
      )
      return json(res, 200, { room: publicMorpion(room) })
    }

    if (action === 'leave') {
      const result = await leaveMorpion(
        String(body.code ?? ''),
        String(body.playerId ?? ''),
      )
      return json(res, 200, {
        left: result.left,
        closed: result.closed,
        room: result.room ? publicMorpion(result.room) : null,
      })
    }

    if (action === 'state') {
      const code = String(body.code ?? '')
      if (!code) return json(res, 400, { error: 'code requis' })
      const playerId = String(body.playerId ?? '')
      const room = await syncMorpion(code, playerId || undefined)
      if (!room) return json(res, 404, { error: 'Salle introuvable' })
      return json(res, 200, { room: publicMorpion(room) })
    }

    if (action === 'list') {
      const lists = await listMorpionRooms()
      return json(res, 200, lists)
    }

    return json(res, 400, { error: 'action inconnue' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur serveur'
    console.error('[morpion]', message)
    const status = isUserError(message)
      ? message.includes('introuvable')
        ? 404
        : 400
      : 500
    return json(res, status, { error: message })
  }
}
