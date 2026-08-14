import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  generateQuestions,
  normalizeThemeSlug,
  parseAiProvider,
  parseQuizContentMode,
  type Difficulty,
} from '../server/generate.js'
import {
  getGenerationEstimateSec,
  recordGenerationMs,
} from '../server/genStats.js'

export const config = {
  maxDuration: 60,
}

function parseScope(raw: unknown): 'fr' | 'international' {
  return raw === 'international' ? 'international' : 'fr'
}

function isGatewayTimeoutMessage(msg: string): boolean {
  return /504|503|524|502|délai dépassé|timeout|timed out|gateway|trop de temps/i.test(
    msg,
  )
}

/**
 * POST /api/generate-questions
 * Body: { theme, mode, difficulty?, scope?, provider?, quizMode?, excludeQuestions? }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      theme,
      mode,
      difficulty,
      scope: rawScope,
      provider: rawProvider,
      quizMode: rawQuizMode,
      excludeQuestions: rawExclude,
    } = req.body ?? {}
    const scope = parseScope(rawScope)
    const provider = parseAiProvider(rawProvider)
    const quizMode = parseQuizContentMode(rawQuizMode)
    const excludeQuestions = Array.isArray(rawExclude)
      ? rawExclude.filter((x: unknown): x is string => typeof x === 'string')
      : []

    if (!theme || typeof theme !== 'string' || !theme.trim()) {
      return res.status(400).json({ error: 'theme requis' })
    }
    if (mode !== 'initial' && mode !== 'complementary') {
      return res
        .status(400)
        .json({ error: "mode doit être 'initial' ou 'complementary'" })
    }
    if (mode === 'complementary') {
      const ok =
        difficulty === 'easy' ||
        difficulty === 'medium' ||
        difficulty === 'hard'
      if (!ok) {
        return res
          .status(400)
          .json({ error: 'difficulty requis en mode complementary' })
      }
    }

    const baseSlug = normalizeThemeSlug(theme)
    if (!baseSlug) {
      return res.status(400).json({ error: 'thème invalide après normalisation' })
    }
    const themeSlug =
      quizMode === 'image'
        ? `${baseSlug}--${scope}--image`
        : `${baseSlug}--${scope}`

    const started = Date.now()
    const result = await generateQuestions(
      theme.trim(),
      themeSlug,
      mode,
      difficulty as Difficulty | undefined,
      scope,
      provider,
      quizMode,
      excludeQuestions,
    )
    const generationMs = Date.now() - started

    if (result.error) {
      if (isGatewayTimeoutMessage(result.error)) {
        return res.status(504).json({
          error:
            'Le serveur a mis trop de temps à répondre, réessaie dans quelques secondes',
        })
      }
      // Thème invalide / lot invalide → 422
      return res.status(422).json({ error: result.error })
    }

    if (!Array.isArray(result.questions) || result.questions.length !== 10) {
      return res.status(422).json({
        error:
          'JSON invalide : le lot ne contient pas exactement 10 questions. Réessaie.',
      })
    }

    await recordGenerationMs(generationMs)
    const { estimateSec } = await getGenerationEstimateSec('solo')

    return res.status(200).json({
      theme: theme.trim(),
      themeSlug,
      questions: result.questions,
      source: result.source,
      message: result.message,
      generationMs,
      estimateSec,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur serveur'
    console.error('[generate-questions]', message)
    if (isGatewayTimeoutMessage(message)) {
      return res.status(504).json({
        error:
          'Le serveur a mis trop de temps à répondre, réessaie dans quelques secondes',
      })
    }
    return res.status(500).json({ error: message })
  }
}
