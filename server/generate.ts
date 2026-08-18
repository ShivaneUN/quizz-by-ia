/**
 * Génération de questions — multi-providers IA (choix + fallback Auto).
 * Clés API uniquement côté serveur (.env).
 */

import { fetchCommonsImageUrl } from './wikimedia.js'
import { buildDeezerQuiz } from './deezerQuiz.js'
import {
  enginesWithKeys,
  fallbackEngines,
  listApiKeys,
  pickAiForGeneration,
  releaseAiSlot,
  type RotateEngine,
} from './aiRotate.js'

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
  | 'mock'

export interface GeneratedQuestion {
  id: string
  question: string
  answers: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
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
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

type LlmEngine = Exclude<AiProvider, 'auto'>

const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
] as const

/** Flash uniquement — 2.5-flash retiré pour les nouveaux comptes */
const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
] as const

const CEREBRAS_MODELS = ['gemma-4-31b', 'gpt-oss-120b', 'zai-glm-4.7'] as const
const DEEPSEEK_MODELS = ['deepseek-chat'] as const
/** Uniquement modèles :free OpenRouter (après 10$ → ~1000 req/jour). */
const OPENROUTER_MODELS = [
  'openai/gpt-oss-20b:free',
  'google/gemma-4-31b-it:free',
  'openrouter/free',
] as const

const AI_SYSTEM = `Tu es un générateur de quiz expert et rigoureux. JSON uniquement.
Succès: tableau de N questions OU {"questions":[...]}.
Échec thème: {"erreur":"..."}.
Chaque question: question, reponses (4), bonne_reponse_index, explication, source, date_reference, theme, sous_theme, difficulte, portee, justification_difficulte, fait_verifiable.
1 seule bonne réponse. Faits vérifiables. Français naturel. Fidélité stricte au thème. Pas d’URL ni titre d’article inventé.`

/** Auto = free only (Cerebras/DeepSeek payants exclus pour l’instant). */
const AUTO_FREE_ENGINES: LlmEngine[] = ['groq', 'gemini', 'openrouter']

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
  const cap = contentMode === 'image' ? 2 : 99
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
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

/** Calibrage STRICT — un seul module injecté selon la difficulté demandée. */
function difficultyModule(difficulty: Difficulty, sousTheme: string): string {
  if (difficulty === 'easy') {
    return `NIVEAU FACILE — STRICT
- Uniquement des faits "spectateur/grand public" (ce que perçoit un consommateur passif) — jamais de faits "coulisses/technique" (production, stats précises, dates exactes, pros non médiatisés).
- INTERDIT en facile, quel que soit le thème : réalisateur, scénariste, producteur, compositeur, label, développeur, studio, architecte, inventeur/chef créateur — même si célèbre. Reclasse en moyen/difficile.
- Le facile doit être NETTEMENT plus simple que le moyen, pas une variante légère. Priorise systématiquement le fait le PLUS connu du sujet.
- Test de validation : une personne au hasard dans la rue, sans intérêt pour ${sousTheme}, devine/connaît-elle la réponse par simple exposition culturelle (télé, école, conversations) ? Si non → reclasse.
- En cas de doute entre deux formulations, choisis toujours la plus simple.
- Ancrage : côté SPECTATEUR du calibrage thème (faits connus / grand public), jamais le côté coulisses.`
  }
  if (difficulty === 'medium') {
    return `NIVEAU MOYEN — STRICT
- Cible : une personne qui suit le sujet occasionnellement (lit parfois des articles, regarde des documentaires, discute du sujet entre amis) — ni un novice total, ni un passionné pointu.
- INTERDIT de retomber dans le facile "déguisé" : si le fait est devinable par quelqu'un sans aucun intérêt pour ${sousTheme} (test grand public), ce n'est pas moyen, remonte le niveau de détail.
- INTERDIT de monter au niveau difficile : pas de statistiques ultra-précises, pas de dates exactes secondaires, pas de faits réservés aux spécialistes — reste dans une zone de "curiosité qui demande un peu de réflexion ou de recoupement", pas de mémorisation experte.
- Les rôles de production (réalisateur, compositeur, développeur...) SONT autorisés ici, mais seulement s'ils sont notoires dans leur domaine — pas des noms obscurs réservés aux crédits de fin.
- Test de validation : quelqu'un qui a un intérêt modéré et régulier pour ${sousTheme} (pas un expert) devrait pouvoir répondre en réfléchissant un peu ou en faisant un lien logique, sans certitude immédiate ni ignorance totale.
- Ancrage : entre spectateur et coulisses — détails connus des curieux, pas trivia de passionné.`
  }
  return `NIVEAU DIFFICILE — STRICT
- Cible : un passionné/connaisseur réel du sujet — pas un expert académique ou professionnel du domaine, sauf si le sous-thème l'exige clairement.
- Les faits précis (statistiques, dates exactes, détails techniques, noms de professionnels peu médiatisés) sont autorisés ET attendus ici — mais TOUJOURS vérifiables dans des sources fiables, jamais des détails si obscurs qu'ils sont invérifiables ou quasi impossibles à documenter.
- INTERDIT de générer une question à laquelle même un passionné aurait une chance quasi nulle de répondre (trivia extrême, anecdote ultra-confidentielle, détail non documenté publiquement) — le difficile doit rester "gagnable" par la bonne personne, pas être un piège impossible.
- INTERDIT d'utiliser un fait dont l'exactitude est disputée entre sources ou repose sur une seule source peu fiable — la règle "vérifiable et non inventé" s'applique avec la même rigueur qu'en facile, seule la notoriété du fait change.
- Test de validation : un connaisseur reconnu du sujet ${sousTheme} (pas un expert professionnel) répondrait-il correctement sans avoir besoin de rechercher l'information ? Si même ce profil ne saurait probablement pas, la question est trop obscure — remplace-la par un fait difficile mais accessible à ce niveau de passion.
- Ancrage : côté COULISSES du calibrage thème (précis / technique / connaisseur), jamais du facile déguisé.`
}

function levelAutoCheck(difficulty: Difficulty): string {
  if (difficulty === 'easy') {
    return 'Facile = vraiment facile, pas de rôle production, pas de fait moyen déguisé.'
  }
  if (difficulty === 'medium') {
    return 'Moyen = ni facile déguisé ni difficile déguisé, rôles de production autorisés seulement si notoires.'
  }
  return 'Difficile = gagnable par un vrai passionné, jamais une trivia invérifiable ou quasi impossible.'
}

/**
 * Prompt composé : tronc commun (qualité) + 1 module difficulté + auto-vérif ciblée.
 * Évite d’envoyer les 3 calibrages à chaque génération.
 */
export function buildPrompt(
  themeFull: string,
  difficulty: Difficulty,
  scope: 'fr' | 'international',
  _contentMode: QuizContentMode,
  excludeQuestions: string[] = [],
  questionCount = 10,
): string {
  const { theme, sousTheme } = splitThemeParts(themeFull)
  const difficulte = DIFFICULTY_FR[difficulty]
  const portee = SCOPE_FR[scope]
  const n = Math.max(1, Math.min(10, questionCount))
  const historique =
    excludeQuestions.length === 0
      ? '(aucune — première génération)'
      : excludeQuestions
          .map((q) => q.trim())
          .filter(Boolean)
          .slice(0, 60)
          .map((q, i) => `${i + 1}. ${q}`)
          .join('\n')

  const niveau = difficultyModule(difficulty, sousTheme)
  const checkNiveau = levelAutoCheck(difficulty)

  return `Tu es un générateur de quiz expert et rigoureux. Génère EXACTEMENT ${n} questions à choix multiples sur le thème "${theme}", sous-thème "${sousTheme}", niveau "${difficulte}", portée "${portee}".

Historique à ne jamais répéter (questions déjà posées, tous niveaux) :
${historique}

FIABILITÉ
- Faits réels, vérifiables, jamais inventés. Si incertain à 100%, remplace la question.
- 1 seule bonne réponse par question. Les 3 fausses sont plausibles mais indiscutablement fausses dans TOUT contexte — teste chacune mentalement avant validation.
- Si une reformulation ne garantit pas une réponse unique, abandonne la question.

LANGUE / PÉRIMÈTRE
- Français naturel et fluide, comme rédigé directement par un francophone natif — jamais de traduction littérale de l'anglais, jamais de tournure calquée ou de syntaxe étrangère.
- Relis chaque question et réponse en te demandant : "Est-ce que je dirais ça naturellement à l'oral en français ?" Si la formulation sonne traduite ou artificielle, réécris-la entièrement plutôt que de l'ajuster.
- Vocabulaire adapté au contexte francophone (unités, expressions, noms d'usage courants en France/francophonie), pas des termes traduits mot à mot qui n'existent pas dans l'usage courant.
- Reste strictement dans ${theme} > ${sousTheme}.

MODÉRATION
- Sujets sensibles (histoire, religion, politique, conflits, tragédies) : factuel et neutre, zéro opinion.
- Jamais de contenu violent, choquant, discriminatoire, sexuel — reformule ou remplace si risque de perception blessante malgré l'exactitude.

EXPLICATION + SOURCE (chaque question)
- "explication" : 1-3 phrases sur le POURQUOI, compréhensible sans connaître la réponse.
- "source" : nomme la source de référence la PLUS PRÉCISE et RÉELLE possible, sans inventer de détail vérifiable (jamais de titre d'article précis, de date de publication, de nom de journaliste/auteur — ces détails précis sont les plus à risque d'hallucination).
  Formats acceptés, du plus générique au plus précis, choisis le plus précis que tu peux garantir avec certitude :
  - Nom d'un organisme/institution officiel réel (ex: "Site officiel de la NASA", "INSEE", "Ministère de la Culture", "FIFA", "Larousse")
  - Nom d'une encyclopédie ou référence reconnue (ex: "Wikipédia", "Encyclopædia Universalis", "Larousse")
  - Type de document officiel sans détail inventé (ex: "biographie officielle de l'artiste", "fiche technique constructeur", "registre des records du monde")
  - Si aucun organisme précis ne peut être cité avec certitude : reste sur une catégorie générale ("fait historique largement documenté", "culture générale/notoriété publique", "fait scientifique établi dans la littérature académique")
- Ne cite JAMAIS : un titre d'article spécifique, une date de publication précise, un nom d'auteur/journaliste, une URL — ce sont les détails que tu ne peux pas garantir exacts et qui risquent d'être inventés.
- Toujours fournis, affichés côté app même si le joueur se trompe.
- Si impossible à sourcer crédiblement même en restant générique → remplace la question.

DATATION DES FAITS ÉVOLUTIFS
- Tout fait qui peut changer (record, poste occupé, nombre cumulatif, actualité) doit préciser sa date/période de référence dans la question elle-même.
- "date_reference" renseigné dans le JSON (année/période, ou null si fait permanent).
- Actualité : date obligatoire (mois + année) sur chaque question, sans exception.
- Ne jamais inventer une date approximative — si incertain, choisis un fait non daté.

ANTI-PRÉMISSE FAUSSE
- La formulation elle-même ne doit jamais présupposer une catégorie/statut/rôle/relation erronés (ex: "quel groupe" pour un artiste solo, "réalisateur" pour un scénariste).
- Relis chaque terme catégoriel de la question ; en cas de doute, formule de façon neutre.

ANTI-CONFUSION
- Ne mélange jamais œuvre originale et adaptation (livre/film, jeu/série) — reste sur une seule version, précise-la si besoin.
- Vérifie l'absence d'homonymes ambigus (personne, lieu, œuvre) ; précise un identifiant si nécessaire.
- Chiffres approximatifs → toujours "environ", jamais présentés comme exacts.

ANTI-DOUBLON
- Aucune question ni fait redondant dans le lot de ${n}.
- Aucun doublon avec un autre niveau de difficulté du même sous-thème (même reformulé — compare le FAIT testé, pas le texte).
- Aucun doublon avec l'historique ci-dessus. Si le sous-thème est trop pointu pour ${n} questions inédites, élargis légèrement le périmètre plutôt que répéter.

COHÉRENCE INTERNE QUESTION-RÉPONSE (anti-mélange entre questions du lot)
- Chaque question doit être strictement autonome : sa "bonne_reponse_index", ses "reponses", son "explication" et sa "source" doivent porter EXCLUSIVEMENT sur le sujet de CETTE question précise — jamais sur un fait ou une réponse appartenant à une autre question du même lot.
- Erreur typique à éviter : générer des questions sur des sujets proches et laisser un fait ou une réponse "glisser" d'une question à l'autre par confusion entre sujets similaires.
- AVANT de finaliser le lot, relis chaque question isolément (sans regarder les autres) et vérifie que sa bonne réponse et son explication correspondent bien à SON propre énoncé, pas à celui d'une question voisine du même lot.
- Si le sous-thème comporte plusieurs sujets très proches ou similaires, sois particulièrement vigilant : reformule chaque question de façon suffisamment distincte pour ne pas risquer d'attribuer un fait au mauvais sujet.

DIVERSITÉ DES BONNES RÉPONSES DANS LE LOT
- La BONNE RÉPONSE (le contenu, pas la position A/B/C/D) ne doit jamais se répéter d'une question à l'autre dans le même lot — chaque question doit avoir un sujet/élément de réponse correcte différent des autres.
- Erreur typique à éviter : plusieurs questions différentes qui ont toutes la même bonne réponse (ex: "Paris" comme bonne réponse à 3 questions différentes), même si chaque question en elle-même est valide.
- AVANT de finaliser, liste mentalement les bonnes réponses du lot : si un même élément apparaît comme bonne réponse à plusieurs questions, remplace l'une des questions concernées par un sujet différent au sein du même sous-thème.
- Cette règle ne concerne que le CONTENU de la bonne réponse, pas sa position — la position (A/B/C/D) est gérée par le mélange aléatoire côté code.

DIVERSITÉ DES MAUVAISES RÉPONSES DANS LE LOT
- Limite la réutilisation d'un même élément comme mauvaise réponse à travers le lot — évite qu'un même nom/lieu/date revienne comme option incorrecte dans trop de questions différentes.
- INTERDICTION ABSOLUE : un élément qui a servi de MAUVAISE réponse à une question ne doit jamais devenir la BONNE réponse d'une autre question du même lot (et inversement).

CONTRÔLE FINAL DE QUANTITÉ
- Avant de livrer le JSON, compte exactement les questions du tableau : il doit y en avoir EXACTEMENT ${n}, ni plus ni moins. Si une question a été supprimée en cours de vérification, génères-en une nouvelle pour compenser plutôt que de livrer un lot incomplet.

${niveau}

ANCRAGE SPECTATEUR/COULISSES PAR THÈME (calibrage, non exhaustif — applique le côté pertinent au niveau ${difficulte})
Histoire: événements connus / dates-traités précis. Sport: champions connus / entraîneurs-stats. Musique: artiste-tube connu / compositeur-label. Cinéma: acteurs-répliques cultes / réalisateur-studio. Géographie: pays-monuments connus / relief-démographie. Sciences: faits scolaires / chercheur-process. Tech: marques connues / specs-dates précises. Nature: animaux connus / classification scientifique. Cuisine: plats-origine connus / technique-chef-date. Art: œuvres célèbres / mouvement-technique. Mythologie: dieux-héros connus / généalogies-variantes. Littérature: livres-auteurs connus / courants-dates précises. Animaux: animaux du quotidien / classification-comportements. Espace: astronomie scolaire / missions-données techniques. Jeux vidéo: jeux-persos populaires / studio-moteur-date. Actualité: tendances connues et datées / détails ponctuels précis — jamais de fait instable non daté.
Thème libre : applique le même principe spectateur/coulisses de façon autonome.

PORTÉE
- "Français" : priorise faits France/francophonie sur thèmes pertinents (Histoire, Cinéma, Musique, Littérature, Actualité, Cuisine) ; thèmes universels restent internationaux avec ancrage français si possible.
- "International" : vivier mondial, sans priorité géographique.
- Dans les deux cas, le principe spectateur/coulisses prime — la portée ajuste le périmètre, pas la difficulté.

THÈME LIBRE (hors thèmes prédéfinis)
- Identifie la famille de rattachement, applique strictement les règles du niveau ${difficulte}, fiabilité et anti-doublon.
- Si trop pointu pour ${n} questions fiables et non redondantes, élargis le périmètre plutôt qu'inventer.
- Si ambigu/mal orthographié, choisis l'interprétation la plus probable et grand public.
- Si inapproprié ou insuffisamment documenté : ne génère rien, retourne {"erreur": "Thème non valide ou insuffisamment documenté pour générer un quiz fiable."}

AUTO-VÉRIFICATION FINALE (avant de répondre, ne pas écrire ce raisonnement)
Repasse sur les ${n} questions : niveau "${difficulte}" respecté ? ${checkNiveau} Faits vérifiables ? Explication/source présentes et crédibles ? Fait évolutif daté ? Zéro redondance (lot + niveaux + historique) ? Chaque bonne réponse/explication correspond-elle STRICTEMENT à sa propre question, sans mélange avec une autre question du lot ? Les bonnes réponses portent-elles bien sur des éléments différents, sans répétition du même contenu de réponse ? Aucune mauvaise réponse d'une question n'est-elle devenue la bonne réponse d'une autre ? Le tableau contient-il exactement ${n} questions ? Portée respectée ? Zéro prémisse fausse ? Réponses fausses indiscutablement fausses, sans mélange œuvre/adaptation ni homonyme ? Chiffres honnêtes ? Toute question qui échoue est remplacée.

FORMAT DE SORTIE — JSON strict uniquement, rien d'autre :
[
  {
    "question": "...",
    "reponses": ["...", "...", "...", "..."],
    "bonne_reponse_index": 0,
    "explication": "...",
    "source": "...",
    "date_reference": "... ou null",
    "theme": "${theme}",
    "sous_theme": "${sousTheme}",
    "difficulte": "${difficulte}",
    "portee": "${portee}",
    "justification_difficulte": "...",
    "fait_verifiable": true
  }
]

Génère maintenant les ${n} questions sur "${theme}" > "${sousTheme}", niveau "${difficulte}", portée "${portee}".`
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
  // Sources libres (organisme, encyclopédie, catégorie) — plafonnées
  if (t.length < 3) return undefined
  return t.length <= 120 ? t : t.slice(0, 120)
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
  for (const raw of extracted.questions) {
    const answers = normalizeRawAnswers(raw)
    if (!answers || !raw.question) continue
    const correctIndex = clampIndex(normalizeRawIndex(raw))
    const questionText =
      contentMode === 'image'
        ? normalizeImageQuestionText(String(raw.question))
        : String(raw.question).trim()

    // Mode texte : écarte les Q où la réponse est déjà dans l’énoncé
    if (
      contentMode === 'standard' &&
      questionLeaksAnswer(questionText, answers, correctIndex)
    ) {
      continue
    }

    // Doublons / quasi-doublons = plusieurs réponses potentiellement correctes
    if (hasDuplicateOrNearDuplicateAnswers(answers)) continue

    const explanation = String(
      raw.explication ?? raw.explanation ?? '',
    ).trim()
    const sourceType = normalizeSourceType(
      String(raw.source ?? raw.type_source ?? raw.sourceType ?? ''),
    )
    // Explication + source obligatoires (affichées après la réponse)
    if (explanation.length < 20 || !sourceType) continue
    if (explanationSuggestsMultipleCorrect(explanation)) continue

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
      }),
    )
  }

  const capped = questions.slice(0, maxQuestions)
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
  )
  const errors: string[] = []

  let pickedSlot: string | undefined
  let engineOrder: LlmEngine[] = enginesForProvider(provider)

  if (provider === 'auto') {
    const picked = await pickAiForGeneration()
    if (picked) {
      pickedSlot = picked.slot
      engineOrder = fallbackEngines(
        picked.engine,
        enginesWithKeys() as RotateEngine[],
      ) as LlmEngine[]
    }
  }

  try {
    for (const engine of engineOrder) {
      // Auto : clé claimée d’abord, puis les autres clés du même provider, puis autre IA
      const allKeys = keysForEngine(engine)
      const keys =
        provider === 'auto' && pickedSlot?.startsWith(`${engine}#`)
          ? (() => {
              const idx = Number(pickedSlot.split('#')[1]) || 0
              const primary = allKeys[idx]
              const rest = allKeys.filter((_, i) => i !== idx)
              return [primary, ...rest].filter(Boolean) as string[]
            })()
          : allKeys

      if (keys.length === 0) {
        if (engine !== 'cerebras') {
          errors.push(`${engine.toUpperCase()}_API_KEY manquante`)
        }
        continue
      }

      for (const apiKey of keys) {
        for (const model of modelsFor(engine, contentMode)) {
          try {
            // 429 → withAiRetry relance ; on enchaîne clé suivante puis autre IA
            const text = await withAiRetry(() =>
              engine === 'gemini'
                ? callGemini(apiKey, model, prompt)
                : callOpenAiCompatible(
                    engine as Exclude<LlmEngine, 'gemini'>,
                    apiKey,
                    model,
                    prompt,
                  ),
            )
            const parsed = parseAndCap(
              text,
              themeSlug,
              difficulty,
              batchId,
              now,
              contentMode,
              questionCount,
            )
            if (parsed.kind === 'ok') {
              const questions =
                contentMode === 'image'
                  ? await enrichWithCommonsImages(parsed.questions)
                  : parsed.questions
              if (questions.length === 0) {
                errors.push(
                  `${engine}/${model}: aucune question valide (filtrées)`,
                )
                continue
              }
              return { questions, source: engine, model }
            }
            if (parsed.kind === 'theme_error') {
              return { error: parsed.message, themeInvalid: true }
            }
            errors.push(`${engine}/${model}: JSON invalide`)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            errors.push(msg)
            console.warn(`[${engine}] ${model}:`, msg.slice(0, 200))
            // Rate limit → autre clé du même provider, puis autre IA
            if (isRateLimitError(msg)) {
              break
            }
          }
        }
      }
    }
  } finally {
    await releaseAiSlot(pickedSlot)
  }

  return { error: errors[0] ?? 'Aucun provider IA disponible' }
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

/** Retry uniquement timeouts / gateway — pas les 429 (bascule IA). */
async function withAiRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      if (isRateLimitError(msg)) throw e
      const retryable =
        isTimeoutLikeError(msg) || /\b(503|504|502)\b/.test(msg)
      if (!retryable || attempt === 1) throw e
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** Schéma minimal d’une question prête pour le front */
function isStrictQuestion(q: GeneratedQuestion): boolean {
  if (!q.question?.trim()) return false
  if (!Array.isArray(q.answers) || q.answers.length !== 4) return false
  if (q.answers.some((a) => !String(a).trim())) return false
  if (q.correctIndex !== 0 && q.correctIndex !== 1 && q.correctIndex !== 2 && q.correctIndex !== 3) {
    return false
  }
  if (!q.explanation || q.explanation.trim().length < 20) return false
  if (!q.sourceType || q.sourceType.trim().length < 3) return false
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

/**
 * Un seul palier par appel. provider: auto | groq | gemini | cerebras | deepseek | openrouter.
 * Stratégie : 10 d’un coup ; si échec type 504/timeout → fallback 2×5.
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
): Promise<{
  questions: GeneratedQuestion[]
  source: GenerateSource
  message?: string
  error?: string
}> {
  void mode
  const batchId = newId()
  const now = new Date().toISOString()
  const tier: Difficulty =
    difficulty === 'medium' || difficulty === 'hard' ? difficulty : 'easy'

  // Quiz musical Deezer — pas d’IA, API publique
  if (contentMode === 'audio') {
    const deezer = await buildDeezerQuiz({
      theme,
      themeSlug,
      difficulty: tier,
      scope,
      excludeQuestions,
      count: 10,
    })
    if ('error' in deezer) {
      return { questions: [], source: 'deezer', error: deezer.error }
    }
    return {
      questions: deezer.questions,
      source: 'deezer',
      message: deezer.message,
    }
  }

  const hasKey = AUTO_FREE_ENGINES.some((e) => keysForEngine(e).length > 0)

  if (!hasKey) {
    return {
      questions: buildMockQuestions(theme, themeSlug, 'complementary', tier),
      source: 'mock',
      message:
        'Aucune clé API free — questions mock. Ajoute GROQ_API_KEY, GEMINI_API_KEY ou OPENROUTER_API_KEY.',
    }
  }

  const TARGET = 10
  const deadline = Date.now() + 55_000
  const collected: GeneratedQuestion[] = []
  const seen = new Set<string>()
  const excluded = new Set(
    excludeQuestions.map((q) => q.trim().toLowerCase().replace(/\s+/g, ' ')),
  )
  let excludeLive = [...excludeQuestions]
  let lastSource: LlmEngine | null = null
  let lastModel = ''
  let lastError: string | undefined
  let usedFallback2x5 = false

  function ingest(
    qs: GeneratedQuestion[],
  ): void {
    for (const q of qs) {
      if (q.difficulty !== tier) continue
      if (contentMode === 'image' && !q.imageUrl && !q.imageSubject) continue
      const key = questionKey(q)
      if (seen.has(key) || excluded.has(key)) continue
      seen.add(key)
      excluded.add(key)
      collected.push(q)
      excludeLive.push(q.question)
      if (collected.length >= TARGET) break
    }
  }

  async function runBatch(count: number): Promise<{
    ok: boolean
    themeInvalid?: boolean
    timeoutLike?: boolean
  }> {
    if (Date.now() >= deadline) {
      return { ok: false, timeoutLike: true }
    }
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
      count,
    )
    if ('error' in result) {
      lastError = result.error
      if (result.themeInvalid) return { ok: false, themeInvalid: true }
      return {
        ok: false,
        timeoutLike: isTimeoutLikeError(result.error),
      }
    }
    lastSource = result.source
    lastModel = result.model
    ingest(result.questions)
    return { ok: collected.length > 0 }
  }

  // Difficile : 2×5 d’emblée (moins de JSON tronqué / 504)
  // Autres paliers : 10 d’un coup, puis fallback 2×5 si timeout / vide
  if (tier === 'hard') {
    usedFallback2x5 = true
    for (let i = 0; i < 2 && collected.length < TARGET; i++) {
      const need = Math.min(5, TARGET - collected.length)
      const part = await runBatch(need)
      if (part.themeInvalid && lastError) {
        return { questions: [], source: 'mock', error: lastError }
      }
      if (!part.ok && part.timeoutLike) continue
    }
  } else {
    const first = await runBatch(TARGET)
    if (first.themeInvalid && lastError) {
      return { questions: [], source: 'mock', error: lastError }
    }

    if (
      collected.length < TARGET &&
      (first.timeoutLike || collected.length === 0)
    ) {
      usedFallback2x5 = true
      collected.length = 0
      seen.clear()
      excluded.clear()
      for (const q of excludeQuestions) {
        const fp = q.trim().toLowerCase().replace(/\s+/g, ' ')
        if (fp) excluded.add(fp)
      }
      excludeLive = [...excludeQuestions]

      for (let i = 0; i < 2 && collected.length < TARGET; i++) {
        const need = Math.min(5, TARGET - collected.length)
        const part = await runBatch(need)
        if (part.themeInvalid && lastError) {
          return { questions: [], source: 'mock', error: lastError }
        }
        if (!part.ok && part.timeoutLike) continue
      }
    } else if (collected.length < TARGET) {
      while (collected.length < TARGET && Date.now() < deadline) {
        const need = Math.min(5, TARGET - collected.length)
        const part = await runBatch(need)
        if (part.themeInvalid && lastError) {
          return { questions: [], source: 'mock', error: lastError }
        }
        if (!part.ok) break
      }
    }
  }

  // Complément si encore incomplet (tous paliers)
  while (collected.length < TARGET && Date.now() < deadline) {
    const need = Math.min(5, TARGET - collected.length)
    const part = await runBatch(need)
    if (part.themeInvalid && lastError) {
      return { questions: [], source: 'mock', error: lastError }
    }
    if (!part.ok) break
  }

  if (collected.length < TARGET) {
    return {
      questions: [],
      source: 'mock',
      error: lastError
        ? `Génération impossible (${lastError.slice(0, 160)}). Réessaie.`
        : `Pas assez de questions valides (${collected.length}/${TARGET}). Réessaie.`,
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

  const modeLabel = usedFallback2x5 ? ' · fallback 2×5' : ''
  return {
    questions: strict,
    source: lastSource ?? 'mock',
    message: `Généré avec ${lastSource} (${lastModel}) — ${tier}${modeLabel}`,
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
): Promise<string> {
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

  const res = await fetchWithTimeout(
    endpoints[engine],
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 3200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: AI_SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
    },
    22_000,
  )

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(
      `${engine} ${res.status} (${model}): ${detail.slice(0, 400)}`,
    )
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return data.choices?.[0]?.message?.content ?? ''
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const key = apiKey.trim()
  // Les clés Auth (AQ.) exigent le header x-goog-api-key (pas ?key= ni Bearer)
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
        systemInstruction: { parts: [{ text: AI_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 3200,
          responseMimeType: 'application/json',
        },
      }),
    },
    22_000,
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
  }
  return (
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('\n') ??
    ''
  )
}

function clampIndex(n: number): 0 | 1 | 2 | 3 {
  const i = Number(n)
  if (i === 1 || i === 2 || i === 3) return i
  return 0
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
        return null
      }
    }
    return null
  }
}
