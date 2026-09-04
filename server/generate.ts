/**
 * Génération de questions — multi-providers IA (choix + fallback Auto).
 * Clés API uniquement côté serveur (.env).
 */

import { fetchCommonsImageUrl } from './wikimedia.js'
import { buildDeezerQuiz } from './deezerQuiz.js'
import { construirePrompt } from './quizPromptFragments.js'
import { resolveQuizScope } from './quizScope.js'
import { buildFlagQuiz, isFlagTheme } from './flagQuiz.js'
import {
  enginesWithKeys,
  listApiKeys,
  pickAiForEngine,
  pickAiForGeneration,
  releaseAiSlot,
  type PickedAi,
  type RotateEngine,
} from './aiRotate.js'
import { recordAiGeneration, recordAiModelError, classifyAiError, setConfiguredAiModels, isModelDayTokenCapped } from './aiGenStats.js'
import {
  getPartialQuestions,
  syncPartialQuestionCache,
} from './partialQuestionCache.js'

/** Réponse brute LLM + tokens (si l’API les expose). */
interface LlmCallResult {
  text: string
  tokensIn: number
  tokensOut: number
  /** Tokens de la partie input servis depuis le cache provider (Groq/Gemini). 0 si absent ou non caché. */
  tokensCached: number
}

export function normalizeThemeSlug(theme: string): string {
  return theme
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type Difficulty = 'easy' | 'medium' | 'hard'
/** auto = chaîne de fallback ; sinon provider forcé */
export type AiProvider =
  | 'auto'
  | 'groq'
  | 'gemini'
  | 'cerebras'
  | 'deepseek'
  | 'openrouter'
/** standard = texte ; image = QCM illustré Wikimedia ; audio = quiz Deezer */
export type QuizContentMode = 'standard' | 'image' | 'audio'
export type ImageKind = 'logo' | 'sujet_entier' | 'detail_zoome'
export type GenerateSource =
  | 'groq'
  | 'gemini'
  | 'cerebras'
  | 'deepseek'
  | 'openrouter'
  | 'deezer'
  | 'flags'
  | 'mock'
  | 'bank'

export interface GeneratedQuestion {
  id: string
  question: string
  answers: string[]
  correctIndex: number
  difficulty: Difficulty
  themeSlug: string
  createdAt: string
  batchId: string
  explanation?: string
  sourceType?: string
  dateReference?: string | null
  imageSubject?: string
  imageKind?: ImageKind
  imageUrl?: string
  previewUrl?: string
  coverUrl?: string
  deezerTrackId?: string
  /** Titre — Artiste pour l’audit (réponses QCM = titre seul) */
  revealAnswer?: string
  answerMode?: 'qcm' | 'free'
  acceptedAnswers?: string[]
  freeInputHint?: 'title' | 'title_or_artist'
  /** Résumé court du fait testé (3-6 mots-clés), fourni par l'IA pour l'historique anti-doublon */
  resumeFait?: string
  /** true si la question provient du filet de sécurité statique */
  estFallbackStatique?: boolean
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

type LlmEngine = Exclude<AiProvider, 'auto'>

/**
 * Modèles Groq — gpt-oss d’abord (JSON long fiable).
 * Compound tronque souvent le JSON à 10 Q (agentique / max_tokens).
 */
const GROQ_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'groq/compound-mini',
  'groq/compound',
] as const

/** Fallback si le listing live échoue — jamais gemini-2.5-flash (404 new users). */
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
] as const

const CEREBRAS_MODELS = ['gemma-4-31b', 'gpt-oss-120b', 'zai-glm-4.7'] as const
const DEEPSEEK_MODELS = ['deepseek-chat'] as const
/** OpenRouter free — IDs vérifiés live (août 2026). nano-9b-v2 retiré (404). */
const OPENROUTER_MODELS = [
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'z-ai/glm-5.2:free',
  'liquid/lfm-2.5-2.6b:free',
  'openrouter/free',
] as const

setConfiguredAiModels([
  ...GEMINI_MODELS.map((model) => ({ engine: 'gemini' as const, model })),
  ...GROQ_MODELS.map((model) => ({ engine: 'groq' as const, model })),
  ...OPENROUTER_MODELS.map((model) => ({ engine: 'openrouter' as const, model })),
])

/** System prompt minimal — renforce l'interdiction d'inventer des faits. */
const AI_SYSTEM_MINIMAL = `Tu es un générateur de quiz factuel. Réponds UNIQUEMENT en JSON valide. Pas de texte avant ni après. N'invente jamais de faits, noms, dates ou sources. Si tu n'es pas certain à 100%, n'inclus pas la question.`

/** Auto = Gemini + Groq uniquement (OpenRouter retiré de la boucle auto). */
const AUTO_FREE_ENGINES: LlmEngine[] = ['gemini', 'groq']

/** Priorité globale — flash-lite d’abord (moins saturé que flash-latest). */
const ROUTE_PRIORITY: Array<{ engine: LlmEngine; model: string }> = [
  { engine: 'gemini', model: 'gemini-flash-lite-latest' },
  { engine: 'gemini', model: 'gemini-flash-latest' },
  { engine: 'gemini', model: 'gemini-3.5-flash' },
  { engine: 'gemini', model: 'gemini-3.1-flash-lite' },
  { engine: 'groq', model: 'openai/gpt-oss-20b' },
  { engine: 'groq', model: 'openai/gpt-oss-120b' },
  { engine: 'groq', model: 'groq/compound-mini' },
  { engine: 'groq', model: 'groq/compound' },
]

interface GenerationRoute {
  engine: LlmEngine
  apiKey: string
  keyIndex: number
  model: string
}

/** Dernier couple provider/modèle qui a réussi (mémoire courte, 30 min). */
let lastWorkingRoute: { engine: LlmEngine; model: string; at: number } | null =
  null
const ROUTE_MEMORY_MS = 30 * 60 * 1000

function rememberWorkingRoute(engine: LlmEngine, model: string): void {
  lastWorkingRoute = { engine, model, at: Date.now() }
}

function isRotateEngine(v: string | undefined): v is RotateEngine {
  return v === 'gemini' || v === 'groq' || v === 'openrouter'
}

/**
 * Lot incomplet Groq → Gemini (puis OpenRouter) pour les manquantes.
 * Les autres IA restent collées à elles-mêmes.
 */
async function pickRattrapageSlot(
  provider: AiProvider,
  currentEngine: string | undefined,
  alreadyHave: number,
): Promise<PickedAi | undefined> {
  if (provider !== 'auto' || alreadyHave <= 0) return undefined
  if (currentEngine === 'groq') {
    const next =
      (await pickAiForEngine('gemini')) ?? (await pickAiForEngine('openrouter'))
    if (next) {
      console.log(
        `[topup] groq incomplet (${alreadyHave}/10) → bascule ${next.engine}`,
      )
    }
    return next ?? undefined
  }
  if (isRotateEngine(currentEngine)) {
    return (await pickAiForEngine(currentEngine)) ?? undefined
  }
  return undefined
}

function getPreferredRoute(): { engine: LlmEngine; model: string } | null {
  if (!lastWorkingRoute) return null
  if (Date.now() - lastWorkingRoute.at > ROUTE_MEMORY_MS) return null
  return lastWorkingRoute
}

function routeSortKey(route: GenerationRoute): number {
  const pref = getPreferredRoute()
  if (pref && pref.engine === route.engine && pref.model === route.model) {
    return -1
  }
  const idx = ROUTE_PRIORITY.findIndex(
    (p) => p.engine === route.engine && p.model === route.model,
  )
  if (idx >= 0) return idx
  const engineIdx = AUTO_FREE_ENGINES.indexOf(route.engine)
  return 100 + (engineIdx >= 0 ? engineIdx : 50) + route.keyIndex * 0.1
}

/** primary = IA réservée ; fallback = autres IA seulement après erreur. */
type RouteEngineScope = 'all' | 'primary' | 'fallback'

async function buildGenerationRoutes(
  provider: AiProvider,
  contentMode: QuizContentMode,
  pickedSlot?: string,
  engineScope: RouteEngineScope = 'all',
): Promise<GenerationRoute[]> {
  let engines: LlmEngine[] =
    provider === 'auto'
      ? ((enginesWithKeys().length > 0
          ? enginesWithKeys()
          : AUTO_FREE_ENGINES) as LlmEngine[])
      : enginesForProvider(provider)

  // Slot RR (ex. groq#0) : rester sur cette IA tant qu’il n’y a pas d’erreur.
  const slot = pickedSlot
  if (provider === 'auto' && slot) {
    const primary = slot.split('#')[0] as LlmEngine
    if (engines.includes(primary)) {
      if (engineScope === 'primary') {
        engines = [primary]
      } else if (engineScope === 'fallback') {
        engines = engines.filter((e) => e !== primary)
      } else {
        engines = [primary, ...engines.filter((e) => e !== primary)]
      }
    }
  }

  const routes: GenerationRoute[] = []

  for (const engine of engines) {
    const allKeys = keysForEngine(engine)
    if (allKeys.length === 0) continue

    let keys = allKeys
    if (provider === 'auto' && slot?.startsWith(`${engine}#`)) {
      const idx = Number(slot.split('#')[1]) || 0
      const primary = allKeys[idx]
      const rest = allKeys.filter((_, i) => i !== idx)
      keys = [primary, ...rest].filter(Boolean) as string[]
    }

    for (let keyIndex = 0; keyIndex < Math.min(keys.length, 2); keyIndex++) {
      const apiKey = keys[keyIndex]
      if (!apiKey) continue
      const models =
        engine === 'gemini'
          ? await geminiModelsForKey(apiKey)
          : modelsFor(engine, contentMode).slice(0, 3)
      for (const model of models) {
        routes.push({ engine, apiKey, keyIndex, model })
      }
    }
  }

  const engineRank = (engine: LlmEngine) => {
    const i = engines.indexOf(engine)
    return i >= 0 ? i : 99
  }

  const seen = new Set<string>()
  return routes
    .filter((r) => {
      const k = `${r.engine}:${r.model}:${r.keyIndex}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => {
      const er = engineRank(a.engine) - engineRank(b.engine)
      if (er !== 0) return er
      return routeSortKey(a) - routeSortKey(b)
    })
}

export function parseAiProvider(raw: unknown): AiProvider {
  if (
    raw === 'groq' ||
    raw === 'gemini' ||
    raw === 'cerebras' ||
    raw === 'deepseek' ||
    raw === 'openrouter' ||
    raw === 'auto'
  ) {
    return raw
  }
  return 'auto'
}

function enginesForProvider(provider: AiProvider): LlmEngine[] {
  if (provider === 'auto') {
    const live = enginesWithKeys()
    return live.length > 0 ? live : [...AUTO_FREE_ENGINES]
  }
  return [provider]
}

function envKeyFor(engine: LlmEngine): string | undefined {
  if (engine === 'cerebras') {
    return (
      process.env.CEREBRAS_API_KEY?.trim() ||
      process.env.CEREBRAS_API_Gemma431B_KEY?.trim() ||
      process.env.CEREBRAS_API_OpenAIGPTOSS_KEY?.trim()
    )
  }
  if (engine === 'deepseek') return process.env.DEEPSEEK_API_KEY
  if (engine === 'groq' || engine === 'gemini' || engine === 'openrouter') {
    return listApiKeys(engine)[0]
  }
  return undefined
}

function keysForEngine(engine: LlmEngine): string[] {
  if (engine === 'groq' || engine === 'gemini' || engine === 'openrouter') {
    return listApiKeys(engine)
  }
  if (engine === 'cerebras') {
    const keys = [
      process.env.CEREBRAS_API_KEY,
      process.env.CEREBRAS_API_Gemma431B_KEY,
      process.env.CEREBRAS_API_OpenAIGPTOSS_KEY,
    ]
      .map((k) => String(k ?? '').trim())
      .filter(Boolean)
    return [...new Set(keys)]
  }
  const one = envKeyFor(engine)?.trim()
  return one ? [one] : []
}

function modelsFor(engine: LlmEngine, contentMode: QuizContentMode): string[] {
  void contentMode
  const cap = 4
  switch (engine) {
    case 'groq':
      return GROQ_MODELS.slice(0, cap)
    case 'gemini':
      return GEMINI_MODELS.slice(0, cap)
    case 'cerebras':
      return CEREBRAS_MODELS.slice(0, cap)
    case 'deepseek':
      return DEEPSEEK_MODELS.slice(0, cap)
    case 'openrouter':
      return OPENROUTER_MODELS.slice(0, cap)
  }
}

let geminiLiveCache: { at: number; ids: string[] } | null = null

function rankGeminiModel(id: string): number {
  const n = id.toLowerCase()
  if (n === 'gemini-flash-lite-latest') return 0
  if (n === 'gemini-flash-latest') return 1
  if (/gemini-3\.5-flash$/.test(n)) return 2
  if (/gemini-3\.1-flash-lite/.test(n)) return 3
  if (/gemini-3-flash/.test(n)) return 4
  if (/flash/.test(n) && !/2\.5|2\.0|1\.5/.test(n)) return 5
  if (/flash/.test(n)) return 12
  return 30
}

/** Modèles generateContent réellement autorisés pour cette clé (cache 10 min). */
async function geminiModelsForKey(apiKey: string): Promise<string[]> {
  if (
    geminiLiveCache &&
    Date.now() - geminiLiveCache.at < 10 * 60 * 1000 &&
    geminiLiveCache.ids.length > 0
  ) {
    return geminiLiveCache.ids
  }
  try {
    const res = await fetchWithTimeout(
      'https://generativelanguage.googleapis.com/v1beta/models',
      {
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey.trim() },
      },
      4_000,
    )
    if (!res.ok) throw new Error(`list ${res.status}`)
    const data = (await res.json()) as {
      models?: Array<{
        name?: string
        supportedGenerationMethods?: string[]
      }>
    }
    const ids = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => String(m.name ?? '').replace(/^models\//, ''))
      .filter(
        (id) =>
          Boolean(id) &&
          !/embedding|imagen|image|tts|robotics|computer-use|native-audio/i.test(
            id,
          ),
      )
    ids.sort((a, b) => rankGeminiModel(a) - rankGeminiModel(b) || a.localeCompare(b))
    const picked = ids.slice(0, 4)
    if (picked.length > 0) {
      geminiLiveCache = { at: Date.now(), ids: picked }
      console.info('[gemini] modèles live:', picked.join(', '))
      return picked
    }
  } catch (e) {
    console.warn(
      '[gemini] listing modèles impossible:',
      e instanceof Error ? e.message : e,
    )
  }
  return [...GEMINI_MODELS]
}

export function parseQuizContentMode(raw: unknown): QuizContentMode {
  if (raw === 'audio') return 'audio'
  // Mode image temporairement désactivé
  return 'standard'
}

function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    c.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildMockQuestions(
  theme: string,
  themeSlug: string,
  mode: 'initial' | 'complementary',
  difficulty?: Difficulty,
): GeneratedQuestion[] {
  const batchId = newId()
  const now = new Date().toISOString()
  const targets: Difficulty[] =
    mode === 'complementary' && difficulty ? [difficulty] : DIFFICULTIES

  const out: GeneratedQuestion[] = []
  for (const diff of targets) {
    for (let i = 1; i <= 10; i++) {
      const correctIndex = (i % 4) as 0 | 1 | 2 | 3
      const answers: [string, string, string, string] = [
        `Réponse A (${diff})`,
        `Réponse B (${diff})`,
        `Réponse C (${diff})`,
        `Réponse D (${diff})`,
      ]
      answers[correctIndex] = `Bonne réponse #${i}`
      out.push({
        id: newId(),
        question: `[${diff.toUpperCase()}] ${theme} — question mock ${i}/10 ?`,
        answers,
        correctIndex,
        difficulty: diff,
        themeSlug,
        createdAt: now,
        batchId,
        explanation: `Explication mock pour la question ${i} sur ${theme}.`,
        sourceType: 'culture générale/notoriété publique',
      })
    }
  }
  return out
}

interface RawQuestion {
  question?: string
  answers?: string[]
  reponses?: string[]
  correctIndex?: number
  bonne_reponse_index?: number
  difficulty?: string
  difficulte?: string
  explication?: string
  explanation?: string
  type_source?: string
  sourceType?: string
  source?: string
  date_reference?: string | null
  dateReference?: string | null
  sujet_image?: string
  type_image?: string
  imageSubject?: string
  imageKind?: string
  resume_fait?: string
  fait_verifiable?: boolean | string
}

function parseImageKind(raw: unknown): ImageKind | undefined {
  if (raw === 'logo' || raw === 'sujet_entier' || raw === 'detail_zoome') {
    return raw
  }
  return undefined
}

const IMAGE_PROMPT_GENERIC = 'À quoi correspond cette image ?'

const SPOILER_STOPWORDS = new Set([
  'quel',
  'quelle',
  'quels',
  'quelles',
  'quoi',
  'comment',
  'combien',
  'quand',
  'où',
  'qui',
  'dans',
  'avec',
  'pour',
  'sans',
  'sur',
  'sous',
  'entre',
  'parmi',
  'selon',
  'apres',
  'avant',
  'depuis',
  'pendant',
  'contre',
  'vers',
  'chez',
  'nom',
  'modele',
  'marque',
  'voiture',
  'film',
  'serie',
  'jeu',
  'jeux',
  'annee',
  'annees',
  'ville',
  'pays',
  'capitale',
  'equipe',
  'joueur',
  'groupe',
  'album',
  'chanson',
  'livre',
  'auteur',
  'creee',
  'cree',
  'creer',
  'cree',
  'construit',
  'fonde',
  'lance',
  'sorti',
  'celebre',
  'connu',
  'connue',
  'luxe',
  'sport',
  'italien',
  'italienne',
  'francais',
  'francaise',
  'americain',
  'americaine',
  'premier',
  'premiere',
  'premier',
  'cette',
  'cet',
  'cette',
  'ces',
  'une',
  'des',
  'les',
  'une',
  'est',
  'sont',
  'ete',
  'fait',
  'avoir',
  'etre',
])

function normalizeQuizText(s: string): string {
  return (
    s
      .toLowerCase()
      // Accents latins uniquement (é→e) ; autres écritures recomposées intactes
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFC')
      .replace(/['’]/g, ' ')
      // Lettres + chiffres + marques (voyelles khmer, harakat, etc.)
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function significantTokens(s: string): string[] {
  return normalizeQuizText(s)
    .split(' ')
    .filter((t) => t.length >= 4 && !SPOILER_STOPWORDS.has(t))
}

/**
 * Détecte si l’énoncé spoile la bonne réponse
 * (réponse entière ou fragment distinctif unique à la bonne réponse).
 */
function questionLeaksAnswer(
  question: string,
  answers: string[],
  correctIndex: number,
): boolean {
  const qNorm = normalizeQuizText(question)
  const correct = answers[correctIndex] ?? ''
  const correctNorm = normalizeQuizText(correct)
  if (!qNorm || !correctNorm) return false

  // 1) Bonne réponse (presque) entière dans la question
  if (correctNorm.length >= 4 && qNorm.includes(correctNorm)) return true

  // 2) Token distinctif de la bonne réponse présent dans l’énoncé
  //    et absent des mauvaises réponses (ex. "Bentley" → "Bentley 8 Litre")
  for (const token of significantTokens(correct)) {
    if (!qNorm.includes(token)) continue
    const alsoInWrong = answers.some(
      (a, i) =>
        i !== correctIndex && normalizeQuizText(a).includes(token),
    )
    if (!alsoInWrong) return true
  }

  return false
}

/** Doublons / quasi-doublons entre réponses → risque de plusieurs bonnes. */
function hasDuplicateOrNearDuplicateAnswers(answers: string[]): boolean {
  const norms = answers.map((a) => normalizeQuizText(a)).filter(Boolean)
  if (norms.length !== 4) return true
  const seen = new Set<string>()
  for (const n of norms) {
    if (seen.has(n)) return true
    seen.add(n)
  }
  for (let i = 0; i < norms.length; i++) {
    for (let j = i + 1; j < norms.length; j++) {
      const a = norms[i]
      const b = norms[j]
      if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
        return true
      }
    }
  }
  return false
}

/** L’explication suggère qu’une autre réponse serait aussi valide. */
function explanationSuggestsMultipleCorrect(explanation: string): boolean {
  const e = explanation
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return (
    /\b(aussi|egalement|egalement|tout autant|peut (aussi )?etre|pourraient|plusieurs|deux reponses|ambigu)\b/.test(
      e,
    ) || /mauvaise reponse.*(correcte|vraie|valide)/.test(e)
  )
}

/** Force une consigne de reconnaissance visuelle (mode image). */
function normalizeImageQuestionText(raw: string): string {
  const q = raw.trim()
  const lower = q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const ok =
    /a quoi correspond cette image/.test(lower) ||
    /qui (est|sont) (represente|montre|sur cette image)/.test(lower) ||
    /qu.?est[- ]ce que (montre|represente) cette image/.test(lower) ||
    /identifie (ce|cette|l.)/.test(lower)
  return ok ? q : IMAGE_PROMPT_GENERIC
}

const DIFFICULTY_FR: Record<Difficulty, string> = {
  easy: 'facile',
  medium: 'moyen',
  hard: 'difficile',
}

const SCOPE_FR: Record<'fr' | 'international', string> = {
  fr: 'Français',
  international: 'International',
}

function splitThemeParts(theme: string): { theme: string; sousTheme: string } {
  if (theme.includes('—')) {
    const [parent, sub] = theme.split('—').map((s) => s.trim())
    return {
      theme: parent || theme.trim(),
      sousTheme: sub || 'Général',
    }
  }
  return { theme: theme.trim(), sousTheme: 'Général' }
}


/**
 * Construit le prompt via l'architecture modulaire vérifiée (quizPromptFragments).
 * Un seul bloc de difficulté par appel. excludeQuestions = resume_fait (3-6 mots) ou texte.
 */
export function buildPrompt(
  themeFull: string,
  difficulty: Difficulty,
  scope: 'fr' | 'international',
  _contentMode: QuizContentMode,
  excludeQuestions: string[] = [],
  questionCount = 10,
  mode: 'full' | 'topup' = 'full',
): string {
  const { theme, sousTheme } = splitThemeParts(themeFull)
  const difficulte = DIFFICULTY_FR[difficulty]
  const effectiveScope = resolveQuizScope(themeFull, scope)
  const portee = SCOPE_FR[effectiveScope]
  return construirePrompt({
    theme,
    sousTheme,
    difficulte,
    portee,
    historiqueQuestions: excludeQuestions.slice(0, 50),
    questionCount,
    mode,
  })
}

function normalizeRawAnswers(raw: RawQuestion): string[] | null {
  const list = raw.reponses ?? raw.answers
  if (!Array.isArray(list) || list.length !== 4) return null
  return list.map(String)
}

function normalizeRawIndex(raw: RawQuestion): number {
  if (typeof raw.bonne_reponse_index === 'number') return raw.bonne_reponse_index
  if (typeof raw.correctIndex === 'number') return raw.correctIndex
  return 0
}

type ParseOutcome =
  | { kind: 'ok'; questions: GeneratedQuestion[] }
  | { kind: 'theme_error'; message: string }
  | { kind: 'invalid' }

function normalizeSourceType(raw: string): string | undefined {
  const t = raw.trim()
  if (!t) return undefined
  // Jamais d’URL (hallucination / inventé)
  if (/^https?:/i.test(t) || /\bwww\./i.test(t)) return undefined
  if (t.length < 4) return undefined
  if (isVagueSource(t)) return undefined
  return t.length <= 120 ? t : t.slice(0, 120)
}

/** Sources génériques que l'IA invente souvent — rejetées côté code. */
function isVagueSource(source: string): boolean {
  const s = source
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return (
    /\bculture generale\b/.test(s) ||
    /\bnotoriete publique\b/.test(s) ||
    /\bfait historique\b/.test(s) ||
    /\bfait scientifique\b/.test(s) ||
    /\bconnaissance commune\b/.test(s) ||
    /\bsource generale\b/.test(s) ||
    /\bdocumentation generale\b/.test(s) ||
    /\bcommunement connu\b/.test(s) ||
    /\bsavoir general\b/.test(s) ||
    /\bconnaissances generales\b/.test(s) ||
    /^generique\b/.test(s) ||
    /^source\b$/.test(s)
  )
}

function isFactVerifiable(raw: RawQuestion, sourceType?: string): boolean {
  const v = raw.fait_verifiable
  if (v === false) return false
  if (typeof v === 'string' && v.trim().toLowerCase() === 'false') return false
  if (v === true) return true
  if (typeof v === 'string' && v.trim().toLowerCase() === 'true') return true
  // Champ absent : accepter seulement si la source nominative est concrète
  return Boolean(sourceType && !isVagueSource(sourceType))
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Thème Langues (slug banque ou libellé). */
function isLanguesThemeSlug(themeSlug: string): boolean {
  const s = themeSlug
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return s.startsWith('langues') || s.includes('langues--') || /(^|--)langues(-|$)/.test(s)
}

/**
 * Écriture hors latin de base (CJK, arabe, cyrillique, grec, hébreu, khmer…).
 * Ces réponses doivent porter une transcription latine pour rester lisibles.
 */
function answerNeedsLatinTranscription(answer: string): boolean {
  const t = answer.trim()
  if (!t) return false
  return /[^\u0000-\u024f\u1e00-\u1eff\s\d!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~«»…’‘“”–—]/.test(
    t,
  )
}

/** Transcription latine entre parenthèses (un ou plusieurs mots), ex. `你好 (ni hao)`. */
function isLatinTranscriptionGloss(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  if (
    !/^[A-Za-zĀāĒēĪīŌōŪūÂâÊêÎîÔôÛûÄäËëÏïÖöÜüŸÿ'\-\s]+$/.test(t)
  ) {
    return false
  }
  if (/[àâäéèêëïîôùûüçœæ]/i.test(t) && !/[āēīōū]/.test(t)) return false
  const frWords = new Set([
    'bonjour',
    'bonsoir',
    'salut',
    'merci',
    'oui',
    'non',
    'chat',
    'chien',
    'maison',
    'eau',
    'pain',
    'homme',
    'femme',
    'amour',
    'pardon',
    'desole',
    'bienvenue',
    'matinal',
    'aurevoir',
  ])
  const words = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (words.some((w) => frWords.has(w))) return false
  return true
}

function answerHasLatinTranscription(answer: string): boolean {
  const groups = [...answer.matchAll(/\(([^)]+)\)/g)].map((m) =>
    (m[1] ?? '').trim(),
  )
  if (groups.length !== 1) return false
  return isLatinTranscriptionGloss(groups[0]!)
}

/** Sens FR spoiler dans une option (ex. `(bonjour)` ou 2e parenthèse). */
function answerHasFrenchSpoilerGloss(
  answer: string,
  question: string,
): boolean {
  const groups = [...answer.matchAll(/\(([^)]+)\)/g)].map((m) =>
    (m[1] ?? '').trim(),
  )
  if (groups.length >= 2) return true
  if (groups.length !== 1) return false
  const g = groups[0]!
  // Transcription latine valide → pas un spoiler FR
  if (isLatinTranscriptionGloss(g)) {
    const nq = question
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[«»"'']/g, '')
    const ng = g
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    // Ex. (bonjour) classé FR via liste → déjà false isLatinTranscription
    // Si la glose est citée telle quelle dans la question et courte → spoiler
    if (
      ng.length >= 3 &&
      ng.length <= 12 &&
      !ng.includes(' ') &&
      (nq.includes(`«${ng}»`) || nq.includes(`"${ng}"`))
    ) {
      return true
    }
    return false
  }
  return true
}

/** Retire la glose finale `(…)` pour les contrôles anti-fuite / inversion. */
function stripTrailingGloss(answer: string): string {
  return answer.replace(/\s*\([^)]*\)\s*$/u, '').trim()
}

/** Mots vides français ignorés pour la comparaison de similarité de questions. */
const FRENCH_STOPWORDS = new Set([
  'le','la','les','un','une','des','de','du','au','aux','et','ou','est','sont',
  'a','en','dans','sur','par','pour','que','qui','quel','quelle','quels','quelles',
  'ce','cet','cette','ces','son','sa','ses','leur','leurs','avec','sans','ne','pas',
  'se','on','il','elle','ils','elles','vous','nous','je','tu','plus','tres','fut',
  'etait','dont','comme','entre','sous','vers','depuis','apres','avant','the',
])

/** Ensemble de mots-clés significatifs (≥3 lettres, hors mots vides) d'une question. */
function questionKeywordSet(questionText: string): Set<string> {
  const norm = normalizeForMatch(questionText).replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const words = norm
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !FRENCH_STOPWORDS.has(w))
  return new Set(words)
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * Seuil de similarité au-delà duquel deux questions sont considérées comme
 * portant sur le même fait, même reformulées différemment.
 * Best-effort par recouvrement de mots-clés — pas une comparaison sémantique
 * réelle, donc volontairement prudent (seuil assez haut) pour limiter les
 * faux positifs sur des questions différentes qui partagent juste du
 * vocabulaire courant du thème.
 */
const NEAR_DUPLICATE_THRESHOLD = 0.62

function isNearDuplicateQuestion(
  candidate: Set<string>,
  existing: Set<string>[],
): boolean {
  if (candidate.size < 3) return false // trop court pour être fiable
  return existing.some(
    (other) => jaccardSimilarity(candidate, other) >= NEAR_DUPLICATE_THRESHOLD,
  )
}

/**
 * Paires catégorie-demandée / signal-contradictoire.
 * Heuristique best-effort : ne couvre pas tous les cas de prémisse fausse,
 * mais bloque les incohérences les plus visibles et les plus fréquentes
 * (ex: "quel animal…" avec une réponse humaine).
 * Volontairement limité à des signaux à faible taux de faux positif —
 * les cas plus fins (accord de genre chanteur/chanteuse, etc.) restent
 * gérés au niveau du prompt (ANTI-PRÉMISSE FAUSSE) car trop bruités pour
 * être fiables en heuristique automatique.
 */
const CATEGORY_MISMATCH_PAIRS: Array<{
  label: string
  askedPattern: RegExp
  conflictPattern: RegExp
}> = [
  {
    label: 'animal attendu / réponse humaine',
    askedPattern:
      /\bquel(?:le|s|les)?\s+(?:animal|espece|mammifere|oiseau|reptile|insecte|poisson)\b/i,
    conflictPattern:
      /\b(humain|humaine|un homme|une femme|un garcon|une fille|etre humain)\b/i,
  },
  {
    label: 'groupe attendu / artiste solo en réponse',
    askedPattern: /\bquel\s+groupe\b/i,
    conflictPattern:
      /\b(artiste solo|chanteur solo|chanteuse solo|carriere solo|en solo)\b/i,
  },
  {
    label: 'artiste solo attendu / groupe en réponse',
    askedPattern: /\b(artiste solo|carriere solo|en solo)\b/i,
    conflictPattern: /\b(membre du groupe|fait partie du groupe|groupe de musique)\b/i,
  },
]

/**
 * Détecte une contradiction entre la catégorie demandée dans la question
 * et la nature de la bonne réponse (texte de la réponse + explication).
 */
function hasCategoryMismatch(
  questionText: string,
  correctAnswerText: string,
  explanation: string,
): boolean {
  const q = normalizeForMatch(questionText)
  const context = normalizeForMatch(`${correctAnswerText} ${explanation}`)
  return CATEGORY_MISMATCH_PAIRS.some(
    (pair) => pair.askedPattern.test(q) && pair.conflictPattern.test(context),
  )
}

/**
 * Signal probable d'inversion bonne/mauvaise réponse : l'explication cite
 * explicitement une MAUVAISE réponse (terme assez spécifique, ≥4 caractères)
 * sans jamais mentionner la bonne réponse déclarée. Best-effort : ne se
 * déclenche que quand le signal est net, pour limiter les faux positifs
 * (beaucoup d'explications valides ne répètent pas la réponse mot pour mot).
 */
function possibleAnswerInversion(
  answers: string[],
  correctIndex: number,
  explanation: string,
): boolean {
  const exp = normalizeForMatch(explanation)
  const correct = normalizeForMatch(answers[correctIndex] ?? '')
  if (correct.length < 4) return false
  if (exp.includes(correct)) return false // bonne réponse bien citée → pas d'alerte

  return answers.some((a, i) => {
    if (i === correctIndex) return false
    const wrong = normalizeForMatch(a)
    return wrong.length >= 4 && exp.includes(wrong)
  })
}

/**
 * Tautologie grossière : la bonne réponse ne doit pas être simplement le
 * nom du thème (ex: thème "Cinéma" avec bonne réponse "cinéma").
 */
function isTautologicalAnswer(
  correctAnswerText: string,
  themeSlug: string,
): boolean {
  const norm = normalizeForMatch(correctAnswerText)
  const themeCore = normalizeForMatch(
    themeSlug.split('--')[0]?.replace(/-/g, ' ') ?? '',
  )
  return themeCore.length >= 4 && norm === themeCore
}

function parseAndCap(
  text: string,
  themeSlug: string,
  difficulty: Difficulty,
  batchId: string,
  now: string,
  contentMode: QuizContentMode,
  maxQuestions = 10,
): ParseOutcome {
  const extracted = extractJson(text)
  if (extracted?.erreur) {
    return {
      kind: 'theme_error',
      message: extracted.erreur,
    }
  }
  if (!extracted?.questions?.length) return { kind: 'invalid' }

  const questions: GeneratedQuestion[] = []
  // Diversité intra-lot : une bonne réponse ne doit apparaître qu'une fois,
  // et un élément mauvaise réponse ailleurs ne doit jamais devenir la bonne
  // réponse d'une autre question du même lot (et inversement).
  const usedCorrectAnswers = new Set<string>()
  const usedWrongAnswers = new Set<string>()
  // Quasi-doublons intra-lot : questions reformulées portant sur le même fait
  const acceptedKeywordSets: Set<string>[] = []

  // Compteurs de rejet par motif — loggés en résumé à la fin du lot.
  const rejected: Record<string, number> = {}
  const reject = (reason: string): true => {
    rejected[reason] = (rejected[reason] ?? 0) + 1
    return true
  }

  for (const raw of extracted.questions) {
    const answers = normalizeRawAnswers(raw)
    if (!answers || !raw.question) {
      reject('champsManquants')
      continue
    }
    const correctIndex = clampIndex(normalizeRawIndex(raw))
    const questionText =
      contentMode === 'image'
        ? normalizeImageQuestionText(String(raw.question))
        : String(raw.question).trim()

    // Mode texte : écarte les Q où la réponse est déjà dans l’énoncé.
    // Langues : ignorer la glose FR `(chat)` sinon « Comment dit-on chat… ? » / « 猫 (chat) » = faux positif.
    const leakAnswers = isLanguesThemeSlug(themeSlug)
      ? answers.map(stripTrailingGloss)
      : answers
    if (
      contentMode === 'standard' &&
      questionLeaksAnswer(questionText, leakAnswers, correctIndex)
    ) {
      reject('reponseDansEnonce')
      continue
    }

    // Doublons / quasi-doublons = plusieurs réponses potentiellement correctes
    if (hasDuplicateOrNearDuplicateAnswers(answers)) {
      reject('reponsesDupliquees')
      continue
    }

    // Langues : pas de sens FR dans les options ; écriture non latine → transcription latine
    if (isLanguesThemeSlug(themeSlug)) {
      if (answers.some((a) => answerHasFrenchSpoilerGloss(a, questionText))) {
        reject('langueSpoilerFr')
        continue
      }
      const missingRoma = answers.some(
        (a) =>
          answerNeedsLatinTranscription(a) && !answerHasLatinTranscription(a),
      )
      if (missingRoma) {
        reject('langueSansTranscription')
        continue
      }
    }

    // Quasi-doublon de question (même fait, reformulé) déjà accepté dans ce lot.
    // Langues : énoncés souvent du même moule (« Comment dit-on X… ») → ne pas massacrer le lot.
    const keywordSet = questionKeywordSet(questionText)
    if (
      !isLanguesThemeSlug(themeSlug) &&
      isNearDuplicateQuestion(keywordSet, acceptedKeywordSets)
    ) {
      reject('quasiDoublonQuestion')
      continue
    }

    const explanation = String(
      raw.explication ?? raw.explanation ?? '',
    ).trim()
    if (explanation.length < 12) {
      reject('explicationTropCourte')
      continue
    }
    // Langues : formulations du type « peut aussi se dire… » / synonymes fréquents
    if (
      !isLanguesThemeSlug(themeSlug) &&
      explanationSuggestsMultipleCorrect(explanation)
    ) {
      reject('plusieursReponsesPossibles')
      continue
    }

    const sourceType = normalizeSourceType(
      String(raw.source ?? raw.type_source ?? raw.sourceType ?? ''),
    )
    // Source nominative obligatoire — pas de fallback générique
    if (!sourceType) {
      reject('sourceManquanteOuVague')
      continue
    }

    // Anti-hallucination : rejeter si le modèle nie le fait ou source trop vague.
    // Langues : traductions courantes + source dico → accepter même si fait_verifiable omis/false.
    if (
      !isFactVerifiable(raw, sourceType) &&
      !(isLanguesThemeSlug(themeSlug) && !isVagueSource(sourceType))
    ) {
      reject('faitNonVerifiable')
      continue
    }

    // Cohérence question/réponse : catégorie contredite (ex: "quel animal" → réponse humaine)
    const correctAnswerText = answers[correctIndex] ?? ''
    if (hasCategoryMismatch(questionText, correctAnswerText, explanation)) {
      reject('categorieContredite')
      continue
    }

    // Indice d'inversion bonne/mauvaise réponse (explication citant une mauvaise réponse)
    const inversionAnswers = isLanguesThemeSlug(themeSlug)
      ? answers.map(stripTrailingGloss)
      : answers
    if (possibleAnswerInversion(inversionAnswers, correctIndex, explanation)) {
      reject('inversionProbable')
      continue
    }

    // Tautologie grossière (bonne réponse = nom du thème)
    if (isTautologicalAnswer(correctAnswerText, themeSlug)) {
      reject('tautologie')
      continue
    }

    // Diversité intra-lot des bonnes/mauvaises réponses
    const correctNorm = normalizeForMatch(correctAnswerText)
    const wrongNorms = answers
      .filter((_, i) => i !== correctIndex)
      .map(normalizeForMatch)
    if (usedCorrectAnswers.has(correctNorm)) {
      reject('bonneReponseDupliquee')
      continue
    }
    if (usedWrongAnswers.has(correctNorm)) {
      reject('mauvaiseReponseDevenueBonne')
      continue
    }
    if (wrongNorms.some((w) => usedCorrectAnswers.has(w))) {
      reject('bonneReponseDevenueMauvaise')
      continue
    }

    const rawDate = raw.date_reference ?? raw.dateReference
    const dateReference =
      rawDate === null || rawDate === undefined
        ? null
        : String(rawDate).trim() || null

    const imageSubject =
      contentMode === 'image'
        ? String(raw.sujet_image ?? raw.imageSubject ?? '').trim() || undefined
        : undefined
    const imageKind =
      contentMode === 'image'
        ? parseImageKind(raw.type_image ?? raw.imageKind) ?? 'sujet_entier'
        : undefined

    // Enregistrement pour les vérifications de diversité des questions suivantes
    usedCorrectAnswers.add(correctNorm)
    wrongNorms.forEach((w) => usedWrongAnswers.add(w))
    acceptedKeywordSets.push(keywordSet)

    questions.push(
      shuffleReponses({
        id: newId(),
        question: questionText,
        answers: answers as [string, string, string, string],
        correctIndex,
        difficulty,
        themeSlug,
        createdAt: now,
        batchId,
        explanation,
        sourceType,
        dateReference,
        imageSubject,
        imageKind,
        resumeFait: typeof raw.resume_fait === 'string' ? raw.resume_fait.trim() || undefined : undefined,
      }),
    )
  }

  const capped = questions.slice(0, maxQuestions)
  const totalRejected = Object.values(rejected).reduce((a, b) => a + b, 0)
  console.log(
    `[parseAndCap] theme=${themeSlug} difficulte=${difficulty} recues=${extracted.questions.length} acceptees=${capped.length} rejetees=${totalRejected} detail=${JSON.stringify(rejected)}`,
  )

  return capped.length > 0
    ? { kind: 'ok', questions: capped }
    : { kind: 'invalid' }
}

/** Mélange les positions A/B/C/D côté code (jamais dans le prompt). */
function shuffleReponses(q: GeneratedQuestion): GeneratedQuestion {
  const pairs = q.answers.map((text, i) => ({
    text,
    correct: i === q.correctIndex,
  }))
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pairs[i], pairs[j]] = [pairs[j], pairs[i]]
  }
  return {
    ...q,
    answers: pairs.map((p) => p.text) as [
      string,
      string,
      string,
      string,
    ],
    correctIndex: pairs.findIndex((p) => p.correct) as 0 | 1 | 2 | 3,
  }
}

async function enrichWithCommonsImages(
  questions: GeneratedQuestion[],
): Promise<GeneratedQuestion[]> {
  return Promise.all(
    questions.map(async (q): Promise<GeneratedQuestion> => {
      const correctLabel = q.answers[q.correctIndex]
      const subject = (q.imageSubject || correctLabel || '').trim()
      const kind = q.imageKind ?? 'sujet_entier'
      if (!subject) {
        const { imageSubject: _drop, ...safe } = q
        return safe
      }
      const imageUrl = await fetchCommonsImageUrl(
        subject,
        kind,
        correctLabel,
      )
      // garde imageSubject si pas d’URL → le client pourra retenter
      if (imageUrl) {
        const { imageSubject: _drop, ...safe } = q
        return { ...safe, imageUrl }
      }
      return { ...q, imageSubject: subject }
    }),
  )
}

function questionKey(q: GeneratedQuestion): string {
  return q.question.trim().toLowerCase()
}

async function generateOneTier(
  theme: string,
  themeSlug: string,
  difficulty: Difficulty,
  batchId: string,
  now: string,
  scope: 'fr' | 'international',
  provider: AiProvider,
  contentMode: QuizContentMode,
  excludeQuestions: string[] = [],
  questionCount = 5,
  budgetLimitMs = 14_000,
  onEngineSelected?: (engine: string) => void,
  prePickedSlot?: import('./aiRotate.js').PickedAi,
  promptMode: 'full' | 'topup' = 'full',
): Promise<
  | { questions: GeneratedQuestion[]; source: LlmEngine; model: string }
  | { error: string; themeInvalid?: boolean }
> {
  const prompt = buildPrompt(
    theme,
    difficulty,
    scope,
    contentMode,
    excludeQuestions,
    questionCount,
    promptMode,
  )
  const errors: string[] = []

  let pickedSlot: string | undefined
  if (provider === 'auto') {
    if (prePickedSlot) {
      pickedSlot = prePickedSlot.slot
    } else {
      const picked = await pickAiForGeneration()
      if (picked) pickedSlot = picked.slot
    }
  }

  const budgetMsClamped = Math.max(
    3_000,
    Math.min(
      budgetLimitMs,
      questionCount <= 2 ? 12_000 : questionCount <= 3 ? 14_000 : questionCount <= 5 ? 18_000 : 24_000,
    ),
  )
  const tierDeadline = Date.now() + budgetMsClamped
  const stickToPicked = provider === 'auto' && Boolean(pickedSlot)
  const primaryRoutes = await buildGenerationRoutes(
    provider,
    contentMode,
    pickedSlot,
    stickToPicked ? 'primary' : 'all',
  )
  const saturatedEngines = new Set<LlmEngine>()
  const tokenCappedModels = new Set<string>()
  let lastEngine: LlmEngine | undefined

  // Précharge les plafonds tokens / jour pour éviter les appels saturés.
  for (const r of primaryRoutes) {
    const key = `${r.engine}/${r.model}`
    if (tokenCappedModels.has(key)) continue
    try {
      if (await isModelDayTokenCapped(r.engine, r.model)) {
        tokenCappedModels.add(key)
      }
    } catch {
      /* ignore */
    }
  }

  if (primaryRoutes.length === 0) {
    return { error: 'Aucun provider IA disponible (clés API manquantes).' }
  }

  type TierOk = { questions: GeneratedQuestion[]; source: LlmEngine; model: string }
  type TierFail = { error: string; themeInvalid?: boolean }

  async function tryRoutes(routes: GenerationRoute[]): Promise<TierOk | TierFail | null> {
    for (const route of routes) {
      if (Date.now() >= tierDeadline) break
      if (saturatedEngines.has(route.engine)) continue
      const modelKey = `${route.engine}/${route.model}`
      if (tokenCappedModels.has(modelKey)) continue

      if (route.engine !== lastEngine) {
        onEngineSelected?.(route.engine)
        lastEngine = route.engine
      }

      const leftMs = tierDeadline - Date.now()
      // Moins de 8s = appel quasi inutile (provoquait "Délai dépassé (3s)" au rattrapage)
      if (leftMs < 8_000) break

      // Compound tronque souvent 10 Q → demander max 5 (le rattrapage complète).
      const routeAsk = /compound/i.test(route.model)
        ? Math.min(5, questionCount)
        : questionCount
      const routePrompt =
        routeAsk === questionCount
          ? prompt
          : buildPrompt(
              theme,
              difficulty,
              scope,
              contentMode,
              excludeQuestions,
              routeAsk,
              promptMode,
            )

      try {
        const llm = await withAiRetry(() =>
          route.engine === 'gemini'
            ? callGemini(route.apiKey, route.model, routePrompt, routeAsk, leftMs)
            : callOpenAiCompatible(
                route.engine as Exclude<LlmEngine, 'gemini'>,
                route.apiKey,
                route.model,
                routePrompt,
                routeAsk,
                leftMs,
              ),
        )
        const parsed = parseAndCap(
          llm.text,
          themeSlug,
          difficulty,
          batchId,
          now,
          contentMode,
          routeAsk,
        )
        if (parsed.kind === 'ok') {
          const questions =
            contentMode === 'image'
              ? await enrichWithCommonsImages(parsed.questions)
              : parsed.questions
          if (questions.length === 0) {
            const msg = `${route.engine}/${route.model}: aucune question valide (filtrées)`
            errors.push(msg)
            void recordAiModelError({
              engine: route.engine,
              model: route.model,
              kind: 'filtered',
              message: msg,
            })
            continue
          }
          void recordAiGeneration({
            engine: route.engine,
            model: route.model,
            mode: promptMode,
            tokensIn: llm.tokensIn,
            tokensOut: llm.tokensOut,
            questions: questions.length,
          })
          rememberWorkingRoute(route.engine, route.model)
          return { questions, source: route.engine, model: route.model }
        }
        if (parsed.kind === 'theme_error') {
          return { error: parsed.message, themeInvalid: true }
        }
        {
          const msg = `${route.engine}/${route.model}: JSON invalide · ${llm.text
            .slice(0, 140)
            .replace(/\s+/g, ' ')}`
          errors.push(msg)
          void recordAiModelError({
            engine: route.engine,
            model: route.model,
            kind: 'json_invalid',
            message: msg,
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(msg)
        console.warn(`[${route.engine}] ${route.model}:`, msg.slice(0, 200))
        void recordAiModelError({
          engine: route.engine,
          model: route.model,
          kind: classifyAiError(msg),
          message: `${route.engine}/${route.model}: ${msg}`,
        })
        // 429 quota org/clé → abandonner tout le provider
        if (isRateLimitError(msg) && !/high demand/i.test(msg)) {
          saturatedEngines.add(route.engine)
          continue
        }
        // 503 / high demand = ce modèle est saturé → essayer le suivant (même IA)
        if (/high demand|resource.exhausted|\b503\b/i.test(msg)) {
          continue
        }
        if (/\b404\b|no longer available|does not exist/i.test(msg)) {
          continue
        }
        if (/failed to validate json/i.test(msg)) {
          continue
        }
        if (isTimeoutLikeError(msg)) {
          continue
        }
      }
    }
    return null
  }

  try {
    const primaryHit = await tryRoutes(primaryRoutes)
    if (primaryHit) return primaryHit

    // Autre IA seulement si l’IA réservée a échoué (erreur / filtre / timeout…).
    if (stickToPicked && Date.now() < tierDeadline) {
      const fallbackRoutes = await buildGenerationRoutes(
        provider,
        contentMode,
        pickedSlot,
        'fallback',
      )
      for (const r of fallbackRoutes) {
        const key = `${r.engine}/${r.model}`
        if (tokenCappedModels.has(key)) continue
        try {
          if (await isModelDayTokenCapped(r.engine, r.model)) {
            tokenCappedModels.add(key)
          }
        } catch {
          /* ignore */
        }
      }
      if (fallbackRoutes.length > 0) {
        const fbHit = await tryRoutes(fallbackRoutes)
        if (fbHit) return fbHit
      }
    }
  } finally {
    await releaseAiSlot(pickedSlot)
  }

  return {
    error: pickBestGenerationError(errors),
  }
}

/** Message utilisateur : préfère une erreur non-429 si plusieurs providers ont échoué. */
function pickBestGenerationError(errors: string[]): string {
  if (errors.length === 0) return 'Aucun provider IA disponible'
  const nonRate = errors.filter((e) => !isRateLimitError(e))
  if (nonRate.length > 0) return nonRate[nonRate.length - 1]!
  return 'Toutes les IA free sont saturées (429). Réessaie dans 30 secondes.'
}

function isRateLimitError(msg: string): boolean {
  return /\b429\b|rate limit|too many requests|quota|resource.exhausted|resource_exhausted/i.test(
    msg,
  )
}

function isTimeoutLikeError(msg: string): boolean {
  return /504|503|524|502|délai dépassé|timeout|timed out|gateway|abort/i.test(
    msg,
  )
}

/** Pas de re-essai timeout (brûle le budget Vercel) — on bascule d’IA. */
async function withAiRetry<T>(fn: () => Promise<T>): Promise<T> {
  return fn()
}

/** Schéma minimal d’une question prête pour le front */
function isStrictQuestion(q: GeneratedQuestion): boolean {
  if (!q.question?.trim()) return false
  if (!Array.isArray(q.answers) || q.answers.length !== 4) return false
  if (q.answers.some((a) => !String(a).trim())) return false
  if (q.correctIndex !== 0 && q.correctIndex !== 1 && q.correctIndex !== 2 && q.correctIndex !== 3) {
    return false
  }
  if (!q.explanation || q.explanation.trim().length < 12) return false
  if (!q.sourceType || q.sourceType.trim().length < 4) return false
  if (isVagueSource(q.sourceType)) return false
  return true
}

function assertExactBatch(
  questions: GeneratedQuestion[],
  expected: number,
): GeneratedQuestion[] | null {
  const valid = questions.filter(isStrictQuestion)
  if (valid.length < expected) return null
  return valid.slice(0, expected)
}

export type GenProgressCb = (
  done: number,
  total: number,
  engine?: string,
  stage?: string,
) => void | Promise<void>

export type GenerateQuestionsResult = {
  questions: GeneratedQuestion[]
  source: GenerateSource
  message?: string
  error?: string
  partial?: boolean
  received?: number
  target?: number
}

/**
 * Un seul palier par appel. provider: auto | groq | gemini | cerebras | deepseek | openrouter.
 * Lots de 3 + garde-fou 50s (sous le kill Vercel 60s).
 * allowPartial: si true, un lot 1–9 est renvoyé sans error (partial/received/target).
 * seedQuestions: lot incomplet déjà validé (cache 5 min) — on ne régénère que les manquantes.
 */
export async function generateQuestions(
  theme: string,
  themeSlug: string,
  mode: 'initial' | 'complementary',
  difficulty?: Difficulty,
  scope: 'fr' | 'international' = 'fr',
  provider: AiProvider = 'auto',
  contentMode: QuizContentMode = 'standard',
  excludeQuestions: string[] = [],
  onProgress?: GenProgressCb,
  allowPartial = false,
  /** Multi topup : garder la même IA qu’au lot précédent (sauf erreur). */
  stickyEngine?: RotateEngine,
  seedQuestions: GeneratedQuestion[] = [],
  flagCount?: number,
  flagDifficulty?: string,
): Promise<GenerateQuestionsResult> {
  if (isFlagTheme(theme)) {
    try {
      const questions = buildFlagQuiz({
        difficulty: flagDifficulty ?? difficulty ?? 'easy',
        count: flagCount ?? 10,
        themeSlug,
      }) as GeneratedQuestion[]
      if (questions.length < 1) {
        return {
          questions: [],
          source: 'flags',
          error: 'Impossible de constituer le quiz drapeaux.',
        }
      }
      if (onProgress) await onProgress(questions.length, questions.length, 'flags', 'Drapeaux')
      return { questions, source: 'flags' }
    } catch (e) {
      return {
        questions: [],
        source: 'flags',
        error: e instanceof Error ? e.message : 'Erreur quiz drapeaux',
      }
    }
  }

  const HARD_MS = 58_000
  const TARGET = 10
  /** Partagé avec Inner : lisible si le timeout gagne la race. */
  const collected: GeneratedQuestion[] = []

  function hardFail(error: string): GenerateQuestionsResult {
    return { questions: [], source: 'mock', error }
  }

  function partialOrHardFail(error: string): GenerateQuestionsResult {
    if (allowPartial && collected.length > 0) {
      return {
        questions: collected.slice(),
        source: 'mock',
        partial: true,
        received: collected.length,
        target: TARGET,
      }
    }
    return hardFail(error)
  }

  try {
    return await Promise.race([
      generateQuestionsInner(
        theme,
        themeSlug,
        mode,
        difficulty,
        scope,
        provider,
        contentMode,
        excludeQuestions,
        onProgress,
        HARD_MS,
        collected,
        allowPartial,
        stickyEngine,
        seedQuestions,
      ),
      new Promise<GenerateQuestionsResult>((resolve) => {
        setTimeout(() => {
          resolve(
            partialOrHardFail(
              'Génération trop longue (limite serveur). Réessaie dans quelques secondes.',
            ),
          )
        }, HARD_MS)
      }),
    ])
  } catch (e) {
    return partialOrHardFail(
      e instanceof Error ? e.message : 'Erreur de génération',
    )
  }
}

/**
 * Comme generateQuestions, plus lecture/écriture du cache 5 min (lots 1–9).
 * Utilisé par les API solo. Le multi passe le seed lui-même (salle + cache).
 */
export async function generateQuestionsWithPartialCache(
  theme: string,
  themeSlug: string,
  mode: 'initial' | 'complementary',
  difficulty?: Difficulty,
  scope: 'fr' | 'international' = 'fr',
  provider: AiProvider = 'auto',
  contentMode: QuizContentMode = 'standard',
  excludeQuestions: string[] = [],
  onProgress?: GenProgressCb,
  allowPartial = false,
  stickyEngine?: RotateEngine,
  flagCount?: number,
  flagDifficulty?: string,
): Promise<GenerateQuestionsResult> {
  if (isFlagTheme(theme)) {
    return generateQuestions(
      theme,
      themeSlug,
      mode,
      difficulty,
      scope,
      provider,
      contentMode,
      excludeQuestions,
      onProgress,
      allowPartial,
      stickyEngine,
      [],
      flagCount,
      flagDifficulty,
    )
  }
  const tier: Difficulty =
    difficulty === 'medium' || difficulty === 'hard' ? difficulty : 'easy'
  const seed = (await getPartialQuestions(themeSlug, tier)) as GeneratedQuestion[]
  const result = await generateQuestions(
    theme,
    themeSlug,
    mode,
    difficulty,
    scope,
    provider,
    contentMode,
    excludeQuestions,
    onProgress,
    allowPartial,
    stickyEngine,
    seed,
  )
  await syncPartialQuestionCache(themeSlug, tier, result.questions)
  return result
}

async function generateQuestionsInner(
  theme: string,
  themeSlug: string,
  mode: 'initial' | 'complementary',
  difficulty: Difficulty | undefined,
  scope: 'fr' | 'international',
  provider: AiProvider,
  contentMode: QuizContentMode,
  excludeQuestions: string[],
  onProgress: GenProgressCb | undefined,
  hardMs: number,
  collected: GeneratedQuestion[],
  allowPartial: boolean,
  stickyEngine?: RotateEngine,
  seedQuestions: GeneratedQuestion[] = [],
): Promise<GenerateQuestionsResult> {
  void mode
  const batchId = newId()
  const now = new Date().toISOString()
  const tier: Difficulty =
    difficulty === 'medium' || difficulty === 'hard' ? difficulty : 'easy'
  const TARGET = 10
  const startedAt = Date.now()

  let reportedEngine: string | undefined

  async function report(
    done: number,
    engine?: string,
    stage?: string,
  ): Promise<void> {
    try {
      const eng = engine ?? reportedEngine
      await onProgress?.(Math.min(TARGET, Math.max(0, done)), TARGET, eng, stage)
    } catch {
      /* UI only */
    }
  }

  // Garde une marge avant le timeout global + réserve pour un vrai rattrapage.
  const TOPUP_RESERVE_MS = 16_000
  const TOPUP_MIN_MS = 12_000
  const deadline = startedAt + hardMs - 4_000
  const seen = new Set<string>()
  const excluded = new Set(
    excludeQuestions.map((q) => q.trim().toLowerCase().replace(/\s+/g, ' ')),
  )
  let excludeLive = [...excludeQuestions]
  let lastSource: LlmEngine | null = null
  let lastModel = ''
  let lastError: string | undefined
  // Cross-appel (lot principal + topups) : diversité des bonnes réponses et
  // quasi-doublons de question (même fait, reformulé) déjà collectés.
  const collectedCorrectAnswers = new Set<string>()
  const collectedKeywordSets: Set<string>[] = []
  // Compteurs de rejet cross-appel — loggés en résumé en fin de génération.
  const ingestRejected: Record<string, number> = {}
  let ingestAccepted = 0

  function ingestKey(q: GeneratedQuestion): string {
    // Deezer : dédup par piste — les énoncés se ressemblent (mêmes gabarits)
    if (contentMode === 'audio') {
      const trackId = String(q.deezerTrackId ?? '').trim()
      if (trackId) return `dz:${trackId}`
      const preview = String(q.previewUrl ?? '').trim()
      if (preview) return `pv:${preview}`
    }
    return questionKey(q)
  }

  function ingest(qs: GeneratedQuestion[]): void {
    for (const q of qs) {
      if (q.difficulty !== tier) continue
      if (contentMode === 'image' && !q.imageUrl && !q.imageSubject) continue
      if (contentMode === 'audio' && !q.previewUrl) continue
      const key = ingestKey(q)
      if (seen.has(key) || excluded.has(key)) {
        ingestRejected.doublonExact = (ingestRejected.doublonExact ?? 0) + 1
        continue
      }

      const correctAnswerNorm = normalizeForMatch(q.answers[q.correctIndex] ?? '')
      if (collectedCorrectAnswers.has(correctAnswerNorm)) {
        ingestRejected.bonneReponseDupliqueeCrossAppel =
          (ingestRejected.bonneReponseDupliqueeCrossAppel ?? 0) + 1
        continue
      }

      // Anti-quasi-doublon = logique IA (même fait reformulé). Inutile / nocif pour Deezer.
      if (contentMode !== 'audio') {
        const keywordSet = questionKeywordSet(q.question)
        if (isNearDuplicateQuestion(keywordSet, collectedKeywordSets)) {
          ingestRejected.quasiDoublonCrossAppel =
            (ingestRejected.quasiDoublonCrossAppel ?? 0) + 1
          continue
        }
        collectedKeywordSets.push(keywordSet)
      }

      seen.add(key)
      excluded.add(key)
      collectedCorrectAnswers.add(correctAnswerNorm)
      collected.push(q)
      excludeLive.push(
        contentMode === 'audio' && q.deezerTrackId
          ? String(q.deezerTrackId)
          : q.question,
      )
      ingestAccepted += 1
      if (collected.length >= TARGET) break
    }
  }

  if (seedQuestions.length > 0) {
    ingest(seedQuestions)
    await report(
      collected.length,
      undefined,
      collected.length >= TARGET
        ? 'Terminé'
        : `Reprise (${collected.length}/10)`,
    )
    if (collected.length >= TARGET) {
      const strict = assertExactBatch(collected, TARGET)
      if (strict) {
        return {
          questions: strict,
          source: 'bank',
          message: 'Complété depuis le cache (5 min)',
        }
      }
    }
  }

  // Quiz musical Deezer — parcours 100 % séparé (jamais d’appel IA)
  if (contentMode === 'audio') {
    reportedEngine = 'deezer'
    await report(collected.length, 'deezer', 'Tirage Deezer…')
    const missing = Math.max(0, TARGET - collected.length)
    if (missing === 0) {
      await report(TARGET, 'deezer', 'Terminé')
      return {
        questions: collected.slice(0, TARGET),
        source: 'deezer',
        message: 'Complété depuis le cache (5 min)',
      }
    }
    const deezer = await buildDeezerQuiz({
      theme,
      themeSlug,
      difficulty: tier,
      scope,
      excludeQuestions: [
        ...excludeQuestions,
        ...collected.flatMap((q) =>
          [q.deezerTrackId, q.previewUrl, q.question].filter(
            (x): x is string => Boolean(x),
          ),
        ),
      ],
      count: missing,
    })
    if ('error' in deezer) {
      if (allowPartial && collected.length > 0) {
        return {
          questions: collected.slice(),
          source: 'deezer',
          partial: true,
          received: collected.length,
          target: TARGET,
        }
      }
      return { questions: [], source: 'deezer', error: deezer.error }
    }
    ingest(deezer.questions)
    if (collected.length < TARGET) {
      if (allowPartial && collected.length > 0) {
        return {
          questions: collected.slice(),
          source: 'deezer',
          partial: true,
          received: collected.length,
          target: TARGET,
        }
      }
      return {
        questions: [],
        source: 'deezer',
        error: `Pas assez de questions musicales (${collected.length}/${TARGET}). Réessaie.`,
      }
    }
    await report(TARGET, 'deezer', 'Terminé')
    return {
      questions: collected.slice(0, TARGET),
      source: 'deezer',
      message: deezer.message,
    }
  }

  const hasKey = AUTO_FREE_ENGINES.some((e) => keysForEngine(e).length > 0)

  // Pré-réserver le slot IA et signaler le provider IMMÉDIATEMENT (avant tout appel IA)
  let prePickedSlot: import('./aiRotate.js').PickedAi | undefined
  if (hasKey && provider === 'auto') {
    const picked = stickyEngine
      ? ((await pickAiForEngine(stickyEngine)) ??
        (await pickAiForGeneration()))
      : await pickAiForGeneration()
    if (picked) {
      prePickedSlot = picked
      reportedEngine = picked.engine
      await report(collected.length, picked.engine, 'Connexion IA')
    }
  } else if (hasKey && provider !== 'auto') {
    reportedEngine = provider
    await report(collected.length, provider, 'Connexion IA')
  }

  if (!hasKey) {
    if (allowPartial && collected.length > 0) {
      return {
        questions: collected.slice(),
        source: 'mock',
        partial: true,
        received: collected.length,
        target: TARGET,
      }
    }
    const mock = buildMockQuestions(theme, themeSlug, 'complementary', tier)
    await report(TARGET)
    return {
      questions: mock,
      source: 'mock',
      message:
        'Aucune clé API free — questions mock. Ajoute GROQ_API_KEY ou GEMINI_API_KEY.',
    }
  }

  function logIngestSummary(): void {
    const totalRejected = Object.values(ingestRejected).reduce((a, b) => a + b, 0)
    console.log(
      `[ingest] theme=${themeSlug} tier=${tier} acceptees=${ingestAccepted} rejetees=${totalRejected} detail=${JSON.stringify(ingestRejected)}`,
    )
  }

  async function runBatch(
    count: number,
    maxBudgetMs: number,
    slotOverride?: import('./aiRotate.js').PickedAi,
    mode: 'full' | 'topup' = 'full',
  ): Promise<{ ok: boolean; themeInvalid?: boolean }> {
    const left = deadline - Date.now()
    if (left < 2_000) return { ok: false }
    const ask = Math.max(1, Math.min(TARGET, count))
    const result = await generateOneTier(
      theme,
      themeSlug,
      tier,
      batchId,
      now,
      scope,
      provider,
      contentMode,
      excludeLive,
      ask,
      Math.min(left, maxBudgetMs),
      (engine) => {
        reportedEngine = engine
        void report(collected.length, engine)
      },
      slotOverride,
      mode,
    )
    if ('error' in result) {
      lastError = result.error
      if (result.themeInvalid) return { ok: false, themeInvalid: true }
      return { ok: false }
    }
    lastSource = result.source
    lastModel = result.model
    // Mémoriser le premier engine connu pour tous les reports suivants
    if (!reportedEngine) reportedEngine = result.source
    ingest(result.questions)
    await report(collected.length, result.source)
    return { ok: collected.length > 0 }
  }

  // Appel principal: réserve du temps pour un rattrapage utile (≥12s).
  // Si le cache a déjà des Q, on ne demande que les manquantes (mode topup).
  const missingMain = TARGET - collected.length
  const leftForMain = Math.max(
    8_000,
    deadline - Date.now() - TOPUP_RESERVE_MS,
  )
  if (missingMain > 0) {
    const currentEngine = reportedEngine ?? prePickedSlot?.engine ?? stickyEngine
    const rattrapSlot = await pickRattrapageSlot(
      provider,
      currentEngine,
      collected.length,
    )
    const mainSlot = rattrapSlot ?? prePickedSlot
    if (rattrapSlot) {
      reportedEngine = rattrapSlot.engine
    }
    await report(
      collected.length,
      reportedEngine,
      collected.length > 0
        ? `Rattrapage ${reportedEngine ?? 'IA'} (${missingMain} manquantes)`
        : 'Génération en cours',
    )
    const single = await runBatch(
      missingMain,
      Math.min(30_000, leftForMain),
      mainSlot,
      collected.length > 0 ? 'topup' : 'full',
    )
    if (single.themeInvalid && lastError) {
      return { questions: [], source: 'mock', error: lastError }
    }
  }

  await report(collected.length, reportedEngine, 'Validation des questions')

  // Rattrapage unique: seulement s'il reste assez de temps pour un vrai appel IA.
  if (collected.length < TARGET) {
    const missing = TARGET - collected.length
    const leftAfterMain = Math.max(0, deadline - Date.now())
    if (missing > 0 && leftAfterMain >= TOPUP_MIN_MS) {
      await report(
        collected.length,
        reportedEngine,
        `Rattrapage ${reportedEngine ?? 'IA'} (${missing} manquantes)`,
      )
      const topUpErrorBefore = lastError
      const topUpSlot = await pickRattrapageSlot(
        provider,
        reportedEngine ?? prePickedSlot?.engine ?? stickyEngine,
        collected.length,
      )
      if (topUpSlot) {
        reportedEngine = topUpSlot.engine
        await report(
          collected.length,
          reportedEngine,
          `Rattrapage ${reportedEngine} (${missing} manquantes)`,
        )
      }
      const topUp = await runBatch(
        missing,
        Math.min(TOPUP_RESERVE_MS, leftAfterMain),
        topUpSlot,
        'topup',
      )
      if (topUp.themeInvalid && lastError) {
        return { questions: [], source: 'mock', error: lastError }
      }
      // Timeout rattrapage : ne pas masquer le vrai problème (lot incomplet)
      if (
        collected.length < TARGET &&
        lastError &&
        /délai dépassé/i.test(lastError)
      ) {
        lastError = topUpErrorBefore
      }
      await report(collected.length, reportedEngine, 'Validation finale')
    } else if (missing > 0) {
      console.warn(
        `[topup] ignoré — budget restant insuffisant (${leftAfterMain}ms < ${TOPUP_MIN_MS}ms)`,
      )
    }
  }

  logIngestSummary()

  if (collected.length < TARGET) {
    if (allowPartial && collected.length > 0) {
      return {
        questions: collected.slice(),
        source: lastSource ?? 'mock',
        partial: true,
        received: collected.length,
        target: TARGET,
      }
    }
    const timeoutLike = lastError && /délai dépassé/i.test(lastError)
    return {
      questions: [],
      source: 'mock',
      error:
        !lastError || timeoutLike
          ? `Pas assez de questions valides (${collected.length}/${TARGET}). Réessaie.`
          : `Génération impossible (${lastError.slice(0, 160)}). Réessaie.`,
    }
  }

  const strict = assertExactBatch(collected, TARGET)
  if (!strict) {
    return {
      questions: [],
      source: 'mock',
      error:
        'JSON invalide : le lot ne contient pas exactement 10 questions conformes. Réessaie.',
    }
  }

  await report(TARGET, reportedEngine, 'Finalisation')
  return {
    questions: strict,
    source: lastSource ?? 'mock',
    message: `Généré avec ${lastSource} (${lastModel}) — ${tier}`,
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error(`Délai dépassé (${Math.round(ms / 1000)}s)`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function callOpenAiCompatible(
  engine: Exclude<LlmEngine, 'gemini'>,
  apiKey: string,
  model: string,
  prompt: string,
  questionCount = 10,
  timeoutBudgetMs = 11_000,
): Promise<LlmCallResult> {
  const endpoints: Record<Exclude<LlmEngine, 'gemini'>, string> = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    cerebras: 'https://api.cerebras.ai/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  }
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  }
  if (engine === 'openrouter') {
    headers['HTTP-Referer'] = 'https://quizz-by-ia.vercel.app'
    headers['X-Title'] = 'Quizz By IA'
  }

  // Compound partage le budget avec outils/raisonnement → JSON 10 Q souvent coupé sous 4k.
  const maxTokens = /compound/i.test(model)
    ? questionCount <= 5
      ? 6_000
      : 8_192
    : /gpt-oss/i.test(model)
      ? questionCount <= 3
        ? 4_000
        : questionCount <= 5
          ? 6_000
          : 8_000
      : questionCount <= 2
        ? 1_400
        : questionCount <= 3
          ? 1_400
          : questionCount <= 5
            ? 2_000
            : 2_800
  const timeoutMs = Math.max(
    2_500,
    Math.min(
      /compound/i.test(model)
        ? questionCount <= 5
          ? 22_000
          : 28_000
        : /gpt-oss/i.test(model)
          ? questionCount <= 5
            ? 16_000
            : 22_000
        : questionCount <= 2
          ? 12_000
          : questionCount <= 5
            ? 14_000
            : 18_000,
      timeoutBudgetMs,
    ),
  )

  // Groq gpt-oss + json_object → 400 "Failed to validate JSON"
  // Groq en général : on parse nous-mêmes (plus fiable sur free tier)
  const useJsonObject =
    engine !== 'groq' && !/gpt-oss/i.test(model)

  async function once(withJsonObject: boolean): Promise<LlmCallResult> {
    const payload: Record<string, unknown> = {
      model,
      temperature: 0.15,
      messages: [
        { role: 'system', content: AI_SYSTEM_MINIMAL },
        { role: 'user', content: prompt },
      ],
    }
    if (/gpt-oss/i.test(model)) {
      payload.reasoning_effort = 'low'
      payload.max_completion_tokens = maxTokens
    } else {
      payload.max_tokens = maxTokens
    }
    if (withJsonObject) {
      payload.response_format = { type: 'json_object' }
    }

    const res = await fetchWithTimeout(
      endpoints[engine],
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
      timeoutMs,
    )

    if (!res.ok) {
      const detail = await res.text()
      throw new Error(
        `${engine} ${res.status} (${model}): ${detail.slice(0, 400)}`,
      )
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string; reasoning?: string }
      }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        prompt_tokens_details?: {
          cached_tokens?: number
        }
      }
    }
    const msg = data.choices?.[0]?.message
    const content = String(msg?.content ?? '').trim()
    const reasoning = String(msg?.reasoning ?? '').trim()
    const jsonish =
      [content, reasoning].find((t) => t.includes('{') && t.includes('questions')) ??
      [content, reasoning].find((t) => t.includes('{')) ??
      content
    if (jsonish) {
      const tokensIn = data.usage?.prompt_tokens ?? 0
      const tokensCached = data.usage?.prompt_tokens_details?.cached_tokens ?? 0
      // Log de vérification cache — à retirer/passer en debug une fois le comportement confirmé.
      console.log(
        `[cache] ${engine}/${model}: tokensIn=${tokensIn} cached=${tokensCached} (${tokensIn > 0 ? Math.round((tokensCached / tokensIn) * 100) : 0}%)`,
      )
      return {
        text: jsonish,
        tokensIn,
        tokensOut: data.usage?.completion_tokens ?? 0,
        tokensCached,
      }
    }
    throw new Error(`${engine}/${model}: réponse vide`)
  }

  try {
    return await once(useJsonObject)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Si json_object a échoué → 1 retry sans format forcé
    if (useJsonObject && /failed to validate json|400/i.test(msg)) {
      return await once(false)
    }
    throw e
  }
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  questionCount = 10,
  timeoutBudgetMs = 11_000,
): Promise<LlmCallResult> {
  const key = apiKey.trim()
  const maxTokens = questionCount <= 2 ? 1400 : questionCount <= 3 ? 1400 : questionCount <= 5 ? 2000 : 2800
  const timeoutMs = Math.max(
    8_000,
    Math.min(14_000, timeoutBudgetMs),
  )
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AI_SYSTEM_MINIMAL }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    },
    timeoutMs,
  )

  if (!res.ok) {
    const detail = await res.text()
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Gemini ${res.status} : clé invalide ou non autorisée. Crée une clé sur https://aistudio.google.com/apikey et mets-la dans GEMINI_API_KEY (Vercel + .env).`,
      )
    }
    throw new Error(`Gemini ${res.status} (${model}): ${detail.slice(0, 400)}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      cachedContentTokenCount?: number
    }
  }
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('\n') ??
    ''
  const tokensIn = data.usageMetadata?.promptTokenCount ?? 0
  const tokensCached = data.usageMetadata?.cachedContentTokenCount ?? 0
  // Log de vérification cache — à retirer/passer en debug une fois le comportement confirmé.
  console.log(
    `[cache] gemini/${model}: tokensIn=${tokensIn} cached=${tokensCached} (${tokensIn > 0 ? Math.round((tokensCached / tokensIn) * 100) : 0}%)`,
  )
  return {
    text,
    tokensIn,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
    tokensCached,
  }
}

function clampIndex(n: number): 0 | 1 | 2 | 3 {
  const i = Number(n)
  if (i === 1 || i === 2 || i === 3) return i
  return 0
}

/**
 * Récupère les objets JSON complets d’un tableau tronqué
 * (ex. coupure mid-champ après max_tokens).
 */
function salvageCompleteJsonObjects(text: string): RawQuestion[] {
  const start = text.indexOf('[')
  if (start < 0) return []
  const out: RawQuestion[] = []
  let i = start + 1
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i]!)) i++
    if (i >= text.length || text[i] === ']') break
    if (text[i] !== '{') break
    let depth = 0
    let inStr = false
    let esc = false
    let j = i
    for (; j < text.length; j++) {
      const c = text[j]!
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) {
          j++
          break
        }
      }
    }
    if (depth !== 0) break
    try {
      const obj = JSON.parse(text.slice(i, j)) as RawQuestion
      if (obj && typeof obj === 'object') out.push(obj)
    } catch {
      break
    }
    i = j
  }
  return out
}

function extractJson(text: string): {
  questions?: RawQuestion[]
  erreur?: string
} | null {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1].trim() : trimmed

  const normalize = (
    data: unknown,
  ): { questions?: RawQuestion[]; erreur?: string } | null => {
    if (Array.isArray(data)) return { questions: data as RawQuestion[] }
    if (!data || typeof data !== 'object') return null
    const obj = data as {
      questions?: unknown
      erreur?: unknown
      error?: unknown
    }
    if (typeof obj.erreur === 'string' && obj.erreur.trim()) {
      return { erreur: obj.erreur.trim() }
    }
    if (typeof obj.error === 'string' && obj.error.trim()) {
      return { erreur: obj.error.trim() }
    }
    if (Array.isArray(obj.questions)) {
      return { questions: obj.questions as RawQuestion[] }
    }
    return null
  }

  try {
    return normalize(JSON.parse(candidate))
  } catch {
    const objStart = candidate.indexOf('{')
    const objEnd = candidate.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
      try {
        const n = normalize(JSON.parse(candidate.slice(objStart, objEnd + 1)))
        if (n) return n
      } catch {
        /* continue */
      }
    }
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      try {
        return normalize(JSON.parse(candidate.slice(arrStart, arrEnd + 1)))
      } catch {
        /* truncated — salvage below */
      }
    }
    const salvaged = salvageCompleteJsonObjects(candidate)
    if (salvaged.length > 0) return { questions: salvaged }
    return null
  }
}
