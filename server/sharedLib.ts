/**
 * Code partagé src/lib — autosuffisant pour les serverless Vercel.
 * Ne contient pas d'imports vers src/lib/*.ts pour éviter les erreurs ESM.
 */

// ── shuffle ───────────────────────────────────────────────────────────────

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = arr[i]!
    arr[i] = arr[j]!
    arr[j] = a
  }
  return arr
}

export function shuffle<T>(arr: readonly T[]): T[] {
  return shuffleInPlace(arr.slice())
}

// ── penduWords ────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'

const PENDU_WORDS = [
  'AIGLE','ALBUM','ALGUE','ALPES','ANANAS','ANCRE','ANGLE','ANIMAL','ARBRE','ARCADE',
  'ARGENT','ARMOIRE','ASSIETTE','ATOME','AVION','AVOCAT','BAGUETTE','BALEINE','BANANE','BANQUE',
  'BATEAU','BATTERIE','BISCUIT','BOISSON','BONHEUR','BOUCLIER','BOULANGER','BOUSSOLE','BRESIL','BRETAGNE',
  'BROSSE','CABANE','CADEAU','CAHIER','CAMERA','CAMION','CANARD','CANOE','CANYON','CAPTAIN',
  'CARGO','CAROTTE','CASCADE','CHAMPION','CHANSON','CHAPEAU','CHATEAU','CHAUSSURE','CHEMIN','CHEVAL',
  'CHIEN','CHOCOLAT','CINEMA','CITRON','CLAVIER','CLOWN','COFFRE','COLLINE','COMETE','COURAGE',
  'COURSE','COUTEAU','CRAYON','CROISSANT','CUILLERE','CUISINE','CYCLONE','DANSE','DAUPHIN','DEFI',
  'DESERT','DIAMANT','DOMAINE','DRAGON','DRAPEAU','ECLAIR','ECRAN','ELEPHANT','ENERGIE','ENIGME',
  'EQUIPE','ESCALIER','ESPACE','ESPAGNE','ETOILE','FALAISE','FAMILLE','FARINE','FAUCON','FENETRE',
  'FUSION','FUSEE','GALAXIE','GARAGE','GATEAU','GEANT','GIRAFE','GLACIER','GRAVITE','GRENOUILLE',
  'GUITARE','HASARD','HIBOU','HISTOIRE','HORLOGE','HOTEL','HUILE','IGLOO','IMAGE','JARDIN',
  'JUNGLE','KANGOUROU','KARATE','KOALA','LAMPE','LANGUE','LAPIN','LASER','LEGUME','LIBRAIRIE',
  'LIVRE','LOGIQUE','LONDON','LUMIERE','MAGIE','MAISON','MANGUE','MARATHON','MARCHE','MARIN',
  'MEDAILLE','MEDECIN','MEMOIRE','MIROIR','MOLECULE','MONTAGNE','MOTEUR','MOUTON','MUSEE','MUSIQUE',
  'NATATION','NAVIRE','NUAGE','OCEAN','OISEAU','OPERA','ORAGE','ORANGE','ORDINATEUR','OURSIN',
  'PANDA','PAPILLON','PARFUM','PECHEUR','PERROQUET','PHARE','PIANO','PILOTE','PIRATE','PIZZA',
  'PLAGE','PLANETE','POESIE','POIVRON','POMPIER','PONTON','PORTAIL','POULET','PRINCESSE','PROFESSEUR',
  'QUESTION','QUIZZ','RADIO','RAISIN','RAPIDE','RENARD','REQUIN','RIVIERE','ROBOT','ROCHER',
  'RUGBY','SALADE','SATELLITE','SAVANE','SCULPTURE','SERPENT','SOLEIL','SOURIS','SPORT','STATUE',
  'STRATEGIE','SUCRE','TABLEAU','TAMBOUR','TAPIS','TEMPETE','TENNIS','THEATRE','TIGRE','TOMATE',
  'TONNERRE','TORTUE','TRAIN','TROPHEE','TUNNEL','VAGUE','VACHE','VALISE','VANILLE','VICTOIRE',
  'VILLAGE','VIOLON','VOITURE','VOLCAN','VOYAGE','ZEBRE',
] as const

const PENDU_COMPOUNDS = [
  'ABAT-JOUR','APRES-MIDI','ARC-EN-CIEL','ARRIERE-PLAN','AUTO-ECOLE','AVANT-BRAS','AVANT-GARDE',
  'AVANT-HIER','BAIN-MARIE','BEAU-FRERE','BEAU-PERE','BELLE-MERE','BIEN-ETRE','BRISE-GLACE',
  'CACHE-CACHE','CACHE-NEZ','CHASSE-NEIGE','CHAUFFE-EAU','CHAUVE-SOURIS','CHIEN-LOUP',
  'CONTRE-JOUR','CONTRE-SENS','COUPE-VENT','CROC-EN-JAMBE','DEMI-LUNE','DEMI-TOUR','EAU-DE-VIE',
  'ESSUIE-GLACE','FACE-A-FACE','FER-A-CHEVAL','GARDE-BOUE','GARDE-FOU','GARDE-ROBE',
  'GRAND-MERE','GRAND-PERE','GRATTE-CIEL','GRILLE-PAIN','HAUT-DE-FORME','HAUT-PARLEUR',
  'HORS-LA-LOI','HORS-PISTE','LAVE-LINGE','LAVE-VAISSELLE','LIEU-DIT','MI-TEMPS',
  'MILLE-FEUILLE','MILLE-PATTES','OUVRE-BOITE','PARE-BRISE','PARE-CHOCS','PASSE-TEMPS',
  'PETIT-FILS','POISSON-CHAT','PORTE-AVIONS','PORTE-CLES','PORTE-DRAPEAU','PORTE-FEUILLE',
  'PORTE-MANTEAU','PORTE-MONNAIE','PORTE-PAROLE','POT-AU-FEU','PRET-A-PORTER',
  'QUEUE-DE-CHEVAL','QUEUE-DE-PIE','QUATRE-VINGTS','REQUIN-MARTEAU','REVEIL-MATIN',
  'ROUGE-GORGE','SANG-FROID','SANS-ABRI','SAVOIR-FAIRE','SERRE-TETE','SOUS-MARIN',
  'SOUS-SOL','SOUS-TITRE','TETE-A-TETE','TIRE-BOUCHON','TOURNE-DISQUE','TOURNE-VIS',
  'VA-ET-VIENT','VICE-PRESIDENT','VIS-A-VIS','VOL-AU-VENT','WEEK-END',
] as const

const MIN_LEN = 5
const MAX_LEN = 12
const EASY_MAX_LEN = 6
const HARD_MIN_LEN = 8
const COMPOUND_MAX_LETTERS = 16

function isHangmanSimple(w: string): boolean {
  return w.length >= MIN_LEN && w.length <= MAX_LEN && /^[A-Z]+$/.test(w)
}

function isHangmanCompound(w: string): boolean {
  if (!w.includes('-')) return false
  const parts = w.split('-')
  if (parts.length < 2 || parts.some((p) => !/^[A-Z]+$/.test(p))) return false
  const letters = w.replace(/-/g, '')
  return letters.length >= MIN_LEN && letters.length <= COMPOUND_MAX_LETTERS
}

const SIMPLE = [...new Set((PENDU_WORDS as readonly string[]).filter(isHangmanSimple))]
const COMPOUNDS = [...new Set((PENDU_COMPOUNDS as readonly string[]).filter(isHangmanCompound))]
const EASY = SIMPLE.filter((w) => w.length <= EASY_MAX_LEN)
const LONG = SIMPLE.filter((w) => w.length >= HARD_MIN_LEN)
const HARD = [...new Set([...LONG, ...COMPOUNDS])]

export function canonPenduWord(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^A-Z-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function matchesPenduDifficulty(raw: string, difficulty: Difficulty): boolean {
  const w = canonPenduWord(raw)
  if (!w) return false
  if (difficulty === 'easy') return isHangmanSimple(w) && w.length <= EASY_MAX_LEN
  if (difficulty === 'hard') return isHangmanCompound(w) || (isHangmanSimple(w) && w.length >= HARD_MIN_LEN)
  return isHangmanSimple(w)
}

export function penduStaticPool(difficulty: Difficulty = 'medium'): string[] {
  if (difficulty === 'easy') return EASY.length >= 10 ? EASY : SIMPLE
  if (difficulty === 'hard') return HARD.length >= 10 ? HARD : SIMPLE
  return SIMPLE
}

function remainingPenduPool(difficulty: Difficulty, exclude: readonly string[] = []): string[] {
  const blocked = new Set(exclude.map(canonPenduWord).filter(Boolean))
  return penduStaticPool(difficulty).filter((w) => !blocked.has(canonPenduWord(w)))
}

export function parsePenduWordSource(raw: unknown): 'bank' | 'ai' {
  return raw === 'ai' ? 'ai' : 'bank'
}

export function recyclePenduWords(n: number, difficulty: Difficulty, keep: readonly string[] = []): string[] {
  const held = [...new Set(keep.map(canonPenduWord).filter(Boolean))].slice(0, Math.max(0, n))
  if (held.length >= n) return held
  return [...held, ...drawPenduWords(n - held.length, difficulty, held)]
}

export function drawPenduWords(n: number, difficulty: Difficulty = 'medium', exclude: readonly string[] = []): string[] {
  const pool = remainingPenduPool(difficulty, exclude)
  const count = Math.max(0, Math.min(n, pool.length))
  return shuffle(pool).slice(0, count)
}

export function drawPenduWord(exclude: readonly string[] = [], difficulty: Difficulty = 'medium'): string {
  const pool = remainingPenduPool(difficulty, exclude)
  const list = pool.length > 0 ? pool : penduStaticPool(difficulty)
  return list[Math.floor(Math.random() * list.length)]!
}

// ── pendu (logique de jeu) ────────────────────────────────────────────────

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
  multiRound?: {
    guesses: string[]
    strokes: number
    revealed: string[]
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

function normalizePenduWord(raw: string): string {
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/['\u2019]/g, '').replace(/[^A-Z-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function penduLetters(raw: string): string {
  return normalizePenduWord(raw).replace(/-/g, '')
}

function normalizePenduInput(raw: string): string {
  return penduLetters(raw)
}

function makeRound(word: string): PenduRound {
  const w = normalizePenduWord(word)
  const unique = [...new Set(penduLetters(w).split(''))].filter(Boolean).sort()
  return { word: w, unique, revealed: [], attempted: [] }
}

function isRoundComplete(round: PenduRound): boolean {
  return round.unique.every((l) => round.revealed.includes(l))
}

function unknownCount(round: PenduRound): number {
  return round.unique.length - round.revealed.length
}

function revealAll(round: PenduRound): PenduRound {
  return { ...round, revealed: [...round.unique] }
}

function defaultPlayerName(i: number): string { return `Joueur ${i + 1}` }

function asSeats(input: Array<string | PenduSeat>): PenduSeat[] {
  return input.map((x) => (typeof x === 'string' ? { name: x } : x))
}

function makePlayers(input: Array<string | PenduSeat>): PenduPlayer[] {
  const seats = asSeats(input)
  const n = Math.max(MULTI_MIN, Math.min(MULTI_MAX, seats.length))
  const slice = seats.slice(0, n)
  while (slice.length < n) slice.push({ name: '' })
  return slice.map((s, i) => ({
    id: s.id, name: s.name.trim() || defaultPlayerName(i),
    strokes: 0, points: 0, eliminated: false, hintSpent: 0,
  }))
}

function patchPlayer(players: PenduPlayer[], index: number, patch: Partial<PenduPlayer>): PenduPlayer[] {
  return players.map((p, i) => (i === index ? { ...p, ...patch } : p))
}

function emptyGame(mode: PenduMode, words: string[]): PenduGame {
  return {
    mode, words, wordIndex: 0, round: makeRound(words[0] ?? 'PENDU'),
    strokes: 0, wordScore: 0, totalScore: 0, duoTurn: 0, players: [],
    multiTurn: 0, status: 'playing', wordResult: null, message: null,
  }
}

function makeMultiRound(_round: PenduRound): NonNullable<PenduPlayer['multiRound']> {
  return { guesses: [], strokes: 0, revealed: [], status: 'playing', wordScore: 0 }
}

export function createSoloGame(difficulty: Difficulty = 'medium', words?: string[]): PenduGame {
  return emptyGame('solo', words && words.length > 0 ? words : drawPenduWords(SOLO_DUO_WORDS, difficulty))
}

export function createDuoGame(seats?: Array<string | PenduSeat>, difficulty: Difficulty = 'medium', words?: string[]): PenduGame {
  const g = emptyGame('duo', words && words.length > 0 ? words : drawPenduWords(SOLO_DUO_WORDS, difficulty))
  if (seats && seats.length >= 2) {
    g.players = asSeats(seats).slice(0, 2).map((s, i) => ({
      id: s.id, name: s.name.trim() || defaultPlayerName(i),
      strokes: 0, points: 0, eliminated: false, hintSpent: 0,
    }))
  }
  return g
}

export function createMultiGame(input: Array<string | PenduSeat>, difficulty: Difficulty = 'medium', words?: string[]): PenduGame {
  const list = words && words.length > 0 ? words : drawPenduWords(SOLO_DUO_WORDS, difficulty)
  const round = makeRound(list[0] ?? 'PENDU')
  const base = emptyGame('multi', list)
  const players = makePlayers(input).map((p) => ({ ...p, multiRound: makeMultiRound(round) }))
  return { ...base, players, multiTurn: 0 }
}

export function isPenduMyTurn(game: PenduGame, playerId: string): boolean {
  if (game.mode === 'multi') {
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

export function penduScoresByPlayerId(game: PenduGame): { id: string; score: number }[] {
  if (game.mode === 'duo') {
    return game.players.filter((p): p is PenduPlayer & { id: string } => Boolean(p.id))
      .map((p) => ({ id: p.id, score: game.totalScore }))
  }
  if (game.mode === 'multi') {
    return game.players.filter((p): p is PenduPlayer & { id: string } => Boolean(p.id))
      .map((p) => ({ id: p.id, score: p.points }))
  }
  return []
}

export function rankedPlayers(game: PenduGame): PenduPlayer[] {
  return game.players.map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.points - a.p.points || a.i - b.i).map(({ p }) => p)
}

export function useHintEliminate(game: PenduGame): PenduGame { return game }
export function useHintReveal(game: PenduGame): PenduGame { return game }

function flipDuo(game: PenduGame): 0 | 1 {
  if (game.mode !== 'duo') return game.duoTurn
  return game.duoTurn === 0 ? 1 : 0
}

function finishSoloDuoWord(game: PenduGame, round: PenduRound, wordScore: number, strokes: number, result: 'won' | 'lost', message: string): PenduGame {
  const totalScore = result === 'won' ? game.totalScore + wordScore : game.totalScore
  return { ...game, round: result === 'lost' ? revealAll(round) : round, wordScore: result === 'lost' ? 0 : wordScore, strokes, totalScore, status: 'wordOver', wordResult: result, message, duoTurn: flipDuo(game) }
}

function applySoloDuoLetter(game: PenduGame, L: string): PenduGame {
  const unknownBefore = unknownCount(game.round)
  const attempted = [...game.round.attempted, L]
  let round: PenduRound = { ...game.round, attempted }
  if (round.unique.includes(L)) {
    const revealed = round.revealed.includes(L) ? round.revealed : [...round.revealed, L]
    round = { ...round, revealed }
    let wordScore = game.wordScore + 1
    const complete = isRoundComplete(round)
    const bonus = complete && unknownBefore >= BONUS_THRESHOLD
    if (bonus) wordScore += BONUS_POINTS
    if (complete) {
      const msg = bonus ? `Mot trouvé ! +${wordScore} (dont +${BONUS_POINTS} bonus)` : `Mot trouvé ! +${wordScore}`
      return finishSoloDuoWord(game, round, wordScore, game.strokes, 'won', msg)
    }
    return { ...game, round, wordScore, duoTurn: flipDuo(game), message: null }
  }
  const strokes = game.strokes + 1
  if (strokes >= MAX_STROKES) return finishSoloDuoWord(game, round, 0, strokes, 'lost', 'Pendu ! 0 point pour ce mot')
  return { ...game, round, strokes, duoTurn: flipDuo(game), message: null }
}

function applySoloDuoWord(game: PenduGame, guess: string): PenduGame {
  const unknownBefore = unknownCount(game.round)
  if (guess === penduLetters(game.round.word)) {
    const round = revealAll(game.round)
    let wordScore = game.wordScore
    const bonus = unknownBefore >= BONUS_THRESHOLD
    if (bonus) wordScore += BONUS_POINTS
    const msg = bonus ? `Mot trouvé ! +${wordScore} (dont +${BONUS_POINTS} bonus)` : `Mot trouvé ! +${wordScore}`
    return finishSoloDuoWord(game, round, wordScore, game.strokes, 'won', msg)
  }
  const strokes = game.strokes + 1
  if (strokes >= MAX_STROKES) return finishSoloDuoWord(game, game.round, 0, strokes, 'lost', 'Pendu ! 0 point pour ce mot')
  return { ...game, strokes, duoTurn: flipDuo(game), message: 'Mot incorrect' }
}

function multiAllDone(players: PenduPlayer[]): boolean {
  return players.every((p) => { const s = p.multiRound?.status; return s === 'won' || s === 'lost' })
}

function multiFirstWinner(players: PenduPlayer[]): number {
  let best = -1, bestScore = -1
  for (let i = 0; i < players.length; i++) {
    const mr = players[i]!.multiRound
    if (mr?.status === 'won' && mr.wordScore > bestScore) { bestScore = mr.wordScore; best = i }
  }
  return best
}

function advanceMultiWord(game: PenduGame): PenduGame {
  const nextIndex = game.wordIndex + 1
  if (nextIndex >= game.words.length) return { ...game, status: 'gameOver', wordResult: null, message: null }
  const nextRound = makeRound(game.words[nextIndex]!)
  const players = game.players.map((p) => ({ ...p, multiRound: makeMultiRound(nextRound) }))
  return { ...game, wordIndex: nextIndex, round: nextRound, players, status: 'playing', wordResult: null, message: null }
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
    const bonus = allLettersFound && multiFirstWinner(game.players) === -1
    if (bonus) wordScore += BONUS_POINTS
    const status = allLettersFound ? 'won' : 'playing'
    const newMr = { ...mr, guesses, revealed, wordScore, status } as typeof mr
    const players = patchPlayer(game.players, actorIdx, { multiRound: newMr, points: p.points + (allLettersFound ? wordScore : 1) })
    const allDone = multiAllDone(players)
    const msg = allLettersFound ? (bonus ? `${p.name} trouve le mot en premier ! +${BONUS_POINTS} bonus 🎉` : `${p.name} a trouvé le mot !`) : null
    if (allDone) return advanceMultiWord({ ...game, players, message: msg })
    return { ...game, players, message: msg }
  }
  const strokes = mr.strokes + 1
  const lost = strokes >= MAX_STROKES
  const newMr = { ...mr, guesses, strokes, status: lost ? 'lost' : 'playing' } as typeof mr
  const players = patchPlayer(game.players, actorIdx, { multiRound: newMr })
  const allDone = multiAllDone(players)
  const msg = lost ? `${p.name} est pendu ! 💀` : null
  if (allDone) return advanceMultiWord({ ...game, players, message: msg })
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
    const players = patchPlayer(game.players, actorIdx, { multiRound: newMr, points: p.points + wordScore })
    const allDone = multiAllDone(players)
    const msg = bonus ? `${p.name} devine le mot en premier ! +${BONUS_POINTS} bonus 🎉` : `${p.name} a trouvé le mot !`
    if (allDone) return advanceMultiWord({ ...game, players, message: msg })
    return { ...game, players, message: msg }
  }
  const strokes = mr.strokes + 1
  const lost = strokes >= MAX_STROKES
  const newMr = { ...mr, strokes, status: lost ? 'lost' : 'playing' } as typeof mr
  const players = patchPlayer(game.players, actorIdx, { multiRound: newMr })
  const allDone = multiAllDone(players)
  const msg = lost ? `${p.name} est pendu ! 💀` : `${p.name} : mot incorrect`
  if (allDone) return advanceMultiWord({ ...game, players, message: msg })
  return { ...game, players, message: msg }
}

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

export function continuePendu(game: PenduGame): PenduGame {
  if (game.status === 'gameOver') return game
  if (game.mode === 'multi') return game
  if (game.status !== 'wordOver') return game
  const nextIndex = game.wordIndex + 1
  if (nextIndex >= game.words.length) return { ...game, status: 'gameOver', message: null }
  return { ...game, wordIndex: nextIndex, round: makeRound(game.words[nextIndex]!), strokes: 0, wordScore: 0, status: 'playing', wordResult: null, message: null }
}
