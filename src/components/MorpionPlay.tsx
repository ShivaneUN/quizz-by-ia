import type { MorpionRoom } from '../lib/morpionApi'
import './MorpionPlay.css'

interface MorpionPlayProps {
  room: MorpionRoom
  playerId: string
  busy?: boolean
  error?: string | null
  onMove: (cell: number) => void
  onReplay?: () => void
  onLeave: () => void
}

function statusLabel(room: MorpionRoom, playerId: string): string {
  const me = room.players.find((p) => p.id === playerId)
  if (room.status === 'termine') {
    if (room.winner === 'draw') return 'Match nul'
    if (me && room.winner === me.symbol) return 'Tu as gagné'
    return 'Tu as perdu'
  }
  const current = room.players.find((p) => p.symbol === room.turn)
  if (current?.id === playerId) return 'À toi de jouer'
  if (current?.kind === 'ia') return 'L’IA joue…'
  return `${current?.name ?? 'Adversaire'} joue…`
}

export function MorpionPlay({
  room,
  playerId,
  busy,
  error,
  onMove,
  onReplay,
  onLeave,
}: MorpionPlayProps) {
  const me = room.players.find((p) => p.id === playerId)
  const opponent = room.players.find((p) => p.id !== playerId)
  const myTurn =
    room.status !== 'termine' && Boolean(me) && room.turn === me?.symbol

  return (
    <section className="morpion-play">
      <p className="morpion-play__code">Salle {room.code}</p>
      <p className="morpion-play__vs">
        {me ? `${me.name} (${me.symbol})` : 'Toi'} vs{' '}
        {opponent
          ? `${opponent.name}${opponent.kind === 'ia' ? '' : ` (${opponent.symbol})`}`
          : '…'}
      </p>
      <p className="morpion-play__status" aria-live="polite">
        {statusLabel(room, playerId)}
      </p>

      <div className="morpion-play__board" role="grid" aria-label="Morpion">
        {Array.from({ length: 9 }, (_, i) => {
          const mark = room.board[i]
          const canPlay = myTurn && !busy && mark == null
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={`morpion-play__cell${mark === 'X' ? ' is-x' : ''}${mark === 'O' ? ' is-o' : ''}`}
              disabled={!canPlay}
              onClick={() => onMove(i)}
              aria-label={
                mark
                  ? `Case ${i + 1}, ${mark}`
                  : canPlay
                    ? `Jouer case ${i + 1}`
                    : `Case ${i + 1} vide`
              }
            >
              {mark ?? ''}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="morpion-play__error" role="alert">
          {error}
        </p>
      )}

      {room.status === 'termine' && onReplay && (
        <button
          type="button"
          className="btn btn--primary morpion-play__replay"
          onClick={onReplay}
          disabled={busy}
        >
          Rejouer
        </button>
      )}

      <button
        type="button"
        className="morpion-play__leave"
        onClick={onLeave}
        disabled={busy}
      >
        Quitter
      </button>
    </section>
  )
}
