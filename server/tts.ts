/**
 * TTS Edge Neural Voices — cache mémoire (dev) + Redis Upstash (prod).
 */

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import type { Readable } from 'node:stream'
import { redisCommand, redisConfigured } from './rooms.js'

const require = createRequire(import.meta.url)

export const TTS_VOICES = [
  { id: 'fr-FR-DeniseNeural', label: 'Denise' },
  { id: 'fr-FR-HenriNeural', label: 'Henri' },
  { id: 'fr-FR-VivienneMultilingualNeural', label: 'Vivienne' },
  { id: 'fr-FR-RemyMultilingualNeural', label: 'Rémy' },
] as const

export type TtsVoiceId = (typeof TTS_VOICES)[number]['id']

const LETTERS = ['A', 'B', 'C', 'D'] as const
const MAX_TEXT = 2_500
const MAX_CACHE = 80
const SYNTH_TIMEOUT_MS = 18_000
const REDIS_TTL_SEC = 60 * 60 * 24 * 14
const LOCK_TTL_SEC = 25
const LOCK_WAIT_MS = 400
const LOCK_WAIT_TRIES = 30

const cache = new Map<string, Buffer>()
const inflight = new Map<string, Promise<Buffer>>()

function isTtsVoice(raw: unknown): raw is TtsVoiceId {
  return (
    typeof raw === 'string' && TTS_VOICES.some((voice) => voice.id === raw)
  )
}

function normalizeText(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Texte canonique lu à voix haute (et hashé pour le cache). */
export function buildSpeechText(input: {
  question: string
  answers: string[]
  answerMode?: string
}): string {
  const question = normalizeText(input.question)
  if (!question) return ''
  if (input.answerMode === 'free') return question

  const answers = input.answers
    .map((a) => normalizeText(a))
    .filter(Boolean)
    .slice(0, 4)
  if (answers.length === 0) return question

  const lead = /[.!?…]$/.test(question) ? question : `${question}.`
  const choices = answers
    .map((text, i) => `Réponse ${LETTERS[i]} : ${text}`)
    .join('. ')
  return `${lead} ${choices}.`
}

function cacheKey(voice: TtsVoiceId, text: string): string {
  const hash = createHash('sha256').update(text.normalize('NFC')).digest('hex')
  return `quizz:tts:v1:${voice}:${hash}`
}

function lockKey(dataKey: string): string {
  return `quizz:tts:lock:${dataKey}`
}

function remember(key: string, buf: Buffer): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, buf)
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: unknown) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array))
    })
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type EdgeTtsModule = {
  MsEdgeTTS: new () => {
    setMetadata: (voice: string, format: string) => Promise<void>
    toStream: (input: string) => { audioStream: Readable }
    close: () => void
  }
  OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: string }
}

async function synthesizeWithEdge(
  voice: TtsVoiceId,
  text: string,
): Promise<Buffer> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts') as EdgeTtsModule
  const tts = new MsEdgeTTS()
  try {
    await tts.setMetadata(
      voice,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    )
    const { audioStream } = tts.toStream(text)
    const audio = await Promise.race([
      streamToBuffer(audioStream),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Délai de synthèse dépassé')),
          SYNTH_TIMEOUT_MS,
        )
      }),
    ])
    if (audio.byteLength < 64) {
      throw new Error('Audio TTS vide')
    }
    return audio
  } finally {
    tts.close()
  }
}

async function redisGetAudio(key: string): Promise<Buffer | null> {
  if (!redisConfigured()) return null
  try {
    const raw = await redisCommand<string | null>('GET', key)
    if (typeof raw !== 'string' || !raw) return null
    const buf = Buffer.from(raw, 'base64')
    return buf.byteLength >= 64 ? buf : null
  } catch (e) {
    console.warn(
      '[tts] redis get',
      e instanceof Error ? e.message : e,
    )
    return null
  }
}

async function redisSetAudio(key: string, buf: Buffer): Promise<void> {
  if (!redisConfigured()) return
  try {
    await redisCommand('SETEX', key, REDIS_TTL_SEC, buf.toString('base64'))
  } catch (e) {
    console.warn(
      '[tts] redis set',
      e instanceof Error ? e.message : e,
    )
  }
}

async function redisAcquireLock(key: string): Promise<boolean> {
  if (!redisConfigured()) return true
  try {
    const got = await redisCommand<string | null>(
      'SET',
      lockKey(key),
      '1',
      'NX',
      'EX',
      LOCK_TTL_SEC,
    )
    return got === 'OK'
  } catch {
    return true
  }
}

async function redisReleaseLock(key: string): Promise<void> {
  if (!redisConfigured()) return
  try {
    await redisCommand('DEL', lockKey(key))
  } catch {
    /* ignore */
  }
}

async function waitForRedisAudio(key: string): Promise<Buffer | null> {
  for (let i = 0; i < LOCK_WAIT_TRIES; i++) {
    await sleep(LOCK_WAIT_MS)
    const hit = await redisGetAudio(key)
    if (hit) return hit
  }
  return null
}

export type TtsRequestBody = {
  voice?: unknown
  question?: unknown
  answers?: unknown
  answerMode?: unknown
}

export type TtsResult =
  | { ok: true; audio: Buffer; contentType: 'audio/mpeg' }
  | { ok: false; status: number; error: string }

export async function synthesizeQuizSpeech(
  body: TtsRequestBody,
): Promise<TtsResult> {
  if (!isTtsVoice(body.voice)) {
    return { ok: false, status: 400, error: 'voix invalide' }
  }
  const question = typeof body.question === 'string' ? body.question : ''
  if (!normalizeText(question)) {
    return { ok: false, status: 400, error: 'question requise' }
  }
  const answers = Array.isArray(body.answers)
    ? body.answers.filter((item): item is string => typeof item === 'string')
    : []
  const answerMode = body.answerMode === 'free' ? 'free' : 'qcm'
  const text = buildSpeechText({ question, answers, answerMode })
  if (!text) {
    return { ok: false, status: 400, error: 'texte vide' }
  }
  if (text.length > MAX_TEXT) {
    return { ok: false, status: 400, error: 'texte trop long' }
  }

  const voice = body.voice
  const key = cacheKey(voice, text)
  const memHit = cache.get(key)
  if (memHit) return { ok: true, audio: memHit, contentType: 'audio/mpeg' }

  const redisHit = await redisGetAudio(key)
  if (redisHit) {
    remember(key, redisHit)
    return { ok: true, audio: redisHit, contentType: 'audio/mpeg' }
  }

  let pending = inflight.get(key)
  if (!pending) {
    pending = (async () => {
      const locked = await redisAcquireLock(key)
      if (!locked) {
        const waited = await waitForRedisAudio(key)
        if (waited) {
          remember(key, waited)
          return waited
        }
      }
      try {
        const still = await redisGetAudio(key)
        if (still) {
          remember(key, still)
          return still
        }
        const buf = await synthesizeWithEdge(voice, text)
        remember(key, buf)
        await redisSetAudio(key, buf)
        return buf
      } finally {
        if (locked) await redisReleaseLock(key)
      }
    })().finally(() => {
      inflight.delete(key)
    })
    inflight.set(key, pending)
  }

  try {
    const audio = await pending
    return { ok: true, audio, contentType: 'audio/mpeg' }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'synthèse impossible'
    console.error('[tts]', message)
    return { ok: false, status: 502, error: message }
  }
}
