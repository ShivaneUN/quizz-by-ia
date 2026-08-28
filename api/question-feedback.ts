import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  listQuestionFeedback,
  recordQuestionFeedback,
  summarizeFeedback,
  type QuestionFeedbackEvent,
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
  const expected = process.env.CALIB_STATS_SECRET?.trim()
  if (!expected) return false
  const q = typeof req.query.secret === 'string' ? req.query.secret : ''
  const h = String(req.headers['x-calib-secret'] ?? '')
  return q === expected || h === expected
}

/**
 * POST /api/question-feedback — 👍 / 👎 / à vérifier (tous joueurs)
 * GET  /api/question-feedback?secret=… — export (toi)
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
      const body = (req.body ?? {}) as Partial<QuestionFeedbackEvent>
      const ok = await recordQuestionFeedback(body)
      if (!ok) return json(res, 400, { error: 'feedback invalide' })
      return json(res, 200, { ok: true })
    }

    if (req.method === 'GET') {
      if (!process.env.CALIB_STATS_SECRET?.trim()) {
        return json(res, 503, {
          error: 'CALIB_STATS_SECRET manquant sur le serveur',
        })
      }
      if (!authorized(req)) {
        return json(res, 401, { error: 'secret invalide' })
      }
      const limit = Number(req.query.limit ?? 2000)
      const kind = String(req.query.kind ?? 'all')
      let events = await listQuestionFeedback(limit)
      if (kind === 'up' || kind === 'down' || kind === 'verify' || kind === 'review' || kind === 'report') {
        events = events.filter((e) => e.kind === kind)
      }
      const format = String(req.query.format ?? 'json')
      if (format === 'csv') {
        const lines = [
          'at,kind,reportTarget,theme,difficulty,mode,questionId,question,answer0,answer1,answer2,answer3,correctIndex,correctAnswer,playerCorrect,selectedIndex,explanation,sourceType,verdict,answerVerdict,sourceVerdict,sourcesConfirmed,confirmingSources,verifyProvider,verifyTitle,verifyNote',
          ...events.map((e) =>
            [
              e.at,
              e.kind,
              e.reportTarget ?? '',
              JSON.stringify(e.theme ?? ''),
              e.difficulty ?? '',
              e.mode ?? '',
              JSON.stringify(e.questionId),
              JSON.stringify(e.question),
              JSON.stringify(e.answers[0]),
              JSON.stringify(e.answers[1]),
              JSON.stringify(e.answers[2]),
              JSON.stringify(e.answers[3]),
              e.correctIndex,
              JSON.stringify(e.correctAnswer),
              e.playerCorrect ?? '',
              e.selectedIndex ?? '',
              JSON.stringify(e.explanation ?? ''),
              JSON.stringify(e.sourceType ?? ''),
              e.verdict ?? '',
              e.answerVerdict ?? '',
              e.sourceVerdict ?? '',
              e.sourcesConfirmed ?? '',
              JSON.stringify(e.confirmingSources ?? ''),
              JSON.stringify(e.verifyProvider ?? ''),
              JSON.stringify(e.verifyTitle ?? ''),
              JSON.stringify(e.verifyNote ?? ''),
            ].join(','),
          ),
        ]
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="question-feedback.csv"',
        )
        return res.send(lines.join('\n'))
      }
      return json(res, 200, {
        count: events.length,
        summary: summarizeFeedback(events),
        events,
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
