/** Icônes SVG pour les pastilles de thème */

const stroke = 'currentColor'

export function ThemeIcon({ id }: { id: string }) {
  switch (id) {
    case 'histoire':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <path
            fill={stroke}
            d="M10 38h28v3H10zm4-3h4V14h-4zm8 0h4V10h-4zm8 0h4V18h-4zM14 14l4-6h4l-2 6h-6zm16 4 4-4h4l-2 4h-6z"
          />
        </svg>
      )
    case 'sport':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="14" fill="none" stroke={stroke} strokeWidth="3" />
          <path
            fill="none"
            stroke={stroke}
            strokeWidth="2.5"
            d="M24 10c4 4 6 8 6 14s-2 10-6 14c-4-4-6-8-6-14s2-10 6-14zM10 24h28"
          />
        </svg>
      )
    case 'musique':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <path
            fill={stroke}
            d="M34 8v20.2a6 6 0 1 1-3-5.2V14l-14 3v15.2a6 6 0 1 1-3-5.2V12.5L34 8z"
          />
        </svg>
      )
    case 'cinema':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <rect x="8" y="16" width="32" height="20" rx="3" fill="none" stroke={stroke} strokeWidth="3" />
          <path fill={stroke} d="M12 12h6l2 4h-6zm10 0h6l2 4h-6zm10 0h6l2 4h-6zM18 22h4v8h-4zm8 0h4v8h-4z" />
        </svg>
      )
    case 'geographie':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="14" fill="none" stroke={stroke} strokeWidth="3" />
          <ellipse cx="24" cy="24" rx="6" ry="14" fill="none" stroke={stroke} strokeWidth="2.5" />
          <path fill="none" stroke={stroke} strokeWidth="2.5" d="M10 24h28M12 17h24M12 31h24" />
        </svg>
      )
    case 'sciences':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <path
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            strokeLinecap="round"
            d="M20 8h8M24 8v10l10 16a6 6 0 0 1-5 9H19a6 6 0 0 1-5-9l10-16"
          />
          <circle cx="24" cy="34" r="2.5" fill={stroke} />
        </svg>
      )
    case 'tech':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <rect x="10" y="12" width="28" height="20" rx="2" fill="none" stroke={stroke} strokeWidth="3" />
          <path fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" d="M18 38h12M24 32v6" />
        </svg>
      )
    case 'nature':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <path
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            strokeLinecap="round"
            d="M24 38V22M24 22c-8 0-12-6-12-12 10 0 12 8 12 12 0-4 2-12 12-12 0 6-4 12-12 12z"
          />
        </svg>
      )
    case 'cuisine':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <path
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            strokeLinecap="round"
            d="M14 22c0-6 4-10 10-10s10 4 10 10M12 28h24v4a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8v-4z"
          />
          <path fill="none" stroke={stroke} strokeWidth="2.5" d="M18 12c0-2 2-4 6-4s6 2 6 4" />
        </svg>
      )
    case 'art':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <circle cx="18" cy="20" r="5" fill={stroke} opacity="0.9" />
          <circle cx="28" cy="16" r="4" fill={stroke} opacity="0.7" />
          <circle cx="30" cy="26" r="4.5" fill={stroke} opacity="0.8" />
          <path
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            strokeLinecap="round"
            d="M14 34c4-6 10-8 16-6l6 10"
          />
        </svg>
      )
    case 'mythologie':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <path
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            strokeLinejoin="round"
            d="M24 8 28 18h10l-8 6 3 10-9-6-9 6 3-10-8-6h10z"
          />
        </svg>
      )
    case 'litterature':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <path
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            d="M12 10h10a4 4 0 0 1 4 4v24a4 4 0 0 0-4-4H12V10zm24 0H26a4 4 0 0 0-4 4v24a4 4 0 0 1 4-4h10V10z"
          />
        </svg>
      )
    case 'animaux':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <circle cx="16" cy="16" r="4" fill={stroke} />
          <circle cx="32" cy="16" r="4" fill={stroke} />
          <circle cx="24" cy="26" r="10" fill="none" stroke={stroke} strokeWidth="3" />
          <circle cx="20" cy="24" r="1.5" fill={stroke} />
          <circle cx="28" cy="24" r="1.5" fill={stroke} />
          <path fill="none" stroke={stroke} strokeWidth="2" d="M21 29c2 2 4 2 6 0" />
        </svg>
      )
    case 'espace':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="8" fill="none" stroke={stroke} strokeWidth="3" />
          <ellipse cx="24" cy="24" rx="18" ry="7" fill="none" stroke={stroke} strokeWidth="2.5" transform="rotate(-20 24 24)" />
          <circle cx="36" cy="12" r="2" fill={stroke} />
        </svg>
      )
    case 'jeuxvideo':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <rect x="6" y="16" width="36" height="18" rx="6" fill="none" stroke={stroke} strokeWidth="3" />
          <path fill={stroke} d="M14 22h4v8h-4zm-2 2h8v4h-8zM30 23h3v3h-3zm5 4h3v3h-3z" />
        </svg>
      )
    case 'actualite':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <rect x="10" y="10" width="28" height="30" rx="2" fill="none" stroke={stroke} strokeWidth="3" />
          <path fill="none" stroke={stroke} strokeWidth="2.5" d="M16 18h16M16 24h16M16 30h10" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="10" fill={stroke} />
        </svg>
      )
  }
}
