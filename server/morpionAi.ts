/**
 * IA morpion — heuristique pure (gagner / bloquer / centre / coin / bord).
 * Aucune I/O : testable sans Redis ni HTTP.
 */

export type MorpionMark = 'X' | 'O'
export type MorpionCell = MorpionMark | null
export type MorpionOutcome = MorpionMark | 'draw' | null

export const WIN_LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

const CENTER = 4
const CORNERS = [0, 2, 6, 8] as const
const EDGES = [1, 3, 5, 7] as const

export function emptyBoard(): MorpionCell[] {
  return [null, null, null, null, null, null, null, null, null]
}

export function opponentOf(mark: MorpionMark): MorpionMark {
  return mark === 'X' ? 'O' : 'X'
}

export function emptyCells(board: readonly MorpionCell[]): number[] {
  const out: number[] = []
  for (let i = 0; i < 9; i++) {
    if (board[i] == null) out.push(i)
  }
  return out
}

/** null = en cours ; 'draw' = grille pleine sans gagnant. */
export function winnerOf(board: readonly MorpionCell[]): MorpionOutcome {
  for (const [a, b, c] of WIN_LINES) {
    const mark = board[a]
    if (mark && mark === board[b] && mark === board[c]) return mark
  }
  if (emptyCells(board).length === 0) return 'draw'
  return null
}

function withMove(
  board: readonly MorpionCell[],
  cell: number,
  mark: MorpionMark,
): MorpionCell[] {
  const next = board.slice()
  next[cell] = mark
  return next
}

/**
 * Choisit une case 0..8, ou null si plus de coup.
 * Ordre : gagner, bloquer, centre, premier coin libre, premier bord libre.
 */
export function pickAiMove(
  board: readonly MorpionCell[],
  ai: MorpionMark,
): number | null {
  const free = emptyCells(board)
  if (free.length === 0) return null

  const opp = opponentOf(ai)

  for (const cell of free) {
    if (winnerOf(withMove(board, cell, ai)) === ai) return cell
  }
  for (const cell of free) {
    if (winnerOf(withMove(board, cell, opp)) === opp) return cell
  }
  if (board[CENTER] == null) return CENTER
  for (const cell of CORNERS) {
    if (board[cell] == null) return cell
  }
  for (const cell of EDGES) {
    if (board[cell] == null) return cell
  }
  return free[0] ?? null
}
