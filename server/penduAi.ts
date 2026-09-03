/**
 * Filet pendu : si la banque d’un palier est épuisée, l’IA génère des mots.
 * Ils sont joués tout de suite ET loggés (admin) pour ajout manuel à la banque.
 */

import { listApiKeys } from './aiRotate.js'
import { recordAiGeneration, recordAiModelError } from './aiGenStats.js'
import { redisCommand, redisConfigured } from './rooms.js'
import {
  shuffle,
  canonPenduWord,
  drawPenduWords,
  matchesPenduDifficulty,
  penduStaticPool,
  recyclePenduWords,
} from './sharedLib.js'

type Difficulty = 'easy' | 'medium' | 'hard'

const LOG_KEY = 'quizz:pendu:ai-log'
const POOL_PREFIX = 'quizz:pendu:ai-pool:'
const MAX_LOG = 400
const MAX_POOL = 400

export type PenduAiLogEvent = {
  id: string
  at: number
  difficulty: Difficulty
  words: string[]
  source: string
  mode?: string
}

const memLog: PenduAiLogEvent[] = []
const memPool: Record<Difficulty, string[]> = {
  easy: [],
  medium: [],
  hard: [],
}

function asDifficulty(raw: unknown): Difficulty {
  return raw === 'medium' || raw === 'hard' ? raw : 'easy'
}

function newId(): string {
  return `p${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function poolKey(d: Difficulty): string {
  return POOL_PREFIX + d
}

function uniqCanon(words: readonly string[], difficulty: Difficulty): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of words) {
    const w = canonPenduWord(String(raw ?? ''))
    if (!w || seen.has(w) || !matchesPenduDifficulty(w, difficulty)) continue
    seen.add(w)
    out.push(w)
  }
  return out
}

async function readPool(d: Difficulty): Promise<string[]> {
  if (redisConfigured()) {
    try {
      const raw = await redisCommand<string[] | null>('SMEMBERS', poolKey(d))
      if (Array.isArray(raw)) {
        return uniqCanon(
          raw.map((x) => (typeof x === 'string' ? x : String(x))),
          d,
        )
      }
    } catch {
      /* mémoire */
    }
  }
  return memPool[d].slice()
}

async function addToPool(d: Difficulty, words: string[]): Promise<void> {
  const clean = uniqCanon(words, d)
  if (clean.length === 0) return
  const set = new Set(memPool[d])
  for (const w of clean) set.add(w)
  memPool[d] = [...set].slice(-MAX_POOL)
  if (!redisConfigured()) return
  try {
    await redisCommand('SADD', poolKey(d), ...clean)
  } catch {
    /* ignore */
  }
}

export async function pushPenduAiLog(
  event: Omit<PenduAiLogEvent, 'id' | 'at'> & { at?: number },
): Promise<PenduAiLogEvent> {
  const row: PenduAiLogEvent = {
    id: newId(),
    at: event.at ?? Date.now(),
    difficulty: asDifficulty(event.difficulty),
    words: uniqCanon(event.words, asDifficulty(event.difficulty)),
    source: String(event.source ?? 'ai').slice(0, 40),
    mode: event.mode ? String(event.mode).slice(0, 16) : undefined,
  }
  if (row.words.length === 0) return row
  memLog.unshift(row)
  if (memLog.length > MAX_LOG) memLog.length = MAX_LOG
  if (redisConfigured()) {
    try {
      await redisCommand('LPUSH', LOG_KEY, JSON.stringify(row))
      await redisCommand('LTRIM', LOG_KEY, 0, MAX_LOG - 1)
    } catch {
      /* mémoire OK */
    }
  }
  await addToPool(row.difficulty, row.words)
  return row
}

export async function listPenduAiLog(limit = 200): Promise<PenduAiLogEvent[]> {
  const cap = Math.max(1, Math.min(MAX_LOG, limit))
  if (redisConfigured()) {
    try {
      const raw = await redisCommand<string[] | null>('LRANGE', LOG_KEY, 0, cap - 1)
      if (Array.isArray(raw)) {
        const out: PenduAiLogEvent[] = []
        for (const item of raw) {
          try {
            const parsed = JSON.parse(item) as PenduAiLogEvent
            if (parsed && Array.isArray(parsed.words)) {
              out.push({
                id: String(parsed.id ?? newId()),
                at: Number(parsed.at) || 0,
                difficulty: asDifficulty(parsed.difficulty),
                words: uniqCanon(parsed.words, asDifficulty(parsed.difficulty)),
                source: String(parsed.source ?? 'ai'),
                mode: parsed.mode ? String(parsed.mode) : undefined,
              })
            }
          } catch {
            /* skip */
          }
        }
        return out
      }
    } catch {
      /* mémoire */
    }
  }
  return memLog.slice(0, cap)
}

export async function clearPenduAiLog(): Promise<void> {
  memLog.length = 0
  memPool.easy = []
  memPool.medium = []
  memPool.hard = []
  if (!redisConfigured()) return
  try {
    await redisCommand('DEL', LOG_KEY)
    await redisCommand('DEL', poolKey('easy'))
    await redisCommand('DEL', poolKey('medium'))
    await redisCommand('DEL', poolKey('hard'))
  } catch {
    /* ignore */
  }
}

function parseWordsJson(text: string): string[] {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  const slice =
    start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed
  try {
    const data = JSON.parse(slice) as { words?: unknown }
    if (Array.isArray(data.words)) {
      return data.words.map((x) => String(x ?? ''))
    }
  } catch {
    /* fallback lines */
  }
  return trimmed
    .split(/[\n,;]+/)
    .map((s) => s.replace(/["'[\]{}]/g, '').trim())
    .filter(Boolean)
}

function levelHint(d: Difficulty): string {
  if (d === 'easy') {
    return 'FACILE : mots français très courants, 5 ou 6 lettres, SANS tiret, SANS accent.'
  }
  if (d === 'hard') {
    return 'DIFFICILE : soit un grand mot simple (8 à 12 lettres, sans tiret), soit un mot composé avec trait d’union (ex: ARC-EN-CIEL, GRILLE-PAIN). Accents interdits (E au lieu de É).'
  }
  return 'MOYEN : mots français courants, 5 à 12 lettres, SANS tiret, SANS accent.'
}

async function callLlmJson(
  engine: 'gemini' | 'groq',
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  if (engine === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 180)}`)
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      usageMetadata?: {
        promptTokenCount?: number
        candidatesTokenCount?: number
      }
    }
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('\n') ??
      ''
    return {
      text,
      tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
    }
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Réponds uniquement en JSON valide. Pas de texte autour.',
        },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Groq ${res.status}: ${detail.slice(0, 180)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  }
}

async function generatePenduWordsAi(input: {
  difficulty: Difficulty
  count: number
  exclude: string[]
}): Promise<{ words: string[]; source: string } | null> {
  const need = Math.max(1, Math.min(12, input.count))
  const blocked = new Set(
    [
      ...penduStaticPool(input.difficulty),
      ...input.exclude,
    ].map(canonPenduWord),
  )
  const avoid = [...blocked].slice(0, 80).join(', ')
  const prompt = `Génère exactement ${need} mots français DISTINCTS pour un jeu du pendu.
${levelHint(input.difficulty)}
Interdit : noms propres obscurs, insultes, marques, chiffres, apostrophes.
Ne répète aucun de ces mots : ${avoid || '(aucun)'}
JSON unique : {"words":["MOT1","MOT2"]}`

  const routes: Array<{ engine: 'gemini' | 'groq'; model: string; key: string }> =
    []
  const gKey = listApiKeys('gemini')[0]
  const qKey = listApiKeys('groq')[0]
  if (gKey) routes.push({ engine: 'gemini', model: 'gemini-flash-lite-latest', key: gKey })
  if (qKey) routes.push({ engine: 'groq', model: 'openai/gpt-oss-20b', key: qKey })

  for (const route of routes) {
    try {
      const out = await callLlmJson(route.engine, route.key, route.model, prompt)
      const words = uniqCanon(parseWordsJson(out.text), input.difficulty).filter(
        (w) => !blocked.has(w),
      )
      await recordAiGeneration({
        engine: route.engine,
        model: route.model,
        mode: 'full',
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        questions: words.length,
      })
      if (words.length > 0) {
        return { words: words.slice(0, need), source: `${route.engine}:${route.model}` }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'erreur IA'
      await recordAiModelError({
        engine: route.engine,
        model: route.model,
        kind: /timeout|délai|AbortError/i.test(message) ? 'timeout' : 'other',
        message,
      })
    }
  }
  return null
}

export async function fillPenduWords(input: {
  count: number
  difficulty: Difficulty
  exclude?: readonly string[]
  mode?: string
  allowAi?: boolean
}): Promise<{ words: string[]; source: 'bank' | 'ai' | 'mixed' | 'recycle' }> {
  const difficulty = asDifficulty(input.difficulty)
  const need = Math.max(1, Math.min(12, Math.floor(input.count) || 1))
  const exclude = (input.exclude ?? []).map(canonPenduWord).filter(Boolean)

  const fromBank = drawPenduWords(need, difficulty, exclude)
  if (fromBank.length >= need) {
    return { words: fromBank.slice(0, need), source: 'bank' }
  }

  if (input.allowAi === false) {
    return {
      words: recyclePenduWords(need, difficulty, fromBank),
      source: 'recycle',
    }
  }

  const blocked = new Set([...exclude, ...fromBank.map(canonPenduWord)])
  const still = need - fromBank.length
  const pool = shuffle((await readPool(difficulty)).filter((w) => !blocked.has(w)))
  const fromPool = pool.slice(0, still)
  for (const w of fromPool) blocked.add(w)

  let fromAi: string[] = []
  let aiSource = 'ai'
  if (fromBank.length + fromPool.length < need) {
    const gen = await generatePenduWordsAi({
      difficulty,
      count: need - fromBank.length - fromPool.length,
      exclude: [...blocked],
    })
    if (gen) {
      fromAi = gen.words.filter((w) => !blocked.has(w))
      aiSource = gen.source
      if (fromAi.length > 0) {
        await pushPenduAiLog({
          difficulty,
          words: fromAi,
          source: aiSource,
          mode: input.mode,
        })
      }
    }
  }

  const mixed = [...fromBank, ...fromPool, ...fromAi].slice(0, need)
  if (mixed.length >= need) {
    const usedAi = fromAi.length > 0 || fromPool.length > 0
    return {
      words: mixed,
      source: usedAi && fromBank.length > 0 ? 'mixed' : usedAi ? 'ai' : 'bank',
    }
  }

  const recycled = drawPenduWords(need, difficulty, [])
  return {
    words: recycled.length > 0 ? recycled : mixed,
    source: 'recycle',
  }
}
