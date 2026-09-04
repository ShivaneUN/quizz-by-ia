import { useEffect, useRef, useState } from 'react'
import { emitPreviewPlay, onPlaybackStop, ttsEvents } from '../lib/tts'
import { writeDeezerAutoplayPreference } from '../lib/deezerStyles'

interface PreviewAudioProps {
  src: string
  questionId: string
  /** Durée max de lecture (extrait Deezer ~30 s) */
  maxSeconds?: number
  /** Démarre tout seul ; à chaque nouvel extrait coupe l’ancien et reprend */
  autoPlay?: boolean
  /** Notifie le parent si l’utilisateur bascule Auto */
  onAutoPlayChange?: (on: boolean) => void
  /** Réponse envoyée / révélée → coupe et empêche la reprise auto */
  halted?: boolean
  figureClassName?: string
  audioClassName?: string
  captionClassName?: string
}

/** Lecteur d’extrait Deezer — pas de TTS question, seulement l’extrait. */
export function PreviewAudio({
  src,
  questionId,
  maxSeconds = 30,
  autoPlay = false,
  onAutoPlayChange,
  halted = false,
  figureClassName = 'quiz-play__media quiz-play__media--audio',
  audioClassName = 'quiz-play__audio',
  captionClassName = 'quiz-play__audio-caption',
}: PreviewAudioProps) {
  const ref = useRef<HTMLAudioElement>(null)
  const haltedRef = useRef(halted)
  haltedRef.current = halted
  const limit = Math.max(1, maxSeconds)
  const [auto, setAuto] = useState(autoPlay)

  useEffect(() => {
    setAuto(autoPlay)
  }, [autoPlay])

  function pauseNow() {
    const el = ref.current
    if (!el) return
    el.pause()
  }

  function toggleAuto() {
    setAuto((v) => {
      const next = !v
      writeDeezerAutoplayPreference(next)
      onAutoPlayChange?.(next)
      return next
    })
  }

  // Coupe nette + autoplay à chaque nouvel extrait
  useEffect(() => {
    const el = ref.current
    if (!el) return

    el.pause()
    try {
      el.currentTime = 0
    } catch {
      /* ignore */
    }

    if (!auto || haltedRef.current) {
      return () => {
        el.pause()
        try {
          el.currentTime = 0
        } catch {
          /* ignore */
        }
      }
    }

    let cancelled = false
    const tryPlay = () => {
      if (cancelled || haltedRef.current) return
      void el.play().catch(() => {
        /* politique autoplay navigateur */
      })
    }

    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryPlay()
    } else {
      el.addEventListener('canplay', tryPlay, { once: true })
    }

    return () => {
      cancelled = true
      el.removeEventListener('canplay', tryPlay)
      el.pause()
      try {
        el.currentTime = 0
      } catch {
        /* ignore */
      }
    }
  }, [questionId, src, auto])

  // Réponse cliquée / révélée
  useEffect(() => {
    if (!halted) return
    pauseNow()
  }, [halted])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const clip = () => {
      if (el.currentTime >= limit) {
        el.pause()
        el.currentTime = 0
      }
    }

    const onTtsStart = () => {
      el.pause()
    }
    const onStop = () => {
      el.pause()
    }
    const onPlay = () => {
      if (haltedRef.current) {
        el.pause()
        return
      }
      emitPreviewPlay()
    }

    el.addEventListener('timeupdate', clip)
    el.addEventListener('play', onPlay)
    window.addEventListener(ttsEvents.start, onTtsStart)
    window.addEventListener(ttsEvents.stop, onStop)
    const off = onPlaybackStop(() => el.pause())
    return () => {
      el.removeEventListener('timeupdate', clip)
      el.removeEventListener('play', onPlay)
      window.removeEventListener(ttsEvents.start, onTtsStart)
      window.removeEventListener(ttsEvents.stop, onStop)
      off()
    }
  }, [questionId, limit])

  return (
    <figure className={figureClassName}>
      <div className="preview-audio__row">
        <audio
          key={questionId}
          ref={ref}
          className={audioClassName}
          controls
          preload="auto"
          src={src}
        >
          Ton navigateur ne lit pas l’audio.
        </audio>
        <button
          type="button"
          className={`preview-audio__auto${auto ? ' is-on' : ''}`}
          role="switch"
          aria-checked={auto}
          onClick={toggleAuto}
          title={
            auto
              ? 'Lecture auto activée — clique pour désactiver'
              : 'Lecture auto désactivée — clique pour activer'
          }
        >
          Auto {auto ? 'ON' : 'OFF'}
        </button>
      </div>
      <figcaption className={captionClassName}>
        Extrait Deezer (~{limit} s)
        {auto ? ' · démarre tout seul' : ' · lance avec ▶'}
      </figcaption>
    </figure>
  )
}
