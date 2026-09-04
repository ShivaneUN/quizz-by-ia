export type MorpionMark = 'X' | 'O'
export type MorpionCell = MorpionMark | null
export type MorpionStatus = 'en_attente' | 'en_cours' | 'termine'
export type MorpionOutcome = MorpionMark | 'draw' | null

export interface MorpionPlayer {
  id: string
  name: string
  kind: 'humain' | 'ia'
  symbol: MorpionMark
  lastSeenAt: number
}

export interface MorpionRoom {
  code: string
  hostId: string
  status: MorpionStatus
  board: MorpionCell[]
  turn: MorpionMark
  winner: MorpionOutcome
  players: MorpionPlayer[]
  createdAt: number
  updatedAt: number
  joinable: boolean
  vsAi: boolean
  humanCount: number
  serverNow: number
  storage?: 'redis' | 'memory'
}

export interface MorpionSummary {
  code: string
  hostName: string
  status: MorpionStatus
  vsAi: boolean
  humanCount: number
  joinable: boolean
  turn: MorpionMark
  updatedAt: number
  opponentLabel: string
}

async function postMorpion(body: Record<string, unknown>) {
  const res = await fetch('/api/morpion', {
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
    room?: MorpionRoom
    playerId?: string
    left?: boolean
    closed?: boolean
    joinable?: MorpionSummary[]
    active?: MorpionSummary[]
  }
}

export async function createMorpionRoom(playerName: string) {
  const data = await postMorpion({ action: 'create', playerName })
  return { room: data.room!, playerId: data.playerId! }
}

export async function joinMorpionRoom(code: string, playerName: string) {
  const data = await postMorpion({ action: 'join', code, playerName })
  return { room: data.room!, playerId: data.playerId! }
}

export async function moveMorpionCell(input: {
  code: string
  playerId: string
  cell: number
}) {
  const data = await postMorpion({ action: 'move', ...input })
  return { room: data.room! }
}

export async function replayMorpionRoom(input: {
  code: string
  playerId: string
}) {
  const data = await postMorpion({ action: 'replay', ...input })
  return { room: data.room! }
}

export async function leaveMorpionRoom(input: {
  code: string
  playerId: string
}) {
  return postMorpion({ action: 'leave', ...input })
}

export async function pollMorpionRoom(code: string, playerId: string) {
  const data = await postMorpion({ action: 'state', code, playerId })
  return { room: data.room! }
}

export async function listMorpionRooms() {
  const data = await postMorpion({ action: 'list' })
  return {
    joinable: data.joinable ?? [],
    active: data.active ?? [],
  }
}
