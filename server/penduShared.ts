/**
 * Re-exports de la logique pendu pour les API serverless.
 * Importe depuis sharedLib.ts (autosuffisant, pas de src/lib).
 */
export {
  continuePendu,
  createDuoGame,
  createMultiGame,
  guessLetter,
  guessWord,
  isPenduMyTurn,
  penduScoresByPlayerId,
  SOLO_DUO_WORDS,
  useHintEliminate,
  useHintReveal,
  type PenduGame,
} from './sharedLib.js'

export { parsePenduWordSource } from './sharedLib.js'
