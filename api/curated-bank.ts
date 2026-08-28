import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAdminSecret } from '../server/adminAuth.js'
import {
  CURATED_BANK_INGEST_ENABLED,
  deleteCuratedQuestion,
  listCuratedQuestions,
  qualifiesForCuratedBank,
  recordCuratedQuestion,
  summarizeCuratedBank,
  type CuratedQuestion,
} from '../server/curatedBank.js'
import { ensureCuratedThemeSlot, groupBankCustomSubs, listCuratedThemeSlots } from '../server/curatedFiles.js'
import { placeTheme } from '../server/themePlacement.js'

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
 * POST /api/curated-bank — candidat (no-op si ingest off) | action delete (admin)
 * GET  /api/curated-bank?secret=… — lecture admin
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
      const body = (req.body ?? {}) as Partial<CuratedQuestion> & {
        liked?: boolean
        verifiedOk?: boolean
        answerVerdict?: string
        sourceVerdict?: string
        sourcesConfirmed?: number
        action?: string
        secret?: string
      }

      if (body.action === 'ensure-theme') {
        const raw = String(body.rawTheme || body.theme || '').trim()
        if (!raw) return json(res, 400, { error: 'thème manquant' })
        const placement = placeTheme(raw, {
          themeId: body.themeId,
          subTheme: body.subTheme,
        })
        const slot = ensureCuratedThemeSlot({
          placementKind: placement.kind,
          themeId: placement.themeId,
          theme: placement.themeLabel,
          subTheme: placement.subTheme,
          customKey: placement.customKey,
          rawTheme: placement.rawTheme,
          subIsCustom: placement.subIsCustom,
        })
        return json(res, 200, {
          ok: slot.ok,
          created: slot.created,
          skipped: slot.skipped,
          placement: {
            kind: placement.kind,
            themeId: placement.themeId,
            themeLabel: placement.themeLabel,
            subTheme: placement.subTheme,
            subIsCustom: placement.subIsCustom,
            customKey: placement.customKey,
          },
        })
      }

      if (body.action === 'list-custom-subs') {
        const grouped = groupBankCustomSubs()
        return json(res, 200, { ok: true, ...grouped, subs: grouped.orphans })
      }

      if (body.action === 'delete') {
        if (!authorized(req) && !isAdminSecret(body.secret)) {
          return json(res, 401, { error: 'secret invalide' })
        }
        const result = await deleteCuratedQuestion({
          id: body.id,
          question: String(body.question ?? ''),
          correctAnswer: String(body.correctAnswer ?? ''),
          difficulty: String(body.difficulty ?? ''),
          placementKind: body.placementKind,
          themeId: body.themeId,
          subTheme: body.subTheme,
          customKey: body.customKey,
          theme: body.theme,
          rawTheme: body.rawTheme,
        })
        return json(res, 200, result)
      }

      if (!CURATED_BANK_INGEST_ENABLED) {
        return json(res, 200, {
          ok: false,
          skipped: 'ingest_disabled',
          message:
            'Banque curatée prête mais non activée (attendre plus de thèmes).',
        })
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
      // Liste publique des sous-thèmes générés (par thème + orphelins Custom)
      if (String(req.query.slots ?? '') === '1') {
        const grouped = groupBankCustomSubs()
        return json(res, 200, { ok: true, ...grouped, subs: grouped.orphans })
      }

      if (!authorized(req)) {
        return json(res, 401, { error: 'secret invalide' })
      }
      const limit = Number(req.query.limit ?? 5000)
      const events = await listCuratedQuestions(limit)
      const summary = summarizeCuratedBank(events)
      const themeSlots = listCuratedThemeSlots()

      return json(res, 200, {
        ingestEnabled: CURATED_BANK_INGEST_ENABLED,
        questionsIngestEnabled: false,
        count: events.length,
        summary,
        themeSlots,
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
