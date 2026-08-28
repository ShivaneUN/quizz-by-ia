import { useEffect, useRef, useState } from 'react'
import {
  fetchTtsAudio,
  loadTtsAuto,
  loadTtsVoice,
  saveTtsAuto,
  saveTtsVoice,
  emitTtsStart,
  emitTtsStop,
  ttsEvents,
  TTS_VOICES,
  type TtsVoiceId,
} from '../lib/tts'
import './QuestionTtsBar.css'

interface QuestionTtsBarProps {
  questionId: string
  question: string
  answers: [string, string, string, string]
  answerMode?: 'qcm' | 'free'
}

function clipKey(questionId: string, voice: TtsVoiceId): string {
  return `${questionId}:${voice}`
}

export function QuestionTtsBar({
  questionId,
  question,
  answers,
  answerMode,
}: QuestionTtsBarProps) {
  const [voice, setVoice] = useState<TtsVoiceId>(() => loadTtsVoice())
  const [auto, setAuto] = useState(() => loadTtsAuto())
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)

  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const autoRef = useRef(auto)
  autoRef.current = auto

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const playGenRef = useRef(0)
  const wantPlayRef = useRef(false)

  const clipsRef = useRef(new Map<string, Blob>())
  const inflightRef = useRef(new Map<string, Promise<Blob | null>>())
  const abortByKeyRef = useRef(new Map<string, AbortController>())

  function stopAudio() {
    playGenRef.current += 1
    wantPlayRef.current = false
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    setPlaying(false)
    setLoading(false)
    emitTtsStop()
  }

  function cancelAllPrefetch() {
    for (const ac of abortByKeyRef.current.values()) ac.abort()
    abortByKeyRef.current.clear()
    inflightRef.current.clear()
  }

  function ensureClip(voiceToUse: TtsVoiceId): Promise<Blob | null> {
    const key = clipKey(questionId, voiceToUse)
    const cached = clipsRef.current.get(key)
    if (cached) return Promise.resolve(cached)

    const existing = inflightRef.current.get(key)
    if (existing) return existing

    const ac = new AbortController()
    abortByKeyRef.current.set(key, ac)

    const pending = fetchTtsAudio(
      {
        voice: voiceToUse,
        question,
        answers,
        answerMode,
      },
      ac.signal,
    )
      .then((blob) => {
        if (ac.signal.aborted) return null
        clipsRef.current.set(key, blob)
        return blob
      })
      .catch((e) => {
        if (ac.signal.aborted) return null
        console.warn('[tts]', e instanceof Error ? e.message : e)
        return null
      })
      .finally(() => {
        inflightRef.current.delete(key)
        abortByKeyRef.current.delete(key)
      })

    inflightRef.current.set(key, pending)
    return pending
  }

  async function startPlayback(voiceToUse: TtsVoiceId) {
    const myGen = ++playGenRef.current
    wantPlayRef.current = true
    const ready = clipsRef.current.has(clipKey(questionId, voiceToUse))
    if (!ready) setLoading(true)
    setPlaying(false)
    emitTtsStart()

    const blob = await ensureClip(voiceToUse)
    if (myGen !== playGenRef.current || !wantPlayRef.current) return
    if (!blob) {
      setLoading(false)
      setPlaying(false)
      emitTtsStop()
      return
    }

    const url = URL.createObjectURL(blob)
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url

    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio
    audio.src = url
    audio.onended = () => {
      if (myGen !== playGenRef.current) return
      wantPlayRef.current = false
      setPlaying(false)
      setLoading(false)
      emitTtsStop()
    }

    try {
      await audio.play()
    } catch (e) {
      if (myGen !== playGenRef.current || !wantPlayRef.current) return
      setLoading(false)
      setPlaying(false)
      emitTtsStop()
      console.warn('[tts]', e instanceof Error ? e.message : e)
      return
    }

    if (myGen !== playGenRef.current || !wantPlayRef.current) {
      audio.pause()
      return
    }
    setLoading(false)
    setPlaying(true)
  }

  useEffect(() => {
    stopAudio()
    clipsRef.current.clear()
    cancelAllPrefetch()
    const voiceToUse = voiceRef.current
    void ensureClip(voiceToUse)
    if (autoRef.current) {
      void startPlayback(voiceToUse)
    }
    return () => {
      stopAudio()
      cancelAllPrefetch()
    }
  }, [questionId])

  useEffect(() => {
    void ensureClip(voice)
  }, [voice])

  useEffect(() => {
    const onPreview = () => stopAudio()
    window.addEventListener(ttsEvents.previewPlay, onPreview)
    return () => window.removeEventListener(ttsEvents.previewPlay, onPreview)
  }, [])

  function onVoiceChange(next: TtsVoiceId) {
    setVoice(next)
    saveTtsVoice(next)
  }

  function onToggleAuto() {
    const next = !auto
    setAuto(next)
    saveTtsAuto(next)
  }

  function onPlayStop() {
    if (playing || loading) {
      stopAudio()
      return
    }
    void startPlayback(voice)
  }

  return (
    <div className="tts-bar" role="group" aria-label="Lecture vocale">
      <label className="tts-bar__voice-wrap">
        <span className="tts-bar__sr">Voix</span>
        <select
          className="tts-bar__voice"
          value={voice}
          onChange={(e) => onVoiceChange(e.target.value as TtsVoiceId)}
          aria-label="Voix"
        >
          {TTS_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className={`tts-bar__auto${auto ? ' is-on' : ''}`}
        aria-pressed={auto}
        title={auto ? 'Lecture auto activée' : 'Lecture auto désactivée'}
        onClick={onToggleAuto}
      >
        Auto
      </button>

      <button
        type="button"
        className={`tts-bar__play${playing || loading ? ' is-active' : ''}`}
        aria-label={
          loading
            ? 'Chargement de la lecture'
            : playing
              ? 'Arrêter la lecture'
              : 'Lire la question'
        }
        title={loading ? 'Chargement…' : playing ? 'Arrêter' : 'Lire'}
        onClick={onPlayStop}
      >
        {loading ? (
          <span className="tts-bar__spinner" aria-hidden />
        ) : playing ? (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 2.5v11l9-5.5-9-5.5z" fill="currentColor" />
          </svg>
        )}
      </button>
    </div>
  )
}
