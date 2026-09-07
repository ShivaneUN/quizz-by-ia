import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminSecret } from '../server/adminAuth.js'
import { redisCommand, redisConfigured } from '../server/rooms.js'
import {
  createProfile,
  deleteProfile,
  getOrCreateAdminProfile,
  getProfile,
  getProfileByRecoveryCode,
  updatePseudo,
  updateScores,
  type ProfileGameMode,
} from '../server/profileStorage.js'

export const config = {
  maxDuration: 10,
}

const RECOVER_RATE_LIMIT = 5
const RECOVER_RATE_WINDOW_SECONDS = 60
const memoryRecoverHits = new Map<string, { count: number; resetAt: number }>()

const GAME_MODES: ProfileGameMode[] = ['quiz', 'pendu', 'morpion', 'flagQuiz']

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  return res.json(body)
}

function clientIp(req: VercelRequest): string {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
  const first = forwarded.split(',')[0]?.trim()
  if (first) return first.slice(0, 64)
  return String(req.headers['x-real-ip'] ?? 'unknown').slice(0, 64)
}

async function checkRecoverRateLimit(ip: string): Promise<boolean> {
  const key = `quizz:ratelimit:recover:${ip || 'unknown'}`
  if (redisConfigured()) {
    const count = Number((await redisCommand<number>('INCR', key)) ?? 0)
    if (count === 1) {
      await redisCommand('EXPIRE', key, RECOVER_RATE_WINDOW_SECONDS)
    }
    return count <= RECOVER_RATE_LIMIT
  }
  const now = Date.now()
  const cur = memoryRecoverHits.get(ip)
  if (!cur || now >= cur.resetAt) {
    memoryRecoverHits.set(ip, {
      count: 1,
      resetAt: now + RECOVER_RATE_WINDOW_SECONDS * 1000,
    })
    return true
  }
  cur.count += 1
  return cur.count <= RECOVER_RATE_LIMIT
}

function isGameMode(value: unknown): value is ProfileGameMode {
  return GAME_MODES.includes(value as ProfileGameMode)
}

/**
 * GET    /api/profile?id=…
 * POST   /api/profile                 { pseudo }
 * POST   /api/profile?action=recover  { recoveryCode }
 * PATCH  /api/profile?id=…            { pseudo }
 * PATCH  /api/profile?id=…&action=scores { mode, payload }
 * DELETE /api/profile?id=…
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PATCH, DELETE, OPTIONS',
    )
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }

  const { id, action } = req.query as { id?: string; action?: string }
  const body = (req.body ?? {}) as Record<string, unknown>

  try {
    if (req.method === 'POST' && action === 'recover') {
      const recoveryCode = String(body.recoveryCode ?? '').trim()
      if (!recoveryCode) {
        return json(res, 400, { error: 'Code de récupération requis' })
      }
      if (isAdminSecret(recoveryCode)) {
        const profile = await getOrCreateAdminProfile()
        return json(res, 200, profile)
      }
      const allowed = await checkRecoverRateLimit(clientIp(req))
      if (!allowed) {
        return json(res, 429, {
          error: 'Trop de tentatives, réessayez dans une minute.',
        })
      }
      const profile = await getProfileByRecoveryCode(recoveryCode)
      if (!profile) return json(res, 404, { error: 'Code invalide' })
      return json(res, 200, profile)
    }

    if (req.method === 'POST' && !id) {
      const profile = await createProfile(String(body.pseudo ?? ''))
      return json(res, 201, profile)
    }

    if (!id) return json(res, 400, { error: 'Paramètre id requis' })

    if (req.method === 'GET') {
      const profile = await getProfile(id)
      if (!profile) return json(res, 404, { error: 'Profil introuvable' })
      return json(res, 200, profile)
    }

    if (req.method === 'PATCH' && action === 'scores') {
      if (!isGameMode(body.mode)) {
        return json(res, 400, { error: 'Mode invalide' })
      }
      const profile = await updateScores(id, body.mode, body.payload as never)
      if (!profile) return json(res, 404, { error: 'Profil introuvable' })
      return json(res, 200, profile)
    }

    if (req.method === 'PATCH') {
      const profile = await updatePseudo(id, String(body.pseudo ?? ''))
      if (!profile) return json(res, 404, { error: 'Profil introuvable' })
      return json(res, 200, profile)
    }

    if (req.method === 'DELETE') {
      const success = await deleteProfile(id)
      if (!success) return json(res, 404, { error: 'Profil introuvable' })
      return json(res, 200, { success: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE, OPTIONS')
    return json(res, 405, { error: 'Méthode non supportée' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur'
    if (message === 'Pseudo requis' || message === 'Ce pseudo est déjà pris') {
      return json(res, message === 'Ce pseudo est déjà pris' ? 409 : 400, {
        error: message,
      })
    }
    console.error('[api/profile] erreur:', err)
    return json(res, 500, { error: 'Erreur serveur' })
  }
}
