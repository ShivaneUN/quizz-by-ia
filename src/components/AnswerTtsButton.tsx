import { useEffect, useRef, useState } from 'react'
import {
  emitPreviewPlay,
  emitTtsStop,
  fetchTtsAudio,
  onPlaybackStop,
  ttsEvents,
} from '../lib/tts'
import './AnswerTtsButton.css'

/** Voix multilingue : mieux pour prononcer un mot hors français. */
const ANSWER_VOICE = 'fr-FR-VivienneMultilingualNeural' as const

/** Ne lit jamais le contenu entre parenthèses : `こんにちは (konnichiwa)` → `こんにちは`. */
function stripParentheticalsForSpeech(text: string): string {
  return text
    .replace(/（[^）]*）/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function speechTextFromAnswer(text: string): string {
  return stripParentheticalsForSpeech(text) || text.trim()
}

interface AnswerTtsButtonProps {
  text: string
  className?: string
}

/** Bouton rejouer la bonne réponse (thème Langues). */
export function AnswerTtsButton({ text, className }: AnswerTtsButtonProps) {
  const clipped = text.trim()
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const playGenRef = useRef(0)
  const blobRef = useRef<Blob | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  /** Ignore les stops provoqués par notre propre démarrage (preview → coupe question). */
  const ignoreExternalStopRef = useRef(false)

  function stop(emit = true) {
    playGenRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
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
    if (emit) emitTtsStop()
  }

  useEffect(() => {
    blobRef.current = null
    stop(false)
    return () => stop(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipped])

  useEffect(() => {
    const onExternalStop = () => {
      if (ignoreExternalStopRef.current) return
      stop(false)
    }
    window.addEventListener(ttsEvents.start, onExternalStop)
    window.addEventListener(ttsEvents.stop, onExternalStop)
    const off = onPlaybackStop(onExternalStop)
    return () => {
      window.removeEventListener(ttsEvents.start, onExternalStop)
      window.removeEventListener(ttsEvents.stop, onExternalStop)
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!clipped) return null

  async function fetchBlob(speech: string, signal: AbortSignal): Promise<Blob> {
    return fetchTtsAudio(
      {
        voice: ANSWER_VOICE,
        question: speech,
        answers: ['', '', '', ''],
        answerMode: 'free',
      },
      signal,
    )
  }

  async function play() {
    if (playing || loading) {
      stop()
      return
    }

    const myGen = ++playGenRef.current
    ignoreExternalStopRef.current = true
    emitPreviewPlay()
    // Les handlers preview sont sync ; on peut réécouter les stops ensuite.
    queueMicrotask(() => {
      ignoreExternalStopRef.current = false
    })
    setLoading(true)
    setPlaying(false)

    try {
      let blob = blobRef.current
      if (!blob) {
        abortRef.current?.abort()
        const ac = new AbortController()
        abortRef.current = ac

        const primary = speechTextFromAnswer(clipped)
        if (!primary) throw new Error('texte TTS vide')
        blob = await fetchBlob(primary, ac.signal)
        if (myGen !== playGenRef.current) return
        blobRef.current = blob
      }

      const url = URL.createObjectURL(blob)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url

      const audio = audioRef.current ?? new Audio()
      audioRef.current = audio
      audio.src = url
      audio.onended = () => {
        if (myGen !== playGenRef.current) return
        setPlaying(false)
        setLoading(false)
      }

      await audio.play()
      if (myGen !== playGenRef.current) {
        audio.pause()
        return
      }
      setLoading(false)
      setPlaying(true)
    } catch (e) {
      if (myGen !== playGenRef.current) return
      setLoading(false)
      setPlaying(false)
      console.warn('[tts-answer]', e instanceof Error ? e.message : e)
    }
  }

  return (
    <button
      type="button"
      className={`answer-tts${playing || loading ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      aria-label={
        loading
          ? 'Chargement de la prononciation'
          : playing
            ? 'Arrêter la prononciation'
            : 'Écouter la bonne réponse'
      }
      title={loading ? 'Chargement…' : playing ? 'Arrêter' : 'Écouter'}
      onClick={() => void play()}
    >
      {loading ? (
        <span className="answer-tts__spinner" aria-hidden />
      ) : playing ? (
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
          <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
          <path d="M2 5.5h2.2L8 2.5v11L4.2 10.5H2v-5z" fill="currentColor" />
          <path
            d="M10.2 5.8a2.6 2.6 0 010 4.4M12 4a4.6 4.6 0 010 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  )
}
