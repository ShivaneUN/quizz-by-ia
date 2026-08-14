import { useEffect, useRef, useState } from 'react'
import {
  getLocalEstimateSec,
  resolveEstimateSec,
} from '../lib/genEtaStorage'

/** Fallback si aucun historique encore */
export const WAIT_ESTIMATE_SEC = { solo: 18, multi: 25 } as const

export function useGenEta(
  mode: 'solo' | 'multi',
  /** Override (ex. room.genEstimateSec en multi) */
  overrideSec?: number | null,
) {
  const initial =
    typeof overrideSec === 'number' && overrideSec >= 5
      ? overrideSec
      : getLocalEstimateSec(mode)
  const [etaSec, setEtaSec] = useState(initial)
  const endRef = useRef(Date.now() + initial * 1000)

  useEffect(() => {
    let cancelled = false
    const seed =
      typeof overrideSec === 'number' && overrideSec >= 5
        ? overrideSec
        : getLocalEstimateSec(mode)
    endRef.current = Date.now() + seed * 1000
    setEtaSec(seed)

    if (typeof overrideSec !== 'number' || overrideSec < 5) {
      void resolveEstimateSec(mode).then((sec) => {
        if (cancelled) return
        endRef.current = Date.now() + sec * 1000
        setEtaSec(sec)
      })
    }

    const id = window.setInterval(() => {
      setEtaSec(Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000)))
    }, 250)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [mode, overrideSec])

  return etaSec
}

export function GenEtaLabel({
  etaSec,
  className = 'wait-minis__eta',
}: {
  etaSec: number
  className?: string
}) {
  return (
    <p
      className={`${className}${etaSec === 0 ? ' is-late' : ''}`}
      aria-live="polite"
    >
      {etaSec > 0 ? (
        <>
          Temps estimé <span className="wait-minis__eta-num">≈ {etaSec}s</span>
        </>
      ) : (
        'Encore un instant…'
      )}
    </p>
  )
}
