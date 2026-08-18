/** Paliers de difficulté — progression toujours easy → medium → hard */
export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Facile',
  medium: 'Moyen',
  hard: 'Difficile',
}

/** Une question de la banque (format de stockage) */
export interface Question {
  id: string
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  difficulty: Difficulty
  themeSlug: string
  createdAt: string
  batchId: string
  /** Pourquoi la bonne réponse est correcte */
  explanation?: string
  /** Nature de la source (pas d’URL) */
  sourceType?: string
  /** Mode image : terme Wikimedia + type + URL résolue */
  imageSubject?: string
  imageKind?: 'logo' | 'sujet_entier' | 'detail_zoome'
  imageUrl?: string
  /** Mode musique Deezer : extrait + pochette */
  previewUrl?: string
  coverUrl?: string
  deezerTrackId?: string
}

/** Métadonnées d'une banque de thème */
export interface QuestionBankMeta {
  theme: string
  themeSlug: string
  createdAt: string
  updatedAt: string
  counts: Record<Difficulty, number>
  /** 'mock' = à régénérer */
  source?: 'groq' | 'gemini' | 'mock' | string
}

/** Banque complète côté client (localStorage en attendant Firebase) */
export interface QuestionBank {
  meta: QuestionBankMeta
  questions: Question[]
}

/** Historique des questions déjà vues par le joueur pour un thème */
export interface PlayerThemeHistory {
  seenByDifficulty: Record<Difficulty, string[]>
  /** Énoncés déjà posés (tous niveaux) — anti-doublon génération */
  seenTexts?: string[]
  updatedAt: string
}

/** État d'une tentative sur un palier */
export interface TierAttempt {
  correct: number
  answered: number
  status: 'locked' | 'active' | 'passed' | 'failed'
}

/** Portée culturelle des questions */
export type QuizScope = 'fr' | 'international'

/** Texte seul, QCM illustré, ou quiz musical Deezer */
export type QuizContentMode = 'standard' | 'image' | 'audio'

/** Choix d’IA pour la génération */
export type AiProvider =
  | 'auto'
  | 'groq'
  | 'gemini'
  | 'cerebras'
  | 'deepseek'
  | 'openrouter'

export const QUIZ_SCOPE_LABELS: Record<QuizScope, string> = {
  fr: 'Français',
  international: 'International',
}

export const QUIZ_CONTENT_MODE_LABELS: Record<QuizContentMode, string> = {
  standard: 'Texte',
  image: 'Images',
  audio: 'Musique Deezer',
}

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  auto: 'Auto',
  groq: 'Groq',
  gemini: 'Gemini',
  cerebras: 'Cerebras',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
}

/** Providers proposés dans l’UI (les autres restent en fallback Auto) */
export const AI_PROVIDER_UI: AiProvider[] = ['auto', 'groq', 'gemini']

/** Session de jeu solo */
export type SoloPlayMode = 'progression' | 'manual'

export interface GameSession {
  theme: string
  themeSlug: string
  /** Français (FR/Francophonie) ou International */
  scope: QuizScope
  playerName: string
  playMode: SoloPlayMode
  /** Chrono par question (solo) */
  timerEnabled: boolean
  /** IA choisie pour la génération */
  aiProvider?: AiProvider
  /** standard = texte ; image = illustré */
  quizMode?: QuizContentMode
  currentDifficulty: Difficulty
  unlocked: Difficulty[]
  tierAttempts: Record<Difficulty, TierAttempt>
  /** Questions de la manche en cours (max 10) */
  currentHand: Question[]
  handIndex: number
  totalScore: number
  status: 'setup' | 'loading' | 'playing' | 'tier-result' | 'finished'
}

/** Score mini pour valider un palier (sur QUESTIONS_PER_TIER) */
export const PASS_THRESHOLD = 8
export const QUESTIONS_PER_TIER = 10
/** Chrono par question (solo & multi) */
export const ROUND_MS = 10_000

/** @deprecated préférer ORBIT_THEMES / BOTTOM_THEMES dans lib/themes */
export { PRESET_THEMES } from '../lib/themes'
