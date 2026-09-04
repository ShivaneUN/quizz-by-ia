import { MAX_STROKES } from '../lib/pendu'

const WOOD = '#c4a06a'
const BODY = '#ff6b6b'
const BASE = '#9aadc4'

interface PenduGallowsProps {
  strokes: number
  className?: string
}

/** 1 erreur = 1 barre ou 1 membre. Base permanente. Bois 1–3, silhouette ensuite. */
export function PenduGallows({ strokes, className }: PenduGallowsProps) {
  const n = Math.max(0, Math.min(MAX_STROKES, Math.floor(strokes)))
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Pendu : ${n} erreur${n > 1 ? 's' : ''} sur ${MAX_STROKES}`}
    >
      <path
        d="M10 95 H50"
        fill="none"
        stroke={BASE}
        strokeWidth="4"
        strokeLinecap="round"
      />
      {n >= 1 && (
        <path
          d="M25 95 V10"
          fill="none"
          stroke={WOOD}
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}
      {n >= 2 && (
        <path
          d="M25 10 H65"
          fill="none"
          stroke={WOOD}
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}
      {n >= 3 && (
        <path
          d="M65 10 V22"
          fill="none"
          stroke={WOOD}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      )}
      {n >= 4 && (
        <circle
          cx="65"
          cy="30"
          r="8"
          fill="none"
          stroke={BODY}
          strokeWidth="3"
        />
      )}
      {n >= 5 && (
        <path
          d="M65 38 V62"
          fill="none"
          stroke={BODY}
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {n >= 6 && (
        <path
          d="M65 44 L54 54"
          fill="none"
          stroke={BODY}
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {n >= 7 && (
        <path
          d="M65 44 L76 54"
          fill="none"
          stroke={BODY}
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {n >= 8 && (
        <path
          d="M65 62 L55 78"
          fill="none"
          stroke={BODY}
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {n >= 9 && (
        <path
          d="M65 62 L75 78"
          fill="none"
          stroke={BODY}
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
