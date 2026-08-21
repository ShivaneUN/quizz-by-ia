import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminSecret } from '../server/adminAuth.js'
import {
  CURATED_BANK_INGEST_ENABLED,
  listCuratedQuestions,
  qualifiesForCuratedBank,
  recordCuratedQuestion,
  summarizeCuratedBank,
  type CuratedQuestion,
} from '../server/curatedBank.js'

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
 * POST /api/curated-bank — candidat (no-op si ingest off)
 * GET  /api/curated-bank?secret=… — lecture admin / export
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
      if (!CURATED_BANK_INGEST_ENABLED) {
        return json(res, 200, {
          ok: false,
          skipped: 'ingest_disabled',
          message:
            'Banque curatée prête mais non activée (attendre plus de thèmes).',
        })
      }

      const body = (req.body ?? {}) as Partial<CuratedQuestion> & {
        liked?: boolean
        verifiedOk?: boolean
        answerVerdict?: string
        sourceVerdict?: string
        sourcesConfirmed?: number
      }

      if (
        !qualifiesForCuratedBank({
          liked: body.liked,
          verifiedOk: body.verifiedOk,
          sourcesConfirmed: body.sourcesConfirmed,
          answerVerdict: body.answerVerdict,
          sourceVerdict: body.sourceVerdict,
        })
      ) {
        return json(res, 200, { ok: false, skipped: 'not_qualified' })
      }

      const result = await recordCuratedQuestion({
        ...body,
        liked: true,
        verifiedOk: true,
      })
      return json(res, 200, result)
    }

    if (req.method === 'GET') {
      if (!authorized(req)) {
        return json(res, 401, { error: 'secret invalide' })
      }
      const limit = Number(req.query.limit ?? 5000)
      const events = await listCuratedQuestions(limit)
      const summary = summarizeCuratedBank(events)
      const format = String(req.query.format ?? 'json')

      if (format === 'csv') {
        const lines = [
          'at,placementKind,themeId,theme,subTheme,customKey,groupKey,difficulty,scope,question,correctAnswer,sourceType,liked,verifiedOk,sourcesConfirmed,confirmingSources,verdict,playMode,mode,explanation',
          ...events.map((e) =>
            [
              e.at,
              e.placementKind,
              e.themeId ?? '',
              JSON.stringify(e.theme),
              JSON.stringify(e.subTheme ?? ''),
              JSON.stringify(e.customKey ?? ''),
              JSON.stringify(e.groupKey),
              e.difficulty,
              e.scope ?? '',
              JSON.stringify(e.question),
              JSON.stringify(e.correctAnswer),
              JSON.stringify(e.sourceType ?? ''),
              e.liked ? 1 : 0,
              e.verifiedOk ? 1 : 0,
              e.sourcesConfirmed ?? '',
              JSON.stringify(e.confirmingSources ?? ''),
              e.verdict ?? '',
              e.playMode ?? '',
              e.mode ?? '',
              JSON.stringify(e.explanation ?? ''),
            ].join(','),
          ),
        ]
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="quizz-curated-bank.csv"',
        )
        return res.send(lines.join('\n'))
      }

      return json(res, 200, {
        ingestEnabled: CURATED_BANK_INGEST_ENABLED,
        count: events.length,
        summary,
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
