export type ChatChannel = 'global' | 'room'

export interface ChatMessage {
  id: string
  channel: ChatChannel
  roomCode?: string
  playerId: string
  playerName: string
  text: string
  at: number
}

async function postChat(body: Record<string, unknown>) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string' ? data.error : `Erreur (${res.status})`,
    )
  }
  return data as {
    messages?: ChatMessage[]
    message?: ChatMessage
    online?: number
    clearedAt?: number
    ok?: boolean
  }
}

export async function listChat(input: {
  channel: ChatChannel
  code?: string
  afterId?: string
}) {
  const data = await postChat({
    action: 'list',
    channel: input.channel,
    code: input.code,
    afterId: input.afterId,
  })
  return {
    messages: data.messages ?? [],
    clearedAt: typeof data.clearedAt === 'number' ? data.clearedAt : 0,
  }
}

export async function sendChat(input: {
  channel: ChatChannel
  code?: string
  playerId: string
  playerName: string
  text: string
}) {
  const data = await postChat({
    action: 'send',
    ...input,
  })
  return data.message!
}

/** Ping présence site-wide → nombre de personnes en ligne. */
export async function pingPresence(playerId: string): Promise<number> {
  const data = await postChat({
    action: 'presence',
    playerId,
  })
  return typeof data.online === 'number' ? data.online : 0
}

/** Admin : vide le chat pour tous. */
export async function clearChatAll(secret: string): Promise<number> {
  const data = await postChat({
    action: 'clearAll',
    secret,
  })
  return typeof data.clearedAt === 'number' ? data.clearedAt : Date.now()
}
