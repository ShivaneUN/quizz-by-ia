/**
 * Smoke règles Pendu (bonus, pendu 6, multi, indices).
 *   npx tsx scripts/smoke-pendu.ts
 */
import {
  canUseHintEliminate,
  continuePendu,
  createMultiGame,
  createSoloGame,
  displaySlots,
  guessLetter,
  guessWord,
  makeRound,
  playerMultiRound,
  useHintReveal,
  type PenduGame,
} from '../src/lib/pendu.ts'
import { drawPenduWords } from '../src/lib/penduWords.ts'

function withWord(game: PenduGame, word: string): PenduGame {
  const round = makeRound(word)
  return {
    ...game,
    words: game.mode === 'multi' ? [word] : [word, ...game.words.slice(1)],
    wordIndex: 0,
    round,
    strokes: 0,
    wordScore: 0,
    players: game.players.map((p) => ({
      ...p,
      multiRound: {
        guesses: [],
        strokes: 0,
        revealed: [],
        status: 'playing',
        wordScore: 0,
      },
    })),
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL', msg)
    process.exitCode = 1
  } else {
    console.log('ok ', msg)
  }
}

// Lettres une à une : +1 par unique, pas de bonus (unknownBefore=1 à la fin)
{
  let g = withWord(createSoloGame(), 'BANANE')
  for (const L of ['B', 'A', 'N', 'E']) g = guessLetter(g, L)
  assert(g.status === 'wordOver' && g.wordResult === 'won', 'solo lettres → mot trouvé')
  assert(g.wordScore === 4 && g.totalScore === 4, 'solo +1 par unique, pas de bonus')
}

// Mot entier d’emblée : +2 bonus seulement
{
  let g = withWord(createSoloGame(), 'BANANE')
  g = guessWord(g, 'banane')
  assert(g.wordResult === 'won' && g.wordScore === 2 && g.totalScore === 2, 'solo mot entier → +2 bonus')
}

// 9 erreurs → 0 pour le mot
{
  let g = withWord(createSoloGame(), 'BANANE')
  g = guessLetter(g, 'B')
  for (const L of ['X', 'Y', 'Z', 'W', 'Q', 'K', 'J', 'F', 'H']) g = guessLetter(g, L)
  assert(g.wordResult === 'lost' && g.wordScore === 0 && g.totalScore === 0, 'solo 9 erreurs → 0')
  assert(g.round.revealed.length === g.round.unique.length, 'mot révélé après défaite')
}

// Continue vers mot 2
{
  let g = withWord(createSoloGame(), 'BANANE')
  g = guessWord(g, 'BANANE')
  g = continuePendu(g)
  assert(g.status === 'playing' && g.wordIndex === 1 && g.wordScore === 0, 'enchaîne mot suivant')
  assert(g.totalScore === 2, 'score cumulé conservé')
}

// Multi parallèle : chacun a son état, même mot
{
  const ada = { id: 'ada', name: 'Ada' }
  const bob = { id: 'bob', name: 'Bob' }
  let g = withWord(createMultiGame([ada, bob]), 'BANANE')
  g = guessLetter(g, 'B', 'ada')
  const adaR = playerMultiRound(g, 'ada')
  const bobR = playerMultiRound(g, 'bob')
  assert(adaR?.revealed.includes('B') === true, 'Ada voit sa lettre B')
  assert(bobR?.revealed.includes('B') !== true, 'Bob ne reçoit pas la lettre de Ada')
  assert(g.players[0]!.points >= 1, 'Ada marque des points')
  g = guessLetter(g, 'B', 'bob')
  assert(playerMultiRound(g, 'bob')?.revealed.includes('B') === true, 'Bob voit aussi B après l’avoir jouée')
  g = guessWord(g, 'BANANE', 'bob')
  assert(playerMultiRound(g, 'bob')?.status === 'won', 'Bob a trouvé le mot')
  assert(g.status === 'playing', 'on n’avance pas tant que Ada n’a pas fini')
  g = guessLetter(g, 'X', 'ada')
  assert(g.status === 'playing', 'Ada peut encore jouer')
}

{
  const ada = { id: 'ada', name: 'Ada' }
  const bob = { id: 'bob', name: 'Bob' }
  let g = withWord(createMultiGame([ada, bob]), 'BANANE')
  g = guessLetter(g, 'B', 'ada')
  const falses = 'XYZWQKJFHMLPVCDGIRSTU'.split('')
  let i = 0
  while (playerMultiRound(g, 'ada')?.status === 'playing' && i < falses.length) {
    g = guessLetter(g, falses[i++]!, 'ada')
  }
  assert(playerMultiRound(g, 'ada')?.status === 'lost', '9 traits Ada → pendue')
  assert(playerMultiRound(g, 'bob')?.status === 'playing', 'Bob continue son pendu')
}

// Indice révélation : désactivé en multi parallèle
{
  let g = withWord(createMultiGame([{ id: 'ada', name: 'Ada' }, { id: 'bob', name: 'Bob' }]), 'BANANE')
  g = guessLetter(g, 'B', 'ada')
  const before = g.players[0]!.points
  g = useHintReveal(g)
  assert(g.players[0]!.points === before, 'indice révélation no-op en multi')
}

{
  let g = withWord(createMultiGame([{ id: 'ada', name: 'Ada' }, { id: 'bob', name: 'Bob' }]), 'BANANE')
  assert(canUseHintEliminate(g) === false, 'indice éliminer indispo en multi parallèle')
}

{
  const easy = drawPenduWords(10, 'easy')
  assert(
    easy.length === 10 && easy.every((w) => w.length <= 6 && !w.includes('-')),
    'facile : 10 petits mots sans tiret',
  )
  const rest = drawPenduWords(10, 'easy', easy)
  assert(
    rest.every((w) => !easy.includes(w)),
    'exclude : pas de mot déjà tiré',
  )
  const hard = drawPenduWords(10, 'hard')
  assert(
    hard.length === 10 &&
      hard.every((w) => w.includes('-') || w.length >= 8),
    'difficile : 10 grands mots ou composés',
  )
}

{
  let g = withWord(createSoloGame('hard'), 'ARC-EN-CIEL')
  assert(g.round.word === 'ARC-EN-CIEL', 'tirets conservés à l’affichage')
  assert(!g.round.unique.includes('-'), 'le tiret n’est pas une lettre à deviner')
  const hyphens = displaySlots(g.round).filter((s) => s.hyphen)
  assert(hyphens.length === 2 && hyphens.every((s) => s.shown), '2 tirets déjà visibles')
  g = guessWord(g, 'arcenciel')
  assert(g.wordResult === 'won', 'mot entier accepté sans taper les tirets')
}

if (process.exitCode) {
  console.error('smoke pendu: échec')
} else {
  console.log('smoke pendu: OK')
}
