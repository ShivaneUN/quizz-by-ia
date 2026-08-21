import { useEffect, useRef } from 'react'

interface PreviewAudioProps {
  src: string
  questionId: string
  /** Durée max de lecture (extrait Deezer ~30 s) */
  maxSeconds?: number
  figureClassName?: string
  audioClassName?: string
  captionClassName?: string
}

/** Lecteur d’extrait Deezer avec coupe éventuelle (mode difficile). */
export function PreviewAudio({
  src,
  questionId,
  maxSeconds = 30,
  figureClassName = 'quiz-play__media quiz-play__media--audio',
  audioClassName = 'quiz-play__audio',
  captionClassName = 'quiz-play__audio-caption',
}: PreviewAudioProps) {
  const ref = useRef<HTMLAudioElement>(null)
  const limit = Math.max(1, maxSeconds)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const clip = () => {
      if (el.currentTime >= limit) {
        el.pause()
        el.currentTime = 0
      }
    }

    el.addEventListener('timeupdate', clip)
    return () => el.removeEventListener('timeupdate', clip)
  }, [questionId, limit])

  return (
    <figure className={figureClassName}>
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
      <figcaption className={captionClassName}>
        Extrait Deezer (~{limit} s)
      </figcaption>
    </figure>
  )
}
