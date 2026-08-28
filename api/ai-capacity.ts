import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminSecret } from '../server/adminAuth.js'
import { getAiCapacitySnapshot } from '../server/aiRotate.js'
import {
  clearAiGenDayStats,
  clearAiGenMonthStats,
  clearAiGenStats,
  getAiGenStats,
} from '../server/aiGenStats.js'
import { listAiGenHistory } from '../server/aiGenHistory.js'

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  return res.json(body)
}

function authorized(req: VercelRequest, bodySecret?: unknown): boolean {
  const q = typeof req.query.secret === 'string' ? req.query.secret : ''
  const h = String(req.headers['x-calib-secret'] ?? '')
  if (isAdminSecret(q) || isAdminSecret(h)) return true
  return isAdminSecret(bodySecret)
}

function historyToCsv(history: Awaited<ReturnType<typeof listAiGenHistory>>): string {
  const lines = [
    'kind,key,updatedAt,ok,fail,tokensIn,tokensOut,tokensTotal,principalCalls,principalTokens,topupCalls,topupTokens',
  ]
  for (const e of [...history.days, ...history.months]) {
    lines.push(
      [
        e.kind,
        e.key,
        e.updatedAt,
        e.ok,
        e.fail,
        e.tokensIn,
        e.tokensOut,
        e.tokensTotal,
        e.principalCalls,
        e.principalTokens,
        e.topupCalls,
        e.topupTokens,
      ].join(','),
    )
  }
  return lines.join('\n')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>
    if (!authorized(req, body.secret)) {
      return json(res, 401, { error: 'secret invalide' })
    }
    if (body.action === 'resetGenStats') {
      await clearAiGenStats()
      return json(res, 200, { ok: true })
    }
    if (body.action === 'resetGenDayStats') {
      const { day } = await clearAiGenDayStats()
      return json(res, 200, { ok: true, day })
    }
    if (body.action === 'resetGenMonthStats') {
      const { month } = await clearAiGenMonthStats()
      return json(res, 200, { ok: true, month })
    }
    return json(res, 400, { error: 'action inconnue' })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST')
    return json(res, 405, { error: 'Method not allowed' })
  }

  if (!authorized(req)) {
    return json(res, 401, { error: 'secret invalide' })
  }

  try {
    const format = String(req.query.format ?? 'json')
    if (format === 'history-csv' || format === 'history-json') {
      const history = await listAiGenHistory()
      if (format === 'history-csv') {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="quizz-ai-history.csv"',
        )
        return res.send(historyToCsv(history))
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="quizz-ai-history.json"',
      )
      return res.send(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            days: history.days,
            months: history.months,
          },
          null,
          2,
        ),
      )
    }

    const [rows, gen, history] = await Promise.all([
      getAiCapacitySnapshot(),
      getAiGenStats(),
      listAiGenHistory(),
    ])
    return json(res, 200, {
      rows,
      gen,
      history,
      note: 'Reset jour / mois / tout. Télécharger logs = journal auto.',
    })
  } catch (e) {
    return json(res, 500, {
      error: e instanceof Error ? e.message : 'Erreur serveur',
    })
  }
}
