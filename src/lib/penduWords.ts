import type { Difficulty } from '../types/index.js'
import { shuffle } from './shuffle.js'

/** Mots FR A–Z, 5–12 lettres, sans accent — tirage local, zéro IA. */
export const PENDU_WORDS = [
  'AIGLE',
  'ALBUM',
  'ALGUE',
  'ALPES',
  'ANANAS',
  'ANCRE',
  'ANGLE',
  'ANIMAL',
  'ARBRE',
  'ARCADE',
  'ARGENT',
  'ARMOIRE',
  'ASSIETTE',
  'ATOME',
  'AVION',
  'AVOCAT',
  'BAGUETTE',
  'BALEINE',
  'BANANE',
  'BANQUE',
  'BATEAU',
  'BATTERIE',
  'BISCUIT',
  'BOISSON',
  'BONHEUR',
  'BOUCLIER',
  'BOULANGER',
  'BOUSSOLE',
  'BRESIL',
  'BRETAGNE',
  'BROSSE',
  'CABANE',
  'CADEAU',
  'CAHIER',
  'CAMERA',
  'CAMION',
  'CANARD',
  'CANOE',
  'CANYON',
  'CAPTAIN',
  'CARGO',
  'CAROTTE',
  'CASCADE',
  'CHAMPION',
  'CHANSON',
  'CHAPEAU',
  'CHATEAU',
  'CHAUSSURE',
  'CHEMIN',
  'CHEVAL',
  'CHIEN',
  'CHOCOLAT',
  'CINEMA',
  'CITRON',
  'CLAVIER',
  'CLOWN',
  'COFFRE',
  'COLLINE',
  'COMETE',
  'COURAGE',
  'COURSE',
  'COUTEAU',
  'CRAYON',
  'CROISSANT',
  'CUILLERE',
  'CUISINE',
  'CYCLONE',
  'DANSE',
  'DAUPHIN',
  'DEFI',
  'DESERT',
  'DIAMANT',
  'DOMAINE',
  'DRAGON',
  'DRAPEAU',
  'ECLAIR',
  'ECRAN',
  'ELEPHANT',
  'ENERGIE',
  'ENIGME',
  'EQUIPE',
  'ESCALIER',
  'ESPACE',
  'ESPAGNE',
  'ETOILE',
  'FALAISE',
  'FAMILLE',
  'FARINE',
  'FAUCON',
  'FENETRE',
  'FUSION',
  'FUSEE',
  'GALAXIE',
  'GARAGE',
  'GATEAU',
  'GEANT',
  'GIRAFE',
  'GLACIER',
  'GRAVITE',
  'GRENOUILLE',
  'GUITARE',
  'HASARD',
  'HIBOU',
  'HISTOIRE',
  'HORLOGE',
  'HOTEL',
  'HUILE',
  'IGLOO',
  'IMAGE',
  'JARDIN',
  'JUNGLE',
  'KANGOUROU',
  'KARATE',
  'KOALA',
  'LAMPE',
  'LANGUE',
  'LAPIN',
  'LASER',
  'LEGUME',
  'LIBRAIRIE',
  'LIVRE',
  'LOGIQUE',
  'LONDON',
  'LUMIERE',
  'MAGIE',
  'MAISON',
  'MANGUE',
  'MARATHON',
  'MARCHE',
  'MARIN',
  'MEDAILLE',
  'MEDECIN',
  'MEMOIRE',
  'MIROIR',
  'MOLECULE',
  'MONTAGNE',
  'MOTEUR',
  'MOUTON',
  'MUSEE',
  'MUSIQUE',
  'NATATION',
  'NAVIRE',
  'NUAGE',
  'OCEAN',
  'OISEAU',
  'OPERA',
  'ORAGE',
  'ORANGE',
  'ORDINATEUR',
  'OURSIN',
  'PANDA',
  'PAPILLON',
  'PARFUM',
  'PECHEUR',
  'PERROQUET',
  'PHARE',
  'PIANO',
  'PILOTE',
  'PIRATE',
  'PIZZA',
  'PLAGE',
  'PLANETE',
  'POESIE',
  'POIVRON',
  'POMPIER',
  'PONTON',
  'PORTAIL',
  'POULET',
  'PRINCESSE',
  'PROFESSEUR',
  'QUESTION',
  'QUIZZ',
  'RADIO',
  'RAISIN',
  'RAPIDE',
  'RENARD',
  'REQUIN',
  'RIVIERE',
  'ROBOT',
  'ROCHER',
  'RUGBY',
  'SALADE',
  'SATELLITE',
  'SAVANE',
  'SCULPTURE',
  'SERPENT',
  'SOLEIL',
  'SOURIS',
  'SPORT',
  'STATUE',
  'STRATEGIE',
  'SUCRE',
  'TABLEAU',
  'TAMBOUR',
  'TAPIS',
  'TEMPETE',
  'TENNIS',
  'THEATRE',
  'TIGRE',
  'TOMATE',
  'TONNERRE',
  'TORTUE',
  'TRAIN',
  'TROPHEE',
  'TUNNEL',
  'VAGUE',
  'VACHE',
  'VALISE',
  'VANILLE',
  'VICTOIRE',
  'VILLAGE',
  'VIOLON',
  'VOITURE',
  'VOLCAN',
  'VOYAGE',
  'ZEBRE',
] as const

/** Mots composés (trait d’union) — palier Difficile. Tirets visibles, pas à deviner. */
export const PENDU_COMPOUNDS = [
  'ABAT-JOUR',
  'APRES-MIDI',
  'ARC-EN-CIEL',
  'ARRIERE-PLAN',
  'AUTO-ECOLE',
  'AVANT-BRAS',
  'AVANT-GARDE',
  'AVANT-HIER',
  'BAIN-MARIE',
  'BEAU-FRERE',
  'BEAU-PERE',
  'BELLE-MERE',
  'BIEN-ETRE',
  'BRISE-GLACE',
  'CACHE-CACHE',
  'CACHE-NEZ',
  'CHASSE-NEIGE',
  'CHAUFFE-EAU',
  'CHAUVE-SOURIS',
  'CHIEN-LOUP',
  'CONTRE-JOUR',
  'CONTRE-SENS',
  'COUPE-VENT',
  'CROC-EN-JAMBE',
  'DEMI-LUNE',
  'DEMI-TOUR',
  'EAU-DE-VIE',
  'ESSUIE-GLACE',
  'FACE-A-FACE',
  'FER-A-CHEVAL',
  'GARDE-BOUE',
  'GARDE-FOU',
  'GARDE-ROBE',
  'GRAND-MERE',
  'GRAND-PERE',
  'GRATTE-CIEL',
  'GRILLE-PAIN',
  'HAUT-DE-FORME',
  'HAUT-PARLEUR',
  'HORS-LA-LOI',
  'HORS-PISTE',
  'LAVE-LINGE',
  'LAVE-VAISSELLE',
  'LIEU-DIT',
  'MI-TEMPS',
  'MILLE-FEUILLE',
  'MILLE-PATTES',
  'OUVRE-BOITE',
  'PARE-BRISE',
  'PARE-CHOCS',
  'PASSE-TEMPS',
  'PETIT-FILS',
  'POISSON-CHAT',
  'PORTE-AVIONS',
  'PORTE-CLES',
  'PORTE-DRAPEAU',
  'PORTE-FEUILLE',
  'PORTE-MANTEAU',
  'PORTE-MONNAIE',
  'PORTE-PAROLE',
  'POT-AU-FEU',
  'PRET-A-PORTER',
  'QUEUE-DE-CHEVAL',
  'QUEUE-DE-PIE',
  'QUATRE-VINGTS',
  'REQUIN-MARTEAU',
  'REVEIL-MATIN',
  'ROUGE-GORGE',
  'SANG-FROID',
  'SANS-ABRI',
  'SAVOIR-FAIRE',
  'SERRE-TETE',
  'SOUS-MARIN',
  'SOUS-SOL',
  'SOUS-TITRE',
  'TETE-A-TETE',
  'TIRE-BOUCHON',
  'TOURNE-DISQUE',
  'TOURNE-VIS',
  'VA-ET-VIENT',
  'VICE-PRESIDENT',
  'VIS-A-VIS',
  'VOL-AU-VENT',
  'WEEK-END',
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

const SIMPLE = [...new Set(PENDU_WORDS.filter(isHangmanSimple))]
const COMPOUNDS = [...new Set(PENDU_COMPOUNDS.filter(isHangmanCompound))]
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

export function matchesPenduDifficulty(
  raw: string,
  difficulty: Difficulty,
): boolean {
  const w = canonPenduWord(raw)
  if (!w) return false
  if (difficulty === 'easy') {
    return isHangmanSimple(w) && w.length <= EASY_MAX_LEN
  }
  if (difficulty === 'hard') {
    return (
      isHangmanCompound(w) ||
      (isHangmanSimple(w) && w.length >= HARD_MIN_LEN)
    )
  }
  return isHangmanSimple(w)
}

export function penduStaticPool(difficulty: Difficulty = 'medium'): string[] {
  if (difficulty === 'easy') return EASY.length >= 10 ? EASY : SIMPLE
  if (difficulty === 'hard') return HARD.length >= 10 ? HARD : SIMPLE
  return SIMPLE
}

function poolFor(difficulty: Difficulty = 'medium'): string[] {
  return penduStaticPool(difficulty)
}

export function remainingPenduPool(
  difficulty: Difficulty,
  exclude: readonly string[] = [],
): string[] {
  const blocked = new Set(exclude.map(canonPenduWord).filter(Boolean))
  return poolFor(difficulty).filter((w) => !blocked.has(canonPenduWord(w)))
}

export type PenduWordSource = 'bank' | 'ai'

export function parsePenduWordSource(raw: unknown): PenduWordSource {
  return raw === 'ai' ? 'ai' : 'bank'
}

/** Reprise aléatoire dans la banque (évite les doublons dans le même lot). */
export function recyclePenduWords(
  n: number,
  difficulty: Difficulty,
  keep: readonly string[] = [],
): string[] {
  const held = [...new Set(keep.map(canonPenduWord).filter(Boolean))].slice(
    0,
    Math.max(0, n),
  )
  if (held.length >= n) return held
  return [...held, ...drawPenduWords(n - held.length, difficulty, held)]
}

export function drawPenduWords(
  n: number,
  difficulty: Difficulty = 'medium',
  exclude: readonly string[] = [],
): string[] {
  const pool = remainingPenduPool(difficulty, exclude)
  const count = Math.max(0, Math.min(n, pool.length))
  return shuffle(pool).slice(0, count)
}

export function drawPenduWord(
  exclude: readonly string[] = [],
  difficulty: Difficulty = 'medium',
): string {
  const pool = remainingPenduPool(difficulty, exclude)
  const list = pool.length > 0 ? pool : poolFor(difficulty)
  return list[Math.floor(Math.random() * list.length)]!
}
