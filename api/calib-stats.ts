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
import {
  clearErrorLog,
  listErrorLog,
  summarizeErrorLog,
} from '../server/errorLog.js'
import {
  clearCuratedBank,
  CURATED_BANK_INGEST_ENABLED,
  listCuratedQuestions,
  summarizeCuratedBank,
} from '../server/curatedBank.js'
import { listCuratedThemeSlots } from '../server/curatedFiles.js'
import { getRedisQuota } from '../server/redisQuota.js'
import { clearAllQuestionHistory } from '../server/questionHistory.js'
import { deleteProfile, listProfiles } from '../server/profileStorage.js'

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
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
        await clearErrorLog()
        await clearCuratedBank()
        return json(res, 200, { ok: true })
      }

      if (body.action === 'clearMultiHistory') {
        const cleared = await clearAllQuestionHistory()
        return json(res, 200, { ok: true, multiHistoriesCleared: cleared })
      }

      if (body.action === 'deleteProfile') {
        if (!isAdminSecret(body.secret)) {
          return json(res, 401, { error: 'secret invalide' })
        }
        const profileId = String(body.profileId ?? '').trim()
        if (!profileId) return json(res, 400, { error: 'profileId requis' })
        const success = await deleteProfile(profileId)
        if (!success) return json(res, 404, { error: 'Profil introuvable' })
        return json(res, 200, { success: true })
      }

      const ok = await recordCalibHand(body as Partial<CalibHandEvent>)
      if (!ok) return json(res, 400, { error: 'événement invalide' })
      return json(res, 200, { ok: true })
    }

    if (req.method === 'GET') {
      if (!authorized(req)) {
        return json(res, 401, { error: 'secret invalide' })
      }
      const adminAction = String(req.query.action ?? '')
      if (adminAction === 'profiles') {
        const offset = parseInt(String(req.query.offset ?? '0'), 10)
        const profileLimit = parseInt(String(req.query.limit ?? '50'), 10)
        const { total, profiles } = await listProfiles(
          Number.isFinite(offset) ? offset : 0,
          Number.isFinite(profileLimit) ? profileLimit : 50,
        )
        return json(res, 200, { total, profiles })
      }
      const limit = Number(req.query.limit ?? 2000)
      const events = await listCalibHands(limit)
      const summary = summarizeCalibHands(events)
      const feedbackEvents = await listQuestionFeedback(limit)
      const errorEvents = await listErrorLog(Math.min(limit, 1000))
      const errorSummary = summarizeErrorLog(errorEvents)
      const curatedEvents = await listCuratedQuestions(Math.min(limit, 5000))
      const curatedSummary = summarizeCuratedBank(curatedEvents)
      const themeSlots = listCuratedThemeSlots()
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
          'at,kind,theme,difficulty,mode,question,correctAnswer,sourceType,verdict,answerVerdict,sourceVerdict,sourcesConfirmed,confirmingSources,verifyProvider,verifyTitle,verifyNote',
          ...feedbackEvents.map((e) =>
            [
              e.at,
              e.kind,
              JSON.stringify(e.theme ?? ''),
              e.difficulty ?? '',
              e.mode ?? '',
              JSON.stringify(e.question),
              JSON.stringify(e.correctAnswer),
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
          '',
          '# errors',
          'at,scope,status,theme,message,detail,path',
          ...errorEvents.map((e) =>
            [
              e.at,
              e.scope,
              e.status ?? '',
              JSON.stringify(e.theme ?? ''),
              JSON.stringify(e.message),
              JSON.stringify(e.detail ?? ''),
              JSON.stringify(e.path ?? ''),
            ].join(','),
          ),
          '',
          '# curated_bank',
          'at,placementKind,themeId,theme,subTheme,groupKey,difficulty,question,correctAnswer,liked,verifiedOk,sourcesConfirmed',
          ...curatedEvents.map((e) =>
            [
              e.at,
              e.placementKind,
              e.themeId ?? '',
              JSON.stringify(e.theme),
              JSON.stringify(e.subTheme ?? ''),
              JSON.stringify(e.groupKey),
              e.difficulty,
              JSON.stringify(e.question),
              JSON.stringify(e.correctAnswer),
              e.liked ? 1 : 0,
              e.verifiedOk ? 1 : 0,
              e.sourcesConfirmed ?? '',
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
      if (format === 'errors-csv') {
        const lines = [
          'at,scope,status,theme,message,instead,detail,path',
          ...errorEvents.map((e) =>
            [
              e.at,
              e.scope,
              e.status ?? '',
              JSON.stringify(e.theme ?? ''),
              JSON.stringify(e.message),
              JSON.stringify(e.instead ?? ''),
              JSON.stringify(e.detail ?? ''),
              JSON.stringify(e.path ?? ''),
            ].join(','),
          ),
        ]
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="quizz-errors.csv"',
        )
        return res.send(lines.join('\n'))
      }
      if (format === 'errors-json') {
        const payload = {
          exportedAt: new Date().toISOString(),
          count: errorEvents.length,
          summary: errorSummary,
          events: errorEvents,
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="quizz-errors.json"',
        )
        return res.send(JSON.stringify(payload, null, 2))
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
          errors: {
            count: errorEvents.length,
            summary: errorSummary,
            events: errorEvents,
          },
          curated: {
            ingestEnabled: CURATED_BANK_INGEST_ENABLED,
            questionsIngestEnabled: false,
            count: curatedEvents.length,
            summary: curatedSummary,
            themeSlots,
            events: curatedEvents,
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
      const storage = await getRedisQuota()
      return json(res, 200, {
        count: events.length,
        storage,
        summary,
        events,
        feedback: {
          count: feedbackEvents.length,
          summary: summarizeFeedback(feedbackEvents),
          events: feedbackEvents,
        },
        errors: {
          count: errorEvents.length,
          summary: errorSummary,
          events: errorEvents,
        },
        curated: {
          ingestEnabled: CURATED_BANK_INGEST_ENABLED,
          questionsIngestEnabled: false,
          count: curatedEvents.length,
          summary: curatedSummary,
          themeSlots,
          events: curatedEvents,
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
