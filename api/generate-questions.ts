import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  generateQuestions,
  normalizeThemeSlug,
  parseAiProvider,
  parseQuizContentMode,
  type Difficulty,
} from '../server/generate.js'
import {
  clearGenProgress,
  isValidProgressId,
  setGenProgress,
} from '../server/genProgress.js'
import {
  getGenerationEstimateSec,
  recordGenerationMs,
} from '../server/genStats.js'
import { logError } from '../server/errorLog.js'

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
 * Body: { theme, mode, difficulty?, scope?, provider?, quizMode?, excludeQuestions?, progressId? }
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
      progressId: rawProgressId,
    } = req.body ?? {}
    const scope = parseScope(rawScope)
    const provider = parseAiProvider(rawProvider)
    const quizMode = parseQuizContentMode(rawQuizMode)
    const excludeQuestions = Array.isArray(rawExclude)
      ? rawExclude.filter((x: unknown): x is string => typeof x === 'string')
      : []
    const progressId = isValidProgressId(rawProgressId)
      ? rawProgressId.trim()
      : null

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
        : quizMode === 'audio'
          ? `${baseSlug}--${scope}--audio`
          : `${baseSlug}--${scope}`

    const started = Date.now()
    if (progressId) await setGenProgress(progressId, 0, 10, undefined, 'Préparation')

    const result = await generateQuestions(
      theme.trim(),
      themeSlug,
      mode,
      difficulty as Difficulty | undefined,
      scope,
      provider,
      quizMode,
      excludeQuestions,
      progressId
        ? async (done, total, engine, stage) => {
            await setGenProgress(progressId, done, total, engine, stage)
          }
        : undefined,
      true,
    )
    const generationMs = Date.now() - started
    const qCount = Array.isArray(result.questions) ? result.questions.length : 0

    if (result.partial && qCount >= 1 && qCount <= 9) {
      if (progressId) {
        await setGenProgress(progressId, qCount, 10, result.source, 'Lot partiel')
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
        partial: true,
        received: result.received ?? qCount,
        target: result.target ?? 10,
      })
    }

    if (result.error && qCount === 0) {
      if (progressId) await clearGenProgress(progressId)
      const publicError = isGatewayTimeoutMessage(result.error)
        ? 'Le serveur a mis trop de temps à répondre, réessaie dans quelques secondes'
        : result.error
      logError({
        scope: 'generate',
        message: publicError,
        detail: result.error !== publicError ? result.error : undefined,
        status: isGatewayTimeoutMessage(result.error) ? 504 : 422,
        theme: typeof theme === 'string' ? theme.trim() : undefined,
        path: '/api/generate-questions',
      })
      if (isGatewayTimeoutMessage(result.error)) {
        return res.status(504).json({ error: publicError })
      }
      return res.status(422).json({ error: result.error })
    }

    if (qCount === 10) {
      if (progressId) await setGenProgress(progressId, 10, 10, result.source, 'Terminé')
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
    }

    if (progressId) await clearGenProgress(progressId)
    const msg =
      'JSON invalide : le lot ne contient pas exactement 10 questions. Réessaie.'
    logError({
      scope: 'generate',
      message: msg,
      status: 422,
      theme: typeof theme === 'string' ? theme.trim() : undefined,
      path: '/api/generate-questions',
    })
    return res.status(422).json({ error: msg })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur serveur'
    console.error('[generate-questions]', message)
    const publicError = isGatewayTimeoutMessage(message)
      ? 'Le serveur a mis trop de temps à répondre, réessaie dans quelques secondes'
      : message
    logError({
      scope: 'generate',
      message: publicError,
      detail: message !== publicError ? message : undefined,
      status: isGatewayTimeoutMessage(message) ? 504 : 500,
      path: '/api/generate-questions',
    })
    if (isGatewayTimeoutMessage(message)) {
      return res.status(504).json({ error: publicError })
    }
    return res.status(500).json({ error: message })
  }
}
