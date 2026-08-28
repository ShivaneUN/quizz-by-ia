import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyFactWithOpenRouter } from '../server/factCheckAi.js'
import { logError } from '../server/errorLog.js'

export const config = {
  maxDuration: 60,
}

/**
 * POST /api/fact-check
 * Body: { question, correctAnswer, explanation?, sourceType?, theme? }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = (req.body ?? {}) as {
      question?: unknown
      correctAnswer?: unknown
      explanation?: unknown
      sourceType?: unknown
      theme?: unknown
      answers?: unknown
    }

    const question = typeof body.question === 'string' ? body.question.trim() : ''
    const correctAnswer =
      typeof body.correctAnswer === 'string' ? body.correctAnswer.trim() : ''
    const theme = typeof body.theme === 'string' ? body.theme.trim() : undefined

    if (!question || !correctAnswer) {
      return res.status(400).json({ error: 'question et correctAnswer requis' })
    }

    const answers = Array.isArray(body.answers)
      ? body.answers.filter((a): a is string => typeof a === 'string')
      : undefined

    const result = await verifyFactWithOpenRouter({
      question,
      correctAnswer,
      explanation:
        typeof body.explanation === 'string' ? body.explanation : undefined,
      sourceType:
        typeof body.sourceType === 'string' ? body.sourceType : undefined,
      theme,
      answers,
    })

    if ('error' in result) {
      logError({
        scope: 'fact-check',
        message: result.error,
        status: 422,
        theme,
        detail: question.slice(0, 200),
        path: '/api/fact-check',
        instead: 'Vérif source échouée — résultat affiché au joueur',
      })
      return res.status(422).json({ error: result.error })
    }

    return res.status(200).json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur serveur'
    logError({
      scope: 'fact-check',
      message,
      status: 500,
      path: '/api/fact-check',
      instead: 'Erreur vérif — message au joueur',
    })
    return res.status(500).json({ error: message })
  }
}
