import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite'
import react from '@vitejs/plugin-react'
import {
  generateQuestions,
  normalizeThemeSlug,
  parseAiProvider,
  parseQuizContentMode,
  type Difficulty,
} from './server/generate.ts'
import {
  getGenerationEstimateSec,
  recordGenerationMs,
} from './server/genStats.ts'
import roomHandler from './api/room.ts'
import genEtaHandler from './api/gen-eta.ts'
import calibStatsHandler from './api/calib-stats.ts'
import questionFeedbackHandler from './api/question-feedback.ts'
import chatHandler from './api/chat.ts'

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
            if (mode === 'complementary') {
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
              res.statusCode = 422
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: result.error }))
              return
            }

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
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Erreur serveur'
            console.error('[local api]', message)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })()
      })

      server.middlewares.use('/api/gen-eta', (req, res) => {
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
            await genEtaHandler(fakeReq as never, fakeRes as never)
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
