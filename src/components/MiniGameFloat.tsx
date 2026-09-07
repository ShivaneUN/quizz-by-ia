import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { recordArcadeBest } from '../lib/arcadeStorage'
import { loadDisplayName } from '../lib/displayName'
import {
  leaveMorpionRoom,
  moveMorpionCell,
  pollMorpionRoom,
  replayMorpionRoom,
} from '../lib/morpionApi'
import { FlappyWait } from './FlappyWait'
import { MorpionLobby, type MorpionEnterPayload } from './MorpionLobby'
import { MorpionPlay } from './MorpionPlay'
import { TypingDuel } from './TypingDuel'
import type { WaitGameId } from './WaitMiniGames'
import './MiniGameFloat.css'

const TITLES: Record<WaitGameId, string> = {
  typing: 'Duel de frappe',
  flappy: 'Flappy',
  morpion: 'Morpion',
}

function DraggableWindow({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const winRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{
    ox: number
    oy: number
    px: number
    py: number
  } | null>(null)

  function clamp(x: number, y: number) {
    const el = winRef.current
    const w = el?.offsetWidth ?? 320
    const maxX = Math.max(8, window.innerWidth - w - 8)
    const maxY = Math.max(8, window.innerHeight - 56)
    return {
      x: Math.min(maxX, Math.max(8, x)),
      y: Math.min(maxY, Math.max(8, y)),
    }
  }

  function onHeaderDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return
    const rect = winRef.current?.getBoundingClientRect()
    if (!rect) return
    const start = { x: rect.left, y: rect.top }
    setPos(start)
    drag.current = {
      ox: start.x,
      oy: start.y,
      px: e.clientX,
      py: e.clientY,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onHeaderMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    setPos(
      clamp(
        drag.current.ox + (e.clientX - drag.current.px),
        drag.current.oy + (e.clientY - drag.current.py),
      ),
    )
  }

  function onHeaderUp() {
    drag.current = null
  }

  return createPortal(
    <div
      ref={winRef}
      className="qz-float"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={
        pos
          ? { left: pos.x, top: pos.y, transform: 'none' }
          : undefined
      }
    >
      <div
        className="qz-float__bar"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        onPointerCancel={onHeaderUp}
      >
        <span className="qz-float__title">{title}</span>
        <button type="button" className="qz-float__close" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="qz-float__body">{children}</div>
    </div>,
    document.body,
  )
}

export function MiniGameFloat({
  game,
  onClose,
}: {
  game: WaitGameId
  onClose: () => void
}) {
  const [seat, setSeat] = useState<MorpionEnterPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seatRef = useRef(seat)
  seatRef.current = seat

  useEffect(() => {
    if (!seat) return
    let cancelled = false
    const tick = async () => {
      try {
        const { room } = await pollMorpionRoom(seat.room.code, seat.playerId)
        if (cancelled) return
        if (!room.players.some((p) => p.id === seat.playerId)) {
          setSeat(null)
          return
        }
        setSeat((prev) =>
          prev
            ? {
                ...prev,
                room:
                  (room.updatedAt ?? 0) >= (prev.room.updatedAt ?? 0)
                    ? room
                    : prev.room,
              }
            : prev,
        )
      } catch {
        /* poll best-effort */
      }
    }
    const id = window.setInterval(() => void tick(), 500)
    void tick()
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [seat?.room.code, seat?.playerId])

  async function abandon() {
    const cur = seatRef.current
    if (!cur) return
    try {
      await leaveMorpionRoom({
        code: cur.room.code,
        playerId: cur.playerId,
      })
    } catch {
      /* déjà fermée */
    }
    setSeat(null)
  }

  function handleClose() {
    void abandon()
    onClose()
  }

  return (
    <DraggableWindow title={TITLES[game]} onClose={handleClose}>
      {game === 'typing' && (
        <TypingDuel
          embedded
          mode="solo"
          onScoreChange={(s) => recordArcadeBest('typing', s)}
        />
      )}
      {game === 'flappy' && (
        <FlappyWait onScoreChange={(s) => recordArcadeBest('flappy', s)} />
      )}
      {game === 'morpion' &&
        (seat ? (
          <MorpionPlay
            room={seat.room}
            playerId={seat.playerId}
            busy={busy}
            error={error}
            onMove={(cell) => {
              void (async () => {
                setBusy(true)
                setError(null)
                try {
                  const { room } = await moveMorpionCell({
                    code: seat.room.code,
                    playerId: seat.playerId,
                    cell,
                  })
                  setSeat((prev) => (prev ? { ...prev, room } : prev))
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Erreur')
                } finally {
                  setBusy(false)
                }
              })()
            }}
            onReplay={() => {
              void (async () => {
                setBusy(true)
                setError(null)
                try {
                  const { room } = await replayMorpionRoom({
                    code: seat.room.code,
                    playerId: seat.playerId,
                  })
                  setSeat((prev) => (prev ? { ...prev, room } : prev))
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Erreur')
                } finally {
                  setBusy(false)
                }
              })()
            }}
            onLeave={() => void abandon()}
          />
        ) : (
          <MorpionLobby
            onEnter={(payload) => {
              setError(null)
              setSeat(payload)
            }}
            defaultName={loadDisplayName()}
          />
        ))}
    </DraggableWindow>
  )
}
