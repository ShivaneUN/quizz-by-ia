import { getOrCreatePlayerId } from './bankStorage'

export const TTS_VOICES = [
  { id: 'fr-FR-DeniseNeural', label: 'Denise' },
  { id: 'fr-FR-HenriNeural', label: 'Henri' },
  { id: 'fr-FR-VivienneMultilingualNeural', label: 'Vivienne' },
  { id: 'fr-FR-RemyMultilingualNeural', label: 'Rémy' },
] as const

export type TtsVoiceId = (typeof TTS_VOICES)[number]['id']

export const DEFAULT_TTS_VOICE: TtsVoiceId = 'fr-FR-DeniseNeural'

const TTS_START_EVENT = 'quizz:tts-start'
const TTS_STOP_EVENT = 'quizz:tts-stop'
const PREVIEW_PLAY_EVENT = 'quizz:preview-play'

export const ttsEvents = {
  start: TTS_START_EVENT,
  stop: TTS_STOP_EVENT,
  previewPlay: PREVIEW_PLAY_EVENT,
} as const

function autoKey(playerId: string): string {
  return `quizz:tts:auto:${playerId}`
}

function voiceKey(playerId: string): string {
  return `quizz:tts:voice:${playerId}`
}

function isTtsVoice(raw: unknown): raw is TtsVoiceId {
  return (
    typeof raw === 'string' && TTS_VOICES.some((voice) => voice.id === raw)
  )
}

export function loadTtsAuto(): boolean {
  try {
    const id = getOrCreatePlayerId()
    return localStorage.getItem(autoKey(id)) === '1'
  } catch {
    return false
  }
}

export function saveTtsAuto(on: boolean): void {
  try {
    const id = getOrCreatePlayerId()
    localStorage.setItem(autoKey(id), on ? '1' : '0')
  } catch {
    /* private mode */
  }
}

export function loadTtsVoice(): TtsVoiceId {
  try {
    const id = getOrCreatePlayerId()
    const raw = localStorage.getItem(voiceKey(id))
    if (isTtsVoice(raw)) return raw
  } catch {
    /* private mode */
  }
  return DEFAULT_TTS_VOICE
}

export function saveTtsVoice(voice: TtsVoiceId): void {
  try {
    const id = getOrCreatePlayerId()
    localStorage.setItem(voiceKey(id), voice)
  } catch {
    /* private mode */
  }
}

export function emitTtsStart(): void {
  window.dispatchEvent(new Event(TTS_START_EVENT))
}

export function emitTtsStop(): void {
  window.dispatchEvent(new Event(TTS_STOP_EVENT))
}

export function emitPreviewPlay(): void {
  window.dispatchEvent(new Event(PREVIEW_PLAY_EVENT))
}

export async function fetchTtsAudio(
  input: {
    voice: TtsVoiceId
    question: string
    answers: [string, string, string, string]
    answerMode?: 'qcm' | 'free'
  },
  signal?: AbortSignal,
): Promise<Blob> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice: input.voice,
      question: input.question,
      answers: input.answerMode === 'free' ? [] : input.answers,
      answerMode: input.answerMode === 'free' ? 'free' : 'qcm',
    }),
    signal,
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `TTS indisponible (${res.status})`)
  }
  return res.blob()
}
