import { useEffect, useRef, useState } from 'react'
import './FlappyWait.css'

interface FlappyWaitProps {
  onScoreChange?: (score: number) => void
}

type Pipe = { x: number; gapY: number; scored: boolean }

const W = 320
const H = 360
const BIRD_X = 72
const BIRD_R = 12
const PIPE_W = 46
const GAP = 118
const GRAVITY = 0.42
const FLAP = -6.8
const SPEED = 2.35
const PIPE_EVERY = 145

/**
 * Mini Flappy d’attente — canvas local, restart instantané.
 */
export function FlappyWait({ onScoreChange }: FlappyWaitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [alive, setAlive] = useState(true)
  const onScoreRef = useRef(onScoreChange)
  onScoreRef.current = onScoreChange

  const state = useRef({
    y: H / 2,
    vy: 0,
    pipes: [] as Pipe[],
    dist: 0,
    score: 0,
    best: 0,
    alive: true,
    deadAt: 0,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rawCtx = canvas.getContext('2d')
    if (!rawCtx) return
    const ctx: CanvasRenderingContext2D = rawCtx

    const s = state.current
    s.y = H / 2
    s.vy = 0
    s.pipes = [{ x: W + 40, gapY: H * 0.45, scored: false }]
    s.dist = 0
    s.score = 0
    s.alive = true

    let raf = 0
    let last = performance.now()

    function resetRun() {
      s.y = H / 2
      s.vy = 0
      s.pipes = [{ x: W + 20, gapY: 80 + Math.random() * (H - 160), scored: false }]
      s.dist = 0
      s.score = 0
      s.alive = true
      s.deadAt = 0
      setAlive(true)
      setScore(0)
    }

    function flap() {
      if (!s.alive) {
        if (performance.now() - s.deadAt > 280) resetRun()
        return
      }
      s.vy = FLAP
    }

    function onPointer(e: Event) {
      e.preventDefault()
      flap()
    }

    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        flap()
      }
    }

    canvas.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)

    function tick(now: number) {
      const dt = Math.min(32, now - last) / 16.67
      last = now

      if (s.alive) {
        s.vy += GRAVITY * dt
        s.y += s.vy * dt
        s.dist += SPEED * dt

        for (const p of s.pipes) p.x -= SPEED * dt
        s.pipes = s.pipes.filter((p) => p.x + PIPE_W > -10)

        const lastPipe = s.pipes[s.pipes.length - 1]
        if (!lastPipe || lastPipe.x < W - PIPE_EVERY) {
          s.pipes.push({
            x: W + 10,
            gapY: 70 + Math.random() * (H - 140),
            scored: false,
          })
        }

        // collisions
        if (s.y - BIRD_R < 0 || s.y + BIRD_R > H) {
          s.alive = false
          s.deadAt = now
          setAlive(false)
        } else {
          for (const p of s.pipes) {
            const inX =
              BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W
            if (!inX) continue
            const top = p.gapY - GAP / 2
            const bot = p.gapY + GAP / 2
            if (s.y - BIRD_R < top || s.y + BIRD_R > bot) {
              s.alive = false
              s.deadAt = now
              setAlive(false)
              break
            }
            if (!p.scored && p.x + PIPE_W < BIRD_X) {
              p.scored = true
              s.score += 1
              if (s.score > s.best) {
                s.best = s.score
                setBest(s.best)
                onScoreRef.current?.(s.best)
              }
              setScore(s.score)
            }
          }
        }
      }

      // draw
      ctx.clearRect(0, 0, W, H)
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#1a3a6e')
      sky.addColorStop(1, '#0a1835')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // ground strip
      ctx.fillStyle = '#f0c14b'
      ctx.fillRect(0, H - 6, W, 6)

      for (const p of s.pipes) {
        const topH = p.gapY - GAP / 2
        const botY = p.gapY + GAP / 2
        ctx.fillStyle = '#2ec4a8'
        ctx.fillRect(p.x, 0, PIPE_W, topH)
        ctx.fillRect(p.x, botY, PIPE_W, H - botY - 6)
        ctx.fillStyle = '#1a9e86'
        ctx.fillRect(p.x - 2, topH - 12, PIPE_W + 4, 12)
        ctx.fillRect(p.x - 2, botY, PIPE_W + 4, 12)
      }

      // bird
      ctx.save()
      ctx.translate(BIRD_X, s.y)
      ctx.rotate(Math.min(0.7, Math.max(-0.5, s.vy * 0.06)))
      ctx.fillStyle = '#f0c14b'
      ctx.beginPath()
      ctx.ellipse(0, 0, BIRD_R + 2, BIRD_R, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(4, -3, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#041022'
      ctx.beginPath()
      ctx.arc(5, -3, 1.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ff7a45'
      ctx.beginPath()
      ctx.moveTo(BIRD_R - 2, 0)
      ctx.lineTo(BIRD_R + 8, 2)
      ctx.lineTo(BIRD_R - 2, 5)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

      if (!s.alive) {
        ctx.fillStyle = 'rgba(4,16,34,0.45)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#fff'
        ctx.font = '700 18px system-ui,sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Tap pour rejouer', W / 2, H / 2)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
      onScoreRef.current?.(state.current.best)
    }
  }, [])

  return (
    <div className="flappy-wait">
      <div className="flappy-wait__scores" aria-live="polite">
        <div className="flappy-wait__score">
          <span className="flappy-wait__score-label">Run</span>
          <span className="flappy-wait__score-value">{score}</span>
        </div>
        <div className="flappy-wait__score">
          <span className="flappy-wait__score-label">Best</span>
          <span className="flappy-wait__score-value">{best}</span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="flappy-wait__canvas"
        width={W}
        height={H}
        role="img"
        aria-label="Flappy — tape ou espace pour voler"
      />
      <p className="flappy-wait__hint">
        {alive ? 'Tap / Espace pour battre des ailes' : 'Tap pour une nouvelle run'}
      </p>
    </div>
  )
}
