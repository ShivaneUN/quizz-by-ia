import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminSecret } from '../server/adminAuth.js'
import {
  clearCalibHands,
  listCalibHands,
  recordCalibHand,
  summarizeCalibHands,
  type CalibHandEvent,
} from '../server/calibStats.js'
import {
  clearQuestionFeedback,
  listQuestionFeedback,
  summarizeFeedback,
} from '../server/questionFeedback.js'

export const config = {
  maxDuration: 30,
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
 * POST /api/calib-stats — enregistre une manche OU admin reset
 * GET  /api/calib-stats?secret=… — export + résumé
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
    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>

      if (body.action === 'resetLogs') {
        if (!isAdminSecret(body.secret)) {
          return json(res, 401, { error: 'secret invalide' })
        }
        await clearCalibHands()
        await clearQuestionFeedback()
        return json(res, 200, { ok: true })
      }

      const ok = await recordCalibHand(body as Partial<CalibHandEvent>)
      if (!ok) return json(res, 400, { error: 'événement invalide' })
      return json(res, 200, { ok: true })
    }

    if (req.method === 'GET') {
      if (!authorized(req)) {
        return json(res, 401, { error: 'secret invalide' })
      }
      const limit = Number(req.query.limit ?? 2000)
      const events = await listCalibHands(limit)
      const summary = summarizeCalibHands(events)
      const feedbackEvents = await listQuestionFeedback(limit)
      const format = String(req.query.format ?? 'json')
      if (format === 'csv') {
        const summaryLines = [
          '# summary_by_difficulty',
          'difficulty,hands,correct,answered,successRatePct',
          ...summary.map((s) =>
            [
              s.difficulty,
              s.hands,
              s.correct,
              s.answered,
              s.successRatePct ?? '',
            ].join(','),
          ),
          '',
          '# hands',
          'at,mode,theme,scope,difficulty,correct,answered,successRatePct,playMode,roomCode',
          ...events.map((e) => {
            const pct =
              e.answered > 0
                ? Math.round((1000 * e.correct) / e.answered) / 10
                : ''
            return [
              e.at,
              e.mode,
              JSON.stringify(e.theme),
              e.scope,
              e.difficulty,
              e.correct,
              e.answered,
              pct,
              e.playMode ?? '',
              e.roomCode ?? '',
            ].join(',')
          }),
          '',
          '# feedback',
          'at,kind,theme,difficulty,mode,question,correctAnswer',
          ...feedbackEvents.map((e) =>
            [
              e.at,
              e.kind,
              JSON.stringify(e.theme ?? ''),
              e.difficulty ?? '',
              e.mode ?? '',
              JSON.stringify(e.question),
              JSON.stringify(e.correctAnswer),
            ].join(','),
          ),
        ]
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="quizz-logs.csv"',
        )
        return res.send(summaryLines.join('\n'))
      }
      if (format === 'download') {
        const payload = {
          exportedAt: new Date().toISOString(),
          count: events.length,
          summary,
          events,
          feedback: {
            count: feedbackEvents.length,
            summary: summarizeFeedback(feedbackEvents),
            events: feedbackEvents,
          },
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="quizz-logs.json"',
        )
        return res.send(JSON.stringify(payload, null, 2))
      }
      return json(res, 200, {
        count: events.length,
        summary,
        events,
        feedback: {
          count: feedbackEvents.length,
          summary: summarizeFeedback(feedbackEvents),
          events: feedbackEvents,
        },
      })
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS')
    return json(res, 405, { error: 'Method not allowed' })
  } catch (e) {
    return json(res, 500, {
      error: e instanceof Error ? e.message : 'Erreur serveur',
    })
  }
}
