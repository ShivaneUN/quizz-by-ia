import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite'
import react from '@vitejs/plugin-react'
import {
  generateQuestionsWithPartialCache,
  normalizeThemeSlug,
  parseAiProvider,
  parseQuizContentMode,
  type Difficulty,
} from './server/generate.ts'
import { isFlagTheme } from './server/flagQuiz.ts'
import {
  getGenerationEstimateSec,
  recordGenerationMs,
} from './server/genStats.ts'
import roomHandler from './api/room.ts'
import morpionHandler from './api/morpion.ts'
import genStatusHandler from './api/gen-status.ts'
import calibStatsHandler from './api/calib-stats.ts'
import questionFeedbackHandler from './api/question-feedback.ts'
import factCheckHandler from './api/fact-check.ts'
import curatedBankHandler from './api/curated-bank.ts'
import chatHandler from './api/chat.ts'
import aiCapacityHandler from './api/ai-capacity.ts'
import penduWordsHandler from './api/pendu-words.ts'
import {
  isValidProgressId,
  setGenProgress,
} from './server/genProgress.ts'
import { synthesizeQuizSpeech } from './server/tts.ts'

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function localApiPlugin(): Plugin {
  return {
    name: 'local-quizz-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-questions', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        void (async () => {
          try {
            const body = JSON.parse((await readBody(req)) || '{}')
            const {
              theme,
              mode,
              difficulty,
              scope: rawScope,
              provider: rawProvider,
              quizMode: rawQuizMode,
              excludeQuestions: rawExclude,
              progressId: rawProgressId,
              flagCount: rawFlagCount,
              flagDifficulty: rawFlagDifficulty,
            } = body
            const scope = rawScope === 'international' ? 'international' : 'fr'
            const provider = parseAiProvider(rawProvider)
            const quizMode = parseQuizContentMode(rawQuizMode)
            const excludeQuestions = Array.isArray(rawExclude)
              ? rawExclude.filter((x: unknown): x is string => typeof x === 'string')
              : []

            if (!theme || typeof theme !== 'string' || !theme.trim()) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'theme requis' }))
              return
            }
            if (mode !== 'initial' && mode !== 'complementary') {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  error: "mode doit être 'initial' ou 'complementary'",
                }),
              )
              return
            }
            if (mode === 'complementary' && !isFlagTheme(theme)) {
              const ok =
                difficulty === 'easy' ||
                difficulty === 'medium' ||
                difficulty === 'hard'
              if (!ok) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(
                  JSON.stringify({
                    error: 'difficulty requis en mode complementary',
                  }),
                )
                return
              }
            }

            const baseSlug = normalizeThemeSlug(theme)
            const themeSlug =
              quizMode === 'image'
                ? `${baseSlug}--${scope}--image`
                : quizMode === 'audio'
                  ? `${baseSlug}--${scope}--audio`
                  : `${baseSlug}--${scope}`
            const started = Date.now()
            const progressId = isValidProgressId(rawProgressId)
              ? String(rawProgressId).trim()
              : null
            if (progressId) await setGenProgress(progressId, 0, 10, undefined, 'Préparation')
            const result = await generateQuestionsWithPartialCache(
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
              undefined,
              typeof rawFlagCount === 'number' ? rawFlagCount : Number(rawFlagCount) || undefined,
              typeof rawFlagDifficulty === 'string' ? rawFlagDifficulty : undefined,
            )
            const generationMs = Date.now() - started
            const qCount = Array.isArray(result.questions)
              ? result.questions.length
              : 0

            if (result.partial && qCount >= 1 && qCount <= 9) {
              await recordGenerationMs(generationMs)
              const { estimateSec } = await getGenerationEstimateSec('solo')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
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
                }),
              )
              return
            }

            if (result.error && qCount === 0) {
              res.statusCode = 422
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: result.error }))
              return
            }

            if (qCount === 10) {
              await recordGenerationMs(generationMs)
              const { estimateSec } = await getGenerationEstimateSec('solo')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  theme: theme.trim(),
                  themeSlug,
                  questions: result.questions,
                  source: result.source,
                  message: result.message,
                  generationMs,
                  estimateSec,
                }),
              )
              return
            }

            res.statusCode = 422
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error:
                  'JSON invalide : le lot ne contient pas exactement 10 questions. Réessaie.',
              }),
            )
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            console.error('[local api]', message)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/gen-status', (req, res) => {
        void (async () => {
          try {
            const url = new URL(req.url || '/', 'http://local')
            const fakeReq = {
              method: req.method,
              body: {},
              query: Object.fromEntries(url.searchParams.entries()),
            }
            const fakeRes = {
              statusCode: 200,
              headers: {} as Record<string, string>,
              setHeader(k: string, v: string) {
                this.headers[k] = v
              },
              status(code: number) {
                this.statusCode = code
                return this
              },
              json(payload: unknown) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json')
                }
                res.end(JSON.stringify(payload))
                return this
              },
              end() {
                res.statusCode = this.statusCode
                res.end()
                return this
              },
            }
            await genStatusHandler(fakeReq as never, fakeRes as never)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/calib-stats', (req, res) => {
        void (async () => {
          try {
            const url = new URL(req.url || '/', 'http://local')
            const raw =
              req.method === 'GET' || req.method === 'HEAD'
                ? '{}'
                : await readBody(req)
            const body = JSON.parse(raw || '{}')
            const fakeReq = {
              method: req.method,
              body,
              query: Object.fromEntries(url.searchParams.entries()),
              headers: req.headers,
            }
            const fakeRes = {
              statusCode: 200,
              headers: {} as Record<string, string>,
              setHeader(k: string, v: string) {
                this.headers[k] = v
              },
              status(code: number) {
                this.statusCode = code
                return this
              },
              json(payload: unknown) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json')
                }
                res.end(JSON.stringify(payload))
                return this
              },
              send(payload: string) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                res.end(payload)
                return this
              },
              end() {
                res.statusCode = this.statusCode
                res.end()
                return this
              },
            }
            await calibStatsHandler(fakeReq as never, fakeRes as never)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/question-feedback', (req, res) => {
        void (async () => {
          try {
            const url = new URL(req.url || '/', 'http://local')
            const raw =
              req.method === 'GET' || req.method === 'HEAD'
                ? '{}'
                : await readBody(req)
            const body = JSON.parse(raw || '{}')
            const fakeReq = {
              method: req.method,
              body,
              query: Object.fromEntries(url.searchParams.entries()),
              headers: req.headers,
            }
            const fakeRes = {
              statusCode: 200,
              headers: {} as Record<string, string>,
              setHeader(k: string, v: string) {
                this.headers[k] = v
              },
              status(code: number) {
                this.statusCode = code
                return this
              },
              json(payload: unknown) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json')
                }
                res.end(JSON.stringify(payload))
                return this
              },
              send(payload: string) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                res.end(payload)
                return this
              },
              end() {
                res.statusCode = this.statusCode
                res.end()
                return this
              },
            }
            await questionFeedbackHandler(fakeReq as never, fakeRes as never)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/fact-check', (req, res) => {
        void (async () => {
          try {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }
            const body = JSON.parse((await readBody(req)) || '{}')
            const fakeReq = {
              method: 'POST',
              body,
              query: {},
              headers: req.headers,
            }
            const fakeRes = {
              statusCode: 200,
              headers: {} as Record<string, string>,
              setHeader(k: string, v: string) {
                this.headers[k] = v
              },
              status(code: number) {
                this.statusCode = code
                return this
              },
              json(payload: unknown) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json')
                }
                res.end(JSON.stringify(payload))
                return this
              },
            }
            await factCheckHandler(fakeReq as never, fakeRes as never)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/curated-bank', (req, res) => {
        void (async () => {
          try {
            const raw =
              req.method === 'GET' || req.method === 'HEAD'
                ? '{}'
                : await readBody(req)
            const body = JSON.parse(raw || '{}')
            const url = new URL(req.url || '/', 'http://localhost')
            const fakeReq = {
              method: req.method,
              body,
              query: Object.fromEntries(url.searchParams.entries()),
              headers: req.headers,
            }
            const fakeRes = {
              statusCode: 200,
              headers: {} as Record<string, string>,
              setHeader(k: string, v: string) {
                this.headers[k] = v
              },
              status(code: number) {
                this.statusCode = code
                return this
              },
              json(payload: unknown) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json')
                }
                res.end(JSON.stringify(payload))
                return this
              },
              send(payload: string) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                res.end(payload)
                return this
              },
            }
            await curatedBankHandler(fakeReq as never, fakeRes as never)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/tts', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Allow', 'POST')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        void (async () => {
          try {
            const body = JSON.parse((await readBody(req)) || '{}') as Record<
              string,
              unknown
            >
            const result = await synthesizeQuizSpeech(body)
            if (!result.ok) {
              res.statusCode = result.status
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Cache-Control', 'no-store')
              res.end(JSON.stringify({ error: result.error }))
              return
            }
            res.statusCode = 200
            res.setHeader('Content-Type', result.contentType)
            res.setHeader('Cache-Control', 'no-store')
            res.end(result.audio)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            console.error('[local tts]', message)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/chat', (req, res) => {
        void (async () => {
          try {
            const raw =
              req.method === 'GET' || req.method === 'HEAD'
                ? '{}'
                : await readBody(req)
            const body = JSON.parse(raw || '{}')
            const fakeReq = {
              method: req.method,
              body,
              query: {},
              headers: req.headers,
            }
            const fakeRes = {
              statusCode: 200,
              headers: {} as Record<string, string>,
              setHeader(k: string, v: string) {
                this.headers[k] = v
              },
              status(code: number) {
                this.statusCode = code
                return this
              },
              json(payload: unknown) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json')
                }
                res.end(JSON.stringify(payload))
                return this
              },
              end() {
                res.statusCode = this.statusCode
                res.end()
                return this
              },
            }
            await chatHandler(fakeReq as never, fakeRes as never)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/ai-capacity', (req, res) => {
        void (async () => {
          try {
            const url = new URL(req.url || '/', 'http://local')
            const fakeReq = {
              method: req.method,
              body: {},
              query: Object.fromEntries(url.searchParams.entries()),
              headers: req.headers,
            }
            const fakeRes = {
              statusCode: 200,
              headers: {} as Record<string, string>,
              setHeader(k: string, v: string) {
                this.headers[k] = v
              },
              status(code: number) {
                this.statusCode = code
                return this
              },
              json(payload: unknown) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json')
                }
                res.end(JSON.stringify(payload))
                return this
              },
              end() {
                res.statusCode = this.statusCode
                res.end()
                return this
              },
            }
            await aiCapacityHandler(fakeReq as never, fakeRes as never)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/room', (req, res) => {
        void (async () => {
          try {
            const url = new URL(req.url || '/', 'http://local')
            const raw =
              req.method === 'GET' || req.method === 'HEAD'
                ? '{}'
                : await readBody(req)
            const body = JSON.parse(raw || '{}')
            const fakeReq = {
              method: req.method,
              body,
              query: Object.fromEntries(url.searchParams.entries()),
            }
            const fakeRes = {
              statusCode: 200,
              headers: {} as Record<string, string>,
              setHeader(k: string, v: string) {
                this.headers[k] = v
              },
              status(code: number) {
                this.statusCode = code
                return this
              },
              json(payload: unknown) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json')
                }
                res.end(JSON.stringify(payload))
                return this
              },
              end() {
                res.statusCode = this.statusCode
                res.end()
                return this
              },
            }
            await roomHandler(fakeReq as never, fakeRes as never)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            console.error('[local room]', message)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/morpion', (req, res) => {
        void (async () => {
          try {
            const url = new URL(req.url || '/', 'http://local')
            const raw =
              req.method === 'GET' || req.method === 'HEAD'
                ? '{}'
                : await readBody(req)
            const body = JSON.parse(raw || '{}')
            const fakeReq = {
              method: req.method,
              body,
              query: Object.fromEntries(url.searchParams.entries()),
            }
            const fakeRes = {
              statusCode: 200,
              headers: {} as Record<string, string>,
              setHeader(k: string, v: string) {
                this.headers[k] = v
              },
              status(code: number) {
                this.statusCode = code
                return this
              },
              json(payload: unknown) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json')
                }
                res.end(JSON.stringify(payload))
                return this
              },
              end() {
                res.statusCode = this.statusCode
                res.end()
                return this
              },
            }
            await morpionHandler(fakeReq as never, fakeRes as never)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            console.error('[local morpion]', message)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/pendu-words', (req, res) => {
        void (async () => {
          try {
            const url = new URL(req.url || '/', 'http://local')
            const raw =
              req.method === 'GET' || req.method === 'HEAD'
                ? '{}'
                : await readBody(req)
            const body = JSON.parse(raw || '{}')
            const fakeReq = {
              method: req.method,
              body,
              query: Object.fromEntries(url.searchParams.entries()),
              headers: req.headers,
            }
            const fakeRes = {
              statusCode: 200,
              headers: {} as Record<string, string>,
              setHeader(k: string, v: string) {
                this.headers[k] = v
              },
              status(code: number) {
                this.statusCode = code
                return this
              },
              json(payload: unknown) {
                res.statusCode = this.statusCode
                for (const [k, v] of Object.entries(this.headers)) {
                  res.setHeader(k, v)
                }
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json')
                }
                res.end(JSON.stringify(payload))
                return this
              },
              end() {
                res.statusCode = this.statusCode
                res.end()
                return this
              },
            }
            await penduWordsHandler(fakeReq as never, fakeRes as never)
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.GROQ_API_KEY) process.env.GROQ_API_KEY = env.GROQ_API_KEY
  if (env.GROQ_API_KEY_2) process.env.GROQ_API_KEY_2 = env.GROQ_API_KEY_2
  if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY
  if (env.GEMINI_API_KEY_2) process.env.GEMINI_API_KEY_2 = env.GEMINI_API_KEY_2
  if (env.CEREBRAS_API_KEY) process.env.CEREBRAS_API_KEY = env.CEREBRAS_API_KEY
  if (env.CEREBRAS_API_Gemma431B_KEY)
    process.env.CEREBRAS_API_Gemma431B_KEY = env.CEREBRAS_API_Gemma431B_KEY
  if (env.CEREBRAS_API_OpenAIGPTOSS_KEY)
    process.env.CEREBRAS_API_OpenAIGPTOSS_KEY = env.CEREBRAS_API_OpenAIGPTOSS_KEY
  if (env.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY
  if (env.OPENROUTER_API_KEY)
    process.env.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY
  if (env.OPENROUTER_API_KEY_2)
    process.env.OPENROUTER_API_KEY_2 = env.OPENROUTER_API_KEY_2
  if (env.UNSPLASH_ACCESS_KEY) process.env.UNSPLASH_ACCESS_KEY = env.UNSPLASH_ACCESS_KEY
  if (env.UPSTASH_REDIS_REST_URL)
    process.env.UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL
  if (env.UPSTASH_REDIS_REST_TOKEN)
    process.env.UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN
  if (env.KV_REST_API_URL) process.env.KV_REST_API_URL = env.KV_REST_API_URL
  if (env.KV_REST_API_TOKEN)
    process.env.KV_REST_API_TOKEN = env.KV_REST_API_TOKEN
  if (env.KV_URL) process.env.KV_URL = env.KV_URL
  if (env.REDIS_MAX_MB) process.env.REDIS_MAX_MB = env.REDIS_MAX_MB
  if (env.CALIB_STATS_SECRET)
    process.env.CALIB_STATS_SECRET = env.CALIB_STATS_SECRET

  return {
    plugins: [react(), localApiPlugin()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
  }
})
