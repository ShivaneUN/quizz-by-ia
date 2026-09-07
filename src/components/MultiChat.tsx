import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  listChat,
  pingPresence,
  sendChat,
  type ChatChannel,
  type ChatMessage,
} from '../lib/chatApi'
import { saveDisplayName, useSharedDisplayName } from '../lib/displayName'
import { useLockedPseudo } from '../hooks/useProfile'
import './MultiChat.css'

const CHAT_LAYOUT_KEY = 'quizz:chatLayout'

const EMOJIS = [
  '😀',
  '😂',
  '🤣',
  '😊',
  '😍',
  '😎',
  '🤔',
  '😴',
  '😭',
  '😡',
  '👍',
  '👎',
  '👏',
  '🙌',
  '🔥',
  '💯',
  '🎉',
  '❤️',
  '💪',
  '👀',
  '🎯',
  '🏆',
  '⚡',
  '✨',
  '🎮',
  '🧠',
  '😅',
  '🫡',
  '💀',
  '🤝',
]

const DEFAULT_W = 328
const DEFAULT_H = 420
const MIN_W = 280
const MIN_H = 320
const MAX_W = 720
const MAX_H = 800

type ChatLayout = {
  x: number | null
  y: number | null
  w: number
  h: number
}

function loadLayout(): ChatLayout {
  try {
    const raw = localStorage.getItem(CHAT_LAYOUT_KEY)
    if (!raw) return { x: null, y: null, w: DEFAULT_W, h: DEFAULT_H }
    const p = JSON.parse(raw) as Partial<ChatLayout>
    return sanitizeLayout({
      x: typeof p.x === 'number' ? p.x : null,
      y: typeof p.y === 'number' ? p.y : null,
      w: typeof p.w === 'number' ? p.w : DEFAULT_W,
      h: typeof p.h === 'number' ? p.h : DEFAULT_H,
    })
  } catch {
    return { x: null, y: null, w: DEFAULT_W, h: DEFAULT_H }
  }
}

function saveLayout(layout: ChatLayout) {
  try {
    localStorage.setItem(CHAT_LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    /* ignore */
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function defaultCornerPos(w: number, h: number): { x: number; y: number } {
  return {
    x: Math.max(8, window.innerWidth - w - 16),
    y: Math.max(8, window.innerHeight - h - 24),
  }
}

function clampPos(x: number, y: number, w: number, h: number) {
  const maxX = Math.max(8, window.innerWidth - w - 8)
  const maxY = Math.max(8, window.innerHeight - h - 8)
  return {
    x: clamp(x, 8, maxX),
    y: clamp(y, 8, maxY),
  }
}

/** Remet le panneau dans le viewport (évite chat « invisible » hors écran). */
function sanitizeLayout(layout: ChatLayout): ChatLayout {
  if (typeof window === 'undefined') {
    return {
      x: layout.x,
      y: layout.y,
      w: clamp(layout.w, MIN_W, MAX_W),
      h: clamp(layout.h, MIN_H, MAX_H),
    }
  }
  const w = clamp(layout.w, MIN_W, Math.min(MAX_W, window.innerWidth - 16))
  const h = clamp(layout.h, MIN_H, Math.min(MAX_H, window.innerHeight - 16))
  if (layout.x == null || layout.y == null) {
    return { x: null, y: null, w, h }
  }
  const pos = clampPos(layout.x, layout.y, w, h)
  return { ...pos, w, h }
}

/** Clear local uniquement — clé par canal (+ salle). */
function clearStorageKey(channel: ChatChannel, roomCode?: string | null) {
  if (channel === 'room' && roomCode) {
    return `quizz:chatCleared:room:${roomCode.toUpperCase()}`
  }
  return 'quizz:chatCleared:global'
}

function loadClearedAt(channel: ChatChannel, roomCode?: string | null): number {
  try {
    const raw = localStorage.getItem(clearStorageKey(channel, roomCode))
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function saveClearedAt(
  channel: ChatChannel,
  roomCode: string | null | undefined,
  at: number,
) {
  try {
    localStorage.setItem(clearStorageKey(channel, roomCode), String(at))
  } catch {
    /* ignore */
  }
}

interface MultiChatProps {
  playerId: string
  preferredName?: string
  roomCode?: string | null
  roomChatEnabled?: boolean
  /** Masquer le bouton flottant (ex. barre dock accueil) */
  hideFab?: boolean
  /** Bouton Mini-jeux à côté du chat (pendant un quiz) */
  onMiniGames?: () => void
}

function IconPadFab() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17 4H7C4.24 4 2 6.24 2 9v6c0 2.76 2.24 5 5 5h10c2.76 0 5-2.24 5-5V9c0-2.76-2.24-5-5-5Zm-8.5 9.5H7v1.5H5.5V13.5H4V12h1.5V10.5H7V12h1.5v1.5Zm7.25.75a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm2.5-2.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 1 1 0 2.5Z"
      />
    </svg>
  )
}

function IconChatFab() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
      />
    </svg>
  )
}

/**
 * Chat site-wide : Général + Salle, déplaçable / redimensionnable, emoji.
 */
export function MultiChat({
  playerId,
  preferredName = '',
  roomCode = null,
  roomChatEnabled = false,
  hideFab = false,
  onMiniGames,
}: MultiChatProps) {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<ChatChannel>('global')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const lockedPseudo = useLockedPseudo()
  const {
    name: displayName,
    setName: setDisplayName,
    commit: commitName,
  } = useSharedDisplayName(lockedPseudo || preferredName)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const [online, setOnline] = useState(0)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [layout, setLayout] = useState<ChatLayout>(() => loadLayout())
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const lastIdRef = useRef<string | undefined>(undefined)
  const clearedAtRef = useRef(0)
  const openRef = useRef(open)
  const layoutRef = useRef(layout)
  openRef.current = open
  layoutRef.current = layout

  useEffect(() => {
    const locked = lockedPseudo?.trim() ?? ''
    if (locked.length >= 2) {
      setDisplayName(locked)
      saveDisplayName(locked)
      return
    }
    const pref = preferredName.trim()
    if (pref.length >= 2) {
      setDisplayName(pref)
      saveDisplayName(pref)
    }
  }, [lockedPseudo, preferredName, setDisplayName])

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    const tick = async () => {
      try {
        const n = await pingPresence(playerId)
        if (!cancelled) setOnline(n)
      } catch {
        /* ignore */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 12_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [playerId])

  useEffect(() => {
    let cancelled = false
    lastIdRef.current = undefined
    clearedAtRef.current = loadClearedAt(channel, roomCode)
    setMessages([])

    if (channel === 'room' && (!roomChatEnabled || !roomCode)) {
      return
    }

    const tick = async () => {
      try {
        const next = await listChat({
          channel,
          code: channel === 'room' ? roomCode ?? undefined : undefined,
          afterId: lastIdRef.current,
        })
        if (cancelled) return
        if (next.clearedAt > clearedAtRef.current) {
          clearedAtRef.current = next.clearedAt
          setMessages([])
          lastIdRef.current = undefined
        }
        if (next.messages.length === 0) return
        const floor = clearedAtRef.current
        const visible = next.messages.filter((m) => m.at > floor)
        setMessages((prev) => {
          if (!lastIdRef.current) return visible.slice(-80)
          const ids = new Set(prev.map((m) => m.id))
          const merged = [...prev]
          for (const m of visible) {
            if (!ids.has(m.id)) merged.push(m)
          }
          return merged.slice(-80)
        })
        lastIdRef.current =
          next.messages[next.messages.length - 1]?.id ?? lastIdRef.current
        if (!openRef.current) {
          const others = visible.filter((m) => m.playerId !== playerId).length
          if (others > 0) setUnread((u) => u + others)
        }
      } catch {
        /* ignore */
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), 1500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [channel, roomCode, roomChatEnabled, playerId])

  function clearChatForMe() {
    const at = Date.now()
    clearedAtRef.current = at
    saveClearedAt(channel, roomCode, at)
    setMessages([])
    setUnread(0)
    setError(null)
  }

  useEffect(() => {
    if (!open) return
    setUnread(0)
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [open, messages, channel])

  useEffect(() => {
    const onResize = () => {
      setLayout((prev) => {
        const next = sanitizeLayout(prev)
        if (
          next.x === prev.x &&
          next.y === prev.y &&
          next.w === prev.w &&
          next.h === prev.h
        ) {
          return prev
        }
        saveLayout(next)
        return next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function updateLayout(next: ChatLayout) {
    const clean = sanitizeLayout(next)
    setLayout(clean)
    saveLayout(clean)
  }

  function openChat() {
    const cur = sanitizeLayout(layoutRef.current)
    // Toujours ancrer dans le viewport à l’ouverture (PC / resize)
    if (cur.x == null || cur.y == null) {
      const corner = defaultCornerPos(cur.w, cur.h)
      updateLayout({ ...cur, ...corner })
    } else {
      updateLayout(cur)
    }
    setUnread(0)
    setOpen(true)
  }

  useEffect(() => {
    function onOpen() {
      openChat()
    }
    window.addEventListener('quizz:open-chat', onOpen)
    return () => window.removeEventListener('quizz:open-chat', onOpen)
  }, [])

  function onDragStart(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const rect = panelRef.current?.getBoundingClientRect()
    const cur = layoutRef.current
    const originX = cur.x ?? rect?.left ?? defaultCornerPos(cur.w, cur.h).x
    const originY = cur.y ?? rect?.top ?? defaultCornerPos(cur.w, cur.h).y

    const onMove = (ev: PointerEvent) => {
      const pos = clampPos(
        originX + (ev.clientX - startX),
        originY + (ev.clientY - startY),
        cur.w,
        cur.h,
      )
      updateLayout({ ...cur, ...pos })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onResizeStart(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const cur = layoutRef.current
    const originW = cur.w
    const originH = cur.h
    const originX = cur.x
    const originY = cur.y

    const onMove = (ev: PointerEvent) => {
      const w = clamp(originW + (ev.clientX - startX), MIN_W, MAX_W)
      const h = clamp(originH + (ev.clientY - startY), MIN_H, MAX_H)
      let x = originX
      let y = originY
      if (x != null && y != null) {
        const pos = clampPos(x, y, w, h)
        x = pos.x
        y = pos.y
      }
      updateLayout({ x, y, w, h })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function insertEmoji(emoji: string) {
    setText((prev) => {
      const next = (prev + emoji).slice(0, 200)
      return next
    })
    setEmojiOpen(false)
    queueMicrotask(() => inputRef.current?.focus())
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    const name = displayName.trim()
    if (!body || sending) return
    if (name.length < 2) {
      setError('Choisis un pseudo (2 caractères min.)')
      return
    }
    if (channel === 'room' && (!roomChatEnabled || !roomCode)) {
      setError('Rejoins une salle pour le chat salle')
      return
    }
    setSending(true)
    setError(null)
    setEmojiOpen(false)
    commitName(name)
    try {
      const msg = await sendChat({
        channel,
        code: channel === 'room' ? roomCode ?? undefined : undefined,
        playerId,
        playerName: name,
        text: body,
      })
      setText('')
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg].slice(-80)
      })
      lastIdRef.current = msg.id
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible')
    } finally {
      setSending(false)
    }
  }

  const panelStyle =
    open && layout.x != null && layout.y != null
      ? {
          left: layout.x,
          top: layout.y,
          right: 'auto' as const,
          bottom: 'auto' as const,
        }
      : undefined

  const ui = (
    <div
      className={`multi-chat${open ? ' is-open' : ''}`}
      style={panelStyle}
    >
      {!hideFab && (
        <div className="multi-chat__fabs">
          {onMiniGames && (
            <button
              type="button"
              className="multi-chat__fab"
              onClick={onMiniGames}
              aria-label="Mini-jeux"
              title="Mini-jeux"
            >
              <IconPadFab />
            </button>
          )}
          {!open && (
            <button
              type="button"
              className="multi-chat__fab"
              onClick={openChat}
              aria-label="Chat"
              title="Chat"
            >
              <IconChatFab />
              {unread > 0 && (
                <span className="multi-chat__badge">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {open && (
        <section
          ref={panelRef}
          className="multi-chat__panel"
          aria-label="Chat"
          style={{ width: layout.w, height: layout.h }}
        >
          <header
            className="multi-chat__head"
            onPointerDown={onDragStart}
            onDoubleClick={() => {
              const cur = layoutRef.current
              updateLayout({
                ...cur,
                ...defaultCornerPos(cur.w, cur.h),
              })
            }}
            title="Glisser pour déplacer · double-clic pour réinitialiser"
          >
            <div className="multi-chat__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={`multi-chat__tab${channel === 'global' ? ' is-on' : ''}`}
                aria-selected={channel === 'global'}
                onClick={() => setChannel('global')}
              >
                Général
              </button>
              <button
                type="button"
                role="tab"
                className={`multi-chat__tab${channel === 'room' ? ' is-on' : ''}`}
                aria-selected={channel === 'room'}
                title={
                  roomChatEnabled
                    ? 'Chat de ta salle'
                    : 'Disponible dans une salle multi'
                }
                onClick={() => setChannel('room')}
              >
                Salle
              </button>
            </div>
            <div className="multi-chat__head-actions">
              <button
                type="button"
                className="multi-chat__clear"
                onClick={clearChatForMe}
                title="Efface l’historique chez toi seulement"
                disabled={messages.length === 0}
              >
                Effacer
              </button>
              <button
                type="button"
                className="multi-chat__close"
                onClick={() => {
                  setEmojiOpen(false)
                  setOpen(false)
                }}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
          </header>

          <p className="multi-chat__online" aria-live="polite">
            <span className="multi-chat__online-dot" aria-hidden />
            {online > 0 ? `${online} en ligne` : '…'}
          </p>

          <label className="multi-chat__nick">
            <span className="visually-hidden">Pseudo chat</span>
            {lockedPseudo ? (
              <p className="multi-chat__nick-locked">{lockedPseudo}</p>
            ) : (
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 24))}
                onBlur={() => {
                  const n = displayName.trim()
                  if (n.length >= 2) commitName(n)
                }}
                placeholder="Ton pseudo…"
                maxLength={24}
                autoComplete="nickname"
              />
            )}
          </label>

          {!roomChatEnabled && (
            <p className="multi-chat__hint">
              Général = tout le site. Salle = uniquement si tu es en multi.
            </p>
          )}

          <div className="multi-chat__list" ref={listRef}>
            {channel === 'room' && !roomChatEnabled ? (
              <p className="multi-chat__empty">
                Rejoins une salle multi pour chatter ici
              </p>
            ) : messages.length === 0 ? (
              <p className="multi-chat__empty">Aucun message pour l’instant</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`multi-chat__msg${m.playerId === playerId ? ' is-me' : ''}`}
                >
                  <span className="multi-chat__name">{m.playerName}</span>
                  <span className="multi-chat__text">{m.text}</span>
                </div>
              ))
            )}
          </div>

          <div className="multi-chat__composer">
            {emojiOpen && (
              <div className="multi-chat__emoji-pop" role="listbox" aria-label="Émojis">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="multi-chat__emoji-btn"
                    onClick={() => insertEmoji(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
            <form
              className="multi-chat__form"
              onSubmit={(e) => void handleSend(e)}
            >
              <button
                type="button"
                className={`multi-chat__emoji-toggle${emojiOpen ? ' is-on' : ''}`}
                onClick={() => setEmojiOpen((v) => !v)}
                aria-label="Émojis"
                aria-expanded={emojiOpen}
                disabled={channel === 'room' && !roomChatEnabled}
              >
                😊
              </button>
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                placeholder={
                  channel === 'room'
                    ? 'Message à la salle…'
                    : 'Message général…'
                }
                disabled={sending || (channel === 'room' && !roomChatEnabled)}
                autoComplete="off"
              />
              <button
                type="submit"
                className="btn btn--primary multi-chat__send"
                disabled={
                  sending ||
                  !text.trim() ||
                  (channel === 'room' && !roomChatEnabled)
                }
              >
                OK
              </button>
            </form>
          </div>
          {error && (
            <p className="multi-chat__error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            className="multi-chat__resize"
            aria-label="Redimensionner le chat"
            title="Agrandir / réduire"
            onPointerDown={onResizeStart}
          />
        </section>
      )}
    </div>
  )

  if (typeof document === 'undefined') return ui
  return createPortal(ui, document.body)
}
