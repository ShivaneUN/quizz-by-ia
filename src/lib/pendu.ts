import type { Difficulty } from '../types/index.js'
import { drawPenduWords } from './penduWords.js'

export const MAX_STROKES = 9
export const SOLO_DUO_WORDS = 10
export const HINT_BUDGET = 4
export const HINT_ELIMINATE_COST = 1
export const HINT_REVEAL_COST = 2
export const HINT_ELIMINATE_COUNT = 3
export const BONUS_THRESHOLD = 2
export const BONUS_POINTS = 2
export const MULTI_MIN = 2
export const MULTI_MAX = 8

export const PENDU_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export const AZERTY_ROWS = [
  'AZERTYUIOP'.split(''),
  'QSDFGHJKLM'.split(''),
  'WXCVBN'.split(''),
] as const

export type PenduMode = 'solo' | 'duo' | 'multi'
export type PenduStatus = 'playing' | 'wordOver' | 'gameOver'
export type PenduWordResult = 'won' | 'lost' | null

export type PenduRound = {
  word: string
  unique: string[]
  revealed: string[]
  attempted: string[]
}

export type PenduPlayer = {
  id?: string
  name: string
  strokes: number
  points: number
  eliminated: boolean
  hintSpent: number
  /** Multi parallèle uniquement — état propre à ce joueur pour le mot courant */
  multiRound?: {
    guesses: string[]   // lettres proposées par CE joueur
    strokes: number     // erreurs de CE joueur
    revealed: string[]  // lettres trouvées par CE joueur
    status: 'playing' | 'won' | 'lost'
    wordScore: number
  }
}

export type PenduSeat = { id?: string; name: string }

export type PenduGame = {
  mode: PenduMode
  words: string[]
  wordIndex: number
  round: PenduRound
  strokes: number
  wordScore: number
  totalScore: number
  duoTurn: 0 | 1
  players: PenduPlayer[]
  multiTurn: number
  status: PenduStatus
  wordResult: PenduWordResult
  message: string | null
}

/** Mot affiché : A–Z + tirets (accents retirés). */
export function normalizePenduWord(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^A-Z-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Lettres seulement — saisie clavier / mot entier. */
export function penduLetters(raw: string): string {
  return normalizePenduWord(raw).replace(/-/g, '')
}

export function normalizePenduInput(raw: string): string {
  return penduLetters(raw)
}

export function makeRound(word: string): PenduRound {
  const w = normalizePenduWord(word)
  const unique = [...new Set(penduLetters(w).split(''))].filter(Boolean).sort()
  return { word: w, unique, revealed: [], attempted: [] }
}

export function unknownCount(round: PenduRound): number {
  return round.unique.length - round.revealed.length
}

export function isRoundComplete(round: PenduRound): boolean {
  return round.unique.every((l) => round.revealed.includes(l))
}

export function displaySlots(
  round: PenduRound,
): { letter: string; shown: boolean; hyphen: boolean }[] {
  return round.word.split('').map((letter) => {
    const hyphen = letter === '-'
    return {
      letter,
      hyphen,
      shown: hyphen || round.revealed.includes(letter),
    }
  })
}

export function letterKeyState(
  round: PenduRound,
  letter: string,
): 'idle' | 'good' | 'bad' {
  const L = letter.toUpperCase()
  if (!round.attempted.includes(L)) return 'idle'
  return round.unique.includes(L) ? 'good' : 'bad'
}

function revealAll(round: PenduRound): PenduRound {
  return { ...round, revealed: [...round.unique] }
}

function defaultPlayerName(i: number): string {
  return `Joueur ${i + 1}`
}

function asSeats(input: Array<string | PenduSeat>): PenduSeat[] {
  return input.map((x) => (typeof x === 'string' ? { name: x } : x))
}

function makePlayers(input: Array<string | PenduSeat>): PenduPlayer[] {
  const seats = asSeats(input)
  const n = Math.max(MULTI_MIN, Math.min(MULTI_MAX, seats.length))
  const slice = seats.slice(0, n)
  while (slice.length < n) slice.push({ name: '' })
  return slice.map((s, i) => ({
    id: s.id,
    name: s.name.trim() || defaultPlayerName(i),
    strokes: 0,
    points: 0,
    eliminated: false,
    hintSpent: 0,
  }))
}

function patchPlayer(
  players: PenduPlayer[],
  index: number,
  patch: Partial<PenduPlayer>,
): PenduPlayer[] {
  return players.map((p, i) => (i === index ? { ...p, ...patch } : p))
}

function emptyGame(mode: PenduMode, words: string[]): PenduGame {
  return {
    mode,
    words,
    wordIndex: 0,
    round: makeRound(words[0] ?? 'PENDU'),
    strokes: 0,
    wordScore: 0,
    totalScore: 0,
    duoTurn: 0,
    players: [],
    multiTurn: 0,
    status: 'playing',
    wordResult: null,
    message: null,
  }
}

export function createSoloGame(
  difficulty: Difficulty = 'medium',
  words?: string[],
): PenduGame {
  return emptyGame(
    'solo',
    words && words.length > 0
      ? words
      : drawPenduWords(SOLO_DUO_WORDS, difficulty),
  )
}

export function createDuoGame(
  seats?: Array<string | PenduSeat>,
  difficulty: Difficulty = 'medium',
  words?: string[],
): PenduGame {
  const g = emptyGame(
    'duo',
    words && words.length > 0
      ? words
      : drawPenduWords(SOLO_DUO_WORDS, difficulty),
  )
  if (seats && seats.length >= 2) {
    g.players = asSeats(seats)
      .slice(0, 2)
      .map((s, i) => ({
        id: s.id,
        name: s.name.trim() || defaultPlayerName(i),
        strokes: 0,
        points: 0,
        eliminated: false,
        hintSpent: 0,
      }))
  }
  return g
}

function makeMultiRound(_round: PenduRound): NonNullable<PenduPlayer['multiRound']> {
  return { guesses: [], strokes: 0, revealed: [], status: 'playing', wordScore: 0 }
}

export function createMultiGame(
  input: Array<string | PenduSeat>,
  difficulty: Difficulty = 'medium',
  words?: string[],
): PenduGame {
  const list =
    words && words.length > 0 ? words : drawPenduWords(SOLO_DUO_WORDS, difficulty)
  const round = makeRound(list[0] ?? 'PENDU')
  const base = emptyGame('multi', list)
  const players = makePlayers(input).map((p) => ({
    ...p,
    multiRound: makeMultiRound(round),
  }))
  return { ...base, players, multiTurn: 0 }
}

export function activeStrokes(game: PenduGame, playerId?: string): number {
  if (game.mode === 'multi') {
    if (playerId) {
      const p = game.players.find((pl) => pl.id === playerId)
      return p?.multiRound?.strokes ?? 0
    }
    const p = game.players[game.multiTurn]
    return p?.multiRound?.strokes ?? 0
  }
  return game.strokes
}

export function playerMultiRound(
  game: PenduGame,
  playerId: string,
): NonNullable<PenduPlayer['multiRound']> | null {
  if (game.mode !== 'multi') return null
  const p = game.players.find((pl) => pl.id === playerId)
  return p?.multiRound ?? null
}

/** Multi parallèle : toutes les lettres tentées par tous les joueurs (pour affichage commun du mot) */
export function multiSharedAttempted(game: PenduGame): string[] {
  if (game.mode !== 'multi') return game.round.attempted
  const all = new Set<string>()
  for (const p of game.players) {
    for (const l of p.multiRound?.guesses ?? []) all.add(l)
  }
  return [...all]
}

export function turnLabel(game: PenduGame): string | null {
  if (game.mode === 'duo') {
    const p = game.players[game.duoTurn]
    return p ? `Tour : ${p.name}` : `Tour : Joueur ${game.duoTurn + 1}`
  }
  // multi parallèle : pas de notion de tour
  return null
}

export function isPenduMyTurn(game: PenduGame, playerId: string): boolean {
  if (game.mode === 'multi') {
    // En multi parallèle chaque joueur joue dès que son status est 'playing'
    if (game.status === 'wordOver' || game.status === 'gameOver') return false
    const p = game.players.find((pl) => pl.id === playerId)
    return p?.multiRound?.status === 'playing'
  }
  if (game.status === 'wordOver') return true
  if (game.status !== 'playing') return false
  if (game.mode === 'duo') {
    const idx = game.players.findIndex((p) => p.id === playerId)
    return idx >= 0 && idx === game.duoTurn
  }
  return true
}

export function penduScoresByPlayerId(
  game: PenduGame,
): { id: string; score: number }[] {
  if (game.mode === 'duo') {
    return game.players
      .filter((p): p is PenduPlayer & { id: string } => Boolean(p.id))
      .map((p) => ({ id: p.id, score: game.totalScore }))
  }
  if (game.mode === 'multi') {
    return game.players
      .filter((p): p is PenduPlayer & { id: string } => Boolean(p.id))
      .map((p) => ({ id: p.id, score: p.points }))
  }
  return []
}

export function hintBudgetLeft(player: PenduPlayer): number {
  return Math.max(0, HINT_BUDGET - player.hintSpent)
}

export function rankedPlayers(game: PenduGame): PenduPlayer[] {
  return game.players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.points - a.p.points || a.i - b.i)
    .map(({ p }) => p)
}

export function canUseHintEliminate(_game: PenduGame): boolean {
  // Désactivé en multi parallèle
  return false
}

export function canUseHintReveal(_game: PenduGame): boolean {
  // Désactivé en multi parallèle
  return false
}

function flipDuo(game: PenduGame): 0 | 1 {
  if (game.mode !== 'duo') return game.duoTurn
  return game.duoTurn === 0 ? 1 : 0
}

function finishSoloDuoWord(
  game: PenduGame,
  round: PenduRound,
  wordScore: number,
  strokes: number,
  result: 'won' | 'lost',
  message: string,
): PenduGame {
  const totalScore = result === 'won' ? game.totalScore + wordScore : game.totalScore
  return {
    ...game,
    round: result === 'lost' ? revealAll(round) : round,
    wordScore: result === 'lost' ? 0 : wordScore,
    strokes,
    totalScore,
    status: 'wordOver',
    wordResult: result,
    message,
    duoTurn: flipDuo(game),
  }
}

function applySoloDuoLetter(game: PenduGame, L: string): PenduGame {
  const unknownBefore = unknownCount(game.round)
  const attempted = [...game.round.attempted, L]
  let round: PenduRound = { ...game.round, attempted }

  if (round.unique.includes(L)) {
    const revealed = round.revealed.includes(L)
      ? round.revealed
      : [...round.revealed, L]
    round = { ...round, revealed }
    let wordScore = game.wordScore + 1
    const complete = isRoundComplete(round)
    const bonus = complete && unknownBefore >= BONUS_THRESHOLD
    if (bonus) wordScore += BONUS_POINTS
    if (complete) {
      const msg = bonus
        ? `Mot trouvé ! +${wordScore} (dont +${BONUS_POINTS} bonus)`
        : `Mot trouvé ! +${wordScore}`
      return finishSoloDuoWord(game, round, wordScore, game.strokes, 'won', msg)
    }
    return {
      ...game,
      round,
      wordScore,
      duoTurn: flipDuo(game),
      message: null,
    }
  }

  const strokes = game.strokes + 1
  if (strokes >= MAX_STROKES) {
    return finishSoloDuoWord(
      game,
      round,
      0,
      strokes,
      'lost',
      'Pendu ! 0 point pour ce mot',
    )
  }
  return {
    ...game,
    round,
    strokes,
    duoTurn: flipDuo(game),
    message: null,
  }
}

function applySoloDuoWord(game: PenduGame, guess: string): PenduGame {
  const unknownBefore = unknownCount(game.round)
  if (guess === penduLetters(game.round.word)) {
    const round = revealAll(game.round)
    let wordScore = game.wordScore
    const bonus = unknownBefore >= BONUS_THRESHOLD
    if (bonus) wordScore += BONUS_POINTS
    const msg = bonus
      ? `Mot trouvé ! +${wordScore} (dont +${BONUS_POINTS} bonus)`
      : `Mot trouvé ! +${wordScore}`
    return finishSoloDuoWord(game, round, wordScore, game.strokes, 'won', msg)
  }

  const strokes = game.strokes + 1
  if (strokes >= MAX_STROKES) {
    return finishSoloDuoWord(
      game,
      game.round,
      0,
      strokes,
      'lost',
      'Pendu ! 0 point pour ce mot',
    )
  }
  return {
    ...game,
    strokes,
    duoTurn: flipDuo(game),
    message: 'Mot incorrect',
  }
}

/** Multi parallèle : combien de joueurs ont fini ce mot (won ou lost) */
function multiAllDone(players: PenduPlayer[]): boolean {
  return players.every((p) => {
    const s = p.multiRound?.status
    return s === 'won' || s === 'lost'
  })
}

/** Multi parallèle : qui a trouvé en premier (plus petit wordScore à la fin = premier) */
function multiFirstWinner(players: PenduPlayer[]): number {
  let best = -1
  let bestScore = -1
  for (let i = 0; i < players.length; i++) {
    const mr = players[i]!.multiRound
    if (mr?.status === 'won' && mr.wordScore > bestScore) {
      bestScore = mr.wordScore
      best = i
    }
  }
  return best
}

/** Avance au mot suivant en multi parallèle, remet les multiRound à zéro */
function advanceMultiWord(game: PenduGame): PenduGame {
  const nextIndex = game.wordIndex + 1
  if (nextIndex >= game.words.length) {
    return { ...game, status: 'gameOver', wordResult: null, message: null }
  }
  const nextRound = makeRound(game.words[nextIndex]!)
  const players = game.players.map((p) => ({
    ...p,
    multiRound: makeMultiRound(nextRound),
  }))
  return {
    ...game,
    wordIndex: nextIndex,
    round: nextRound,
    players,
    status: 'playing',
    wordResult: null,
    message: null,
  }
}

function applyMultiLetter(game: PenduGame, actorId: string, L: string): PenduGame {
  if (game.status !== 'playing') return game
  const actorIdx = game.players.findIndex((p) => p.id === actorId)
  if (actorIdx === -1) return game
  const p = game.players[actorIdx]!
  const mr = p.multiRound
  if (!mr || mr.status !== 'playing') return game
  if (mr.guesses.includes(L)) return game

  const guesses = [...mr.guesses, L]
  const isGood = game.round.unique.includes(L)

  if (isGood) {
    const revealed = mr.revealed.includes(L) ? mr.revealed : [...mr.revealed, L]
    const allLettersFound = game.round.unique.every((u) => revealed.includes(u))
    let wordScore = mr.wordScore + 1
    // Bonus si premier à trouver
    const bonus = allLettersFound && multiFirstWinner(game.players) === -1
    if (bonus) wordScore += BONUS_POINTS
    const status = allLettersFound ? 'won' : 'playing'
    const newMr = { ...mr, guesses, revealed, wordScore, status } as typeof mr
    const players = patchPlayer(game.players, actorIdx, {
      multiRound: newMr,
      points: p.points + (allLettersFound ? wordScore : 1),
    })
    const allDone = multiAllDone(players)
    const msg = allLettersFound
      ? bonus
        ? `${p.name} trouve le mot en premier ! +${BONUS_POINTS} bonus 🎉`
        : `${p.name} a trouvé le mot !`
      : null
    if (allDone) {
      return advanceMultiWord({ ...game, players, message: msg })
    }
    return { ...game, players, message: msg }
  }

  // Mauvaise lettre
  const strokes = mr.strokes + 1
  const lost = strokes >= MAX_STROKES
  const newMr = { ...mr, guesses, strokes, status: lost ? 'lost' : 'playing' } as typeof mr
  const players = patchPlayer(game.players, actorIdx, { multiRound: newMr })
  const allDone = multiAllDone(players)
  const msg = lost ? `${p.name} est pendu ! 💀` : null
  if (allDone) {
    return advanceMultiWord({ ...game, players, message: msg })
  }
  return { ...game, players, message: msg }
}

function applyMultiWord(game: PenduGame, actorId: string, guess: string): PenduGame {
  if (game.status !== 'playing') return game
  const actorIdx = game.players.findIndex((p) => p.id === actorId)
  if (actorIdx === -1) return game
  const p = game.players[actorIdx]!
  const mr = p.multiRound
  if (!mr || mr.status !== 'playing') return game

  if (guess === penduLetters(game.round.word)) {
    const bonus = multiFirstWinner(game.players) === -1
    const wordScore = mr.wordScore + (bonus ? BONUS_POINTS : 0)
    const newMr = { ...mr, revealed: [...game.round.unique], status: 'won', wordScore } as typeof mr
    const players = patchPlayer(game.players, actorIdx, {
      multiRound: newMr,
      points: p.points + wordScore,
    })
    const allDone = multiAllDone(players)
    const msg = bonus
      ? `${p.name} devine le mot en premier ! +${BONUS_POINTS} bonus 🎉`
      : `${p.name} a trouvé le mot !`
    if (allDone) return advanceMultiWord({ ...game, players, message: msg })
    return { ...game, players, message: msg }
  }

  // Mot faux : compte comme une erreur
  const strokes = mr.strokes + 1
  const lost = strokes >= MAX_STROKES
  const newMr = { ...mr, strokes, status: lost ? 'lost' : 'playing' } as typeof mr
  const players = patchPlayer(game.players, actorIdx, { multiRound: newMr })
  const allDone = multiAllDone(players)
  const msg = lost ? `${p.name} est pendu ! 💀` : `${p.name} : mot incorrect`
  if (allDone) return advanceMultiWord({ ...game, players, message: msg })
  return { ...game, players, message: msg }
}

/** actorId : requis en mode multi parallèle pour identifier le joueur */
export function guessLetter(game: PenduGame, letter: string, actorId?: string): PenduGame {
  if (game.status !== 'playing') return game
  const L = normalizePenduInput(letter)
  if (L.length !== 1) return game
  if (game.mode === 'multi') return applyMultiLetter(game, actorId ?? '', L)
  if (game.round.attempted.includes(L)) return game
  return applySoloDuoLetter(game, L)
}

export function guessWord(game: PenduGame, raw: string, actorId?: string): PenduGame {
  if (game.status !== 'playing') return game
  const guess = normalizePenduInput(raw)
  if (guess.length < 1) return game
  if (game.mode === 'multi') return applyMultiWord(game, actorId ?? '', guess)
  return applySoloDuoWord(game, guess)
}

export function useHintEliminate(game: PenduGame): PenduGame {
  return game // désactivé en multi parallèle
}

export function useHintReveal(game: PenduGame): PenduGame {
  return game // désactivé en multi parallèle
}

export function continuePendu(game: PenduGame): PenduGame {
  if (game.status === 'gameOver') return game
  // Multi parallèle : continuePendu ne sert plus (l'avancement est automatique)
  if (game.mode === 'multi') return game
  if (game.status !== 'wordOver') return game
  const nextIndex = game.wordIndex + 1
  if (nextIndex >= game.words.length) {
    return { ...game, status: 'gameOver', message: null }
  }
  return {
    ...game,
    wordIndex: nextIndex,
    round: makeRound(game.words[nextIndex]!),
    strokes: 0,
    wordScore: 0,
    status: 'playing',
    wordResult: null,
    message: null,
  }
}
