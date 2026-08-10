import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  generateQuestions,
  normalizeThemeSlug,
  parseAiProvider,
  parseQuizContentMode,
  type Difficulty,
} from '../server/generate.js'

export const config = {
  maxDuration: 60,
}

function parseScope(raw: unknown): 'fr' | 'international' {
  return raw === 'international' ? 'international' : 'fr'
}

/**
 * POST /api/generate-questions
 * Body: { theme, mode, difficulty?, scope?, provider?, quizMode?: 'standard'|'image' }
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
    } = req.body ?? {}
    const scope = parseScope(rawScope)
    const provider = parseAiProvider(rawProvider)
    const quizMode = parseQuizContentMode(rawQuizMode)

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

    const result = await generateQuestions(
      theme.trim(),
      themeSlug,
      mode,
      difficulty as Difficulty | undefined,
      scope,
      provider,
      quizMode,
    )

    if (result.error) {
      return res.status(422).json({ error: result.error })
    }

    return res.status(200).json({
      theme: theme.trim(),
      themeSlug,
      questions: result.questions,
      source: result.source,
      message: result.message,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur serveur'
    console.error('[generate-questions]', message)
    return res.status(500).json({ error: message })
  }
}
