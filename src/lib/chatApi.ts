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
    names?: string[]
    people?: { name: string; self: boolean; profile?: boolean }[]
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

/** Ping présence site-wide → nombre + pseudos en ligne. */
export async function pingPresence(
  playerId: string,
  playerName?: string,
  hasProfile = false,
): Promise<{
  online: number
  names: string[]
  people: { name: string; self: boolean; profile: boolean }[]
}> {
  const data = await postChat({
    action: 'presence',
    playerId,
    playerName,
    hasProfile,
  })
  const people = Array.isArray(data.people)
    ? data.people.filter(
        (
          p,
        ): p is { name: string; self: boolean; profile?: boolean } =>
          Boolean(p) &&
          typeof p === 'object' &&
          typeof p.name === 'string' &&
          p.name.trim().length >= 2,
      )
    : []
  const names =
    people.length > 0
      ? people.map((p) => p.name)
      : Array.isArray(data.names)
        ? data.names.filter(
            (n): n is string => typeof n === 'string' && n.trim().length >= 2,
          )
        : []
  return {
    online: typeof data.online === 'number' ? data.online : names.length,
    names,
    people:
      people.length > 0
        ? people.map((p) => ({
            name: p.name.trim(),
            self: Boolean(p.self),
            profile: p.profile === true,
          }))
        : names.map((name) => ({ name, self: false, profile: false })),
  }
}

/** Admin : vide le chat pour tous. */
export async function clearChatAll(secret: string): Promise<number> {
  const data = await postChat({
    action: 'clearAll',
    secret,
  })
  return typeof data.clearedAt === 'number' ? data.clearedAt : Date.now()
}
