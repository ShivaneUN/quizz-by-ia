/**
 * Génération de questions — Groq / Gemini (choix + fallback Auto).
 * Clés API uniquement côté serveur (.env).
 */

import { fetchCommonsImageUrl } from './wikimedia.js'

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
/** auto = Groq puis Gemini ; groq/gemini = forcé */
export type AiProvider = 'auto' | 'groq' | 'gemini'
/** standard = texte ; image = QCM illustré Wikimedia */
export type QuizContentMode = 'standard' | 'image'
export type ImageKind = 'logo' | 'sujet_entier' | 'detail_zoome'
export type GenerateSource = 'groq' | 'gemini' | 'mock'

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
  imageSubject?: string
  imageKind?: ImageKind
  imageUrl?: string
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
] as const

/** Flash uniquement — 2.5-flash retiré pour les nouveaux comptes */
const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
] as const

const AI_SYSTEM = `Générateur de quiz. JSON uniquement.
Succès: {"questions":[...14 items...]}
Échec thème: {"erreur":"..."}
Clés obligatoires : question, reponses (4), bonne_reponse_index, explication, type_source, difficulte, portee.
explication + type_source OBLIGATOIRES. Exactement 1 bonne réponse — les 3 autres indiscutablement fausses (sinon rejet).
ANTI-SPOILER : jamais la bonne réponse dans l’énoncé.
Calibrage : facile = grand public ; moyen = amateur ; difficile = passionné.
Un seul niveau. Faits vérifiables, français, neutre. Pas d’URL.`

export function parseAiProvider(raw: unknown): AiProvider {
  if (raw === 'groq' || raw === 'gemini' || raw === 'auto') return raw
  return 'auto'
}

export function parseQuizContentMode(_raw: unknown): QuizContentMode {
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

function buildPrompt(
  themeFull: string,
  difficulty: Difficulty,
  scope: 'fr' | 'international',
  contentMode: QuizContentMode,
): string {
  const { theme, sousTheme } = splitThemeParts(themeFull)
  const difficulte = DIFFICULTY_FR[difficulty]
  const portee = SCOPE_FR[scope]
  const mode = contentMode === 'image' ? 'image' : 'standard'

  const modeBlock =
    mode === 'image'
      ? `
MODE DE JEU — "image"
RÈGLE CENTRALE (obligatoire) :
37. CHAQUE question est une RECONNAISSANCE VISUELLE. Le texte de "question" doit être UNIQUEMENT une consigne générique du type :
    - "À quoi correspond cette image ?"
    - "Qui est représenté sur cette image ?"
    - "Qu’est-ce que montre cette image ?"
    Interdit : toute question factuelle autonome (ex. "Qui a créé Assassin's Creed ?", "Quelle est la capitale de… ?") — sans l’image, la question ne doit PAS être jouable ni contenir d’indice sur la réponse.
38. L’image illustre EXACTEMENT la BONNE réponse (pas un contexte, pas un studio, pas une œuvre associée). "sujet_image" = l’entité de la bonne réponse (ex. bonne réponse "Patrice Désilets" → sujet_image "Patrice Désilets", PAS "Assassin's Creed").
39. Les 4 réponses doivent être de la MÊME nature (4 personnes, 4 marques, 4 animaux, 4 monuments…) — jamais mélanger catégories (ex. studios + créateur).
40. La difficulté vient de la reconnaissance visuelle (choix du sujet + type_image + distracteurs proches), PAS du texte de la question.

25. Pour CHAQUE question, ajoute "sujet_image" : nom exact à chercher sur Wikimedia Commons pour illustrer la BONNE réponse (ex: "Toyota Corolla", "Tom Hanks", "Banane"). Terme de recherche court, pas une description longue.
26. Ajoute "type_image" : "logo" (marques/logos), "sujet_entier" (photo complète), ou "detail_zoome" (détail pour difficile, ex. phare/jante — seulement si le sujet s’y prête).
27. Cohérence difficulté/image : si type_image = "detail_zoome", le niveau doit être difficile ; la consigne reste générique (règle 37).
28. "sujet_image" doit viser une entité notoire susceptible d’exister sur Wikimedia Commons.
29. Applicabilité du type d'image par thème — avant de choisir "type_image", vérifie si le sous-thème s’y prête :
    - "logo" UNIQUEMENT si le sujet est une marque/organisation identifiable par un logo (voitures, sport, tech, jeux vidéo, espace, entreprises). Pour tout autre thème : JAMAIS "logo".
    - "detail_zoome" pour sujets visuellement riches reconnaissables par fragment (voitures, art, cinéma, animaux, monuments). Moins pertinent pour sujets abstraits ou déjà simples (ex. fruit basique, drapeau).
    - Si aucune déclinaison particulière : "sujet_entier" pour tous les niveaux ; la difficulté vient alors des distracteurs / sujets moins iconiques (PAS d’une question texte factuelle).
30. Ne force jamais un type d'image qui n’a pas de sens — mieux vaut "sujet_entier" à tous les niveaux qu’un "logo" ou "detail_zoome" artificiel.
31. "sujet_image" est un terme technique INTERNE (jamais affiché). Ne compte pas sur le fait que l’utilisateur verrait le nom du fichier / titre Wikimedia — ces titres contiennent souvent la réponse.
32. Spécificité de recherche : évite les homonymes dans "sujet_image" (cf. règle 19). Si ambigu, ajoute un identifiant (ex: "Jaguar (voiture)" plutôt que "Jaguar").
33. Non-confusion visuelle : l’image de la bonne réponse ne doit pas pouvoir être confondue avec une mauvaise réponse (ex. deux voitures trop similaires). Si risque → change les distracteurs pour qu’ils soient visuellement distincts.
34. Modération visuelle : les règles de neutralité/contenu s’appliquent aussi à "sujet_image" — jamais de sujet susceptible d’images violentes, choquantes ou inappropriées.
35. Difficulté visuelle : FACILE = icône / sujet ULTRA reconnaissable même sans être fan (Mario, Tour Eiffel, banane…) ; MOYEN = un peu moins iconique mais encore courant ; DIFFICILE = détail, sujet secondaire ou recognition fine (règle 27). Jamais de sujet « connu seulement des fans » en facile.
36. Privilégie des "sujet_image" très probablement trouvables sur Wikimedia Commons (le serveur écartera les questions sans image exploitable).`
      : `
MODE DE JEU — "standard"
Ignore "sujet_image" et "type_image" — ne les inclus PAS dans le JSON.`

  const jsonExample =
    mode === 'image'
      ? `{"questions":[{"question":"À quoi correspond cette image ?","reponses":["...","...","...","..."],"bonne_reponse_index":0,"explication":"...","type_source":"...","sujet_image":"...","type_image":"sujet_entier","theme":"${theme}","sous_theme":"${sousTheme}","difficulte":"${difficulte}","portee":"${portee}","justification_difficulte":"...","fait_verifiable":true}]}`
      : `{"questions":[{"question":"...","reponses":["...","...","...","..."],"bonne_reponse_index":0,"explication":"...","type_source":"...","theme":"${theme}","sous_theme":"${sousTheme}","difficulte":"${difficulte}","portee":"${portee}","justification_difficulte":"...","fait_verifiable":true}]}`

  return `Génère EXACTEMENT ${mode === 'image' ? 14 : 14} QCM — thème "${theme}", sous-thème "${sousTheme}", difficulté "${difficulte}", portée "${portee}", mode "${mode}".
${mode === 'image' ? 'Mode image : 14 questions (marge). "sujet_image" = titre d’article Wikipedia probable de la BONNE réponse (ex. "Mario", "Tour Eiffel", "Lionel Messi").\n' : 'Génère 14 questions (marge) : le serveur écartera celles qui spoilent la réponse dans l’énoncé — vise donc des énoncés sans spoiler.\n'}
FIABILITÉ
- Faits réels vérifiables uniquement. Si doute → autre question. Jamais inventer.
- 1 bonne réponse claire ; 3 distracteurs plausibles mais faux.

ANTI-AMBIGUÏTÉ / UNE SEULE BONNE RÉPONSE (critique — TOUS thèmes / niveaux)
17. RÉPONSE UNIQUE GARANTIE (obligatoire) :
    a) Exactement 1 bonne réponse. Les 3 autres doivent être FAUSSES de façon indiscutable, sans aucune interprétation où elles seraient aussi correctes.
    b) Test : « Un joueur pourrait-il argumenter qu’une mauvaise réponse est aussi vraie ? » → si oui, REJETTE (reformule la question ou change le distracteur).
    c) Interdit : questions où 2+ choix sont vrais (ex. plusieurs capitales possibles, plusieurs titres corrects, synonymes, marques liées, dates approchantes toutes acceptables, « aussi » / « également » dans l’explication).
    d) Interdit : distracteurs qui sont des synonymes, abréviations, ou reformulations de la bonne réponse (ex. "PSG" et "Paris Saint-Germain" ; "ONU" et "Organisation des Nations unies" si les deux seraient justes).
    e) Interdit : questions trop larges ("Parmi ces…", "Lequel est un…") où plusieurs options appartiennent à la catégorie demandée.
    f) Préfère des faits à valeur unique et stable (un seul nom, une seule date exacte, une seule œuvre, un seul record non contesté).
18. NE PAS MÉLANGER ŒUVRE ORIGINALE ET ADAPTATION : si plusieurs versions existent (livre/film, jeu/série, réel/dramatisation), tous les faits doivent venir de LA MÊME version — précise-la dans la question si besoin (ex. "Dans le roman..." vs "Dans le film...").
19. VÉRIFICATION HOMONYMES : si le nom désigne plusieurs entités (personnes, lieux, œuvres), cible sans ambiguïté LA bonne (ajoute date, pays ou contexte) et assure-toi que le fait lui correspond, pas à l’homonyme.
20. PRÉCISION HONNÊTE DES CHIFFRES : si un chiffre est une approximation ou varie selon les sources, ne le présente pas comme exact absolu — utilise "environ" ou choisis un fait à valeur stable et non contestée. Ne propose JAMAIS deux chiffres qui seraient tous deux acceptables.

ANTI-PRÉMISSE FAUSSE (vérification critique, tous thèmes)
14. Une question ne doit JAMAIS contenir une affirmation implicite fausse dans sa formulation, même si la bonne réponse est juste.
   Ex. interdit : "Quel groupe interprète [chanson] ?" si l’artiste est un solo — la question présuppose une catégorie fausse.
   Surveiller aussi : genre/catégorie erronée (groupe vs solo, film vs série, pays vs ville, roman vs nouvelle, sport individuel vs équipe) ; statut erroné (actuel/vivant vs disparu) ; attribution erronée dans l’énoncé (appeler "réalisateur" un scénariste) ; relation présupposée fausse (créateur/œuvre, pays/capitale, auteur/livre).
15. AVANT de finaliser : relis l’énoncé (pas seulement les réponses) — chaque mot catégoriel (groupe, film, pays, réalisateur, capitale, inventeur…) correspond-il EXACTEMENT à la nature réelle du sujet ? Si un terme est incertain → vérifie ou reformule plus sûr (ex. "Qui interprète [chanson] ?" au lieu de présupposer groupe/chanteur).
16. En cas de doute sur la nature d’une entité (solo/groupe, film/série, pays/région…), privilégie une formulation neutre qui ne présuppose rien.

ANTI-BIAIS STRUCTUREL (vérification critique)
21. HOMOGÉNÉITÉ DES RÉPONSES : les 4 réponses doivent avoir une longueur et un niveau de détail similaires. N’écris JAMAIS la bonne réponse plus longue, plus précise ou plus qualifiée que les 3 fausses — cela la rend devinable. Les 4 doivent être interchangeables en forme.
22. PRUDENCE SUR LES SUPERLATIFS : pour "le plus", "le premier", "le seul", "le plus grand/petit/ancien", vérifie que le fait est stable et non contesté. En doute → reformule sans superlatif ou autre fait.
23. ÉVITER LES NÉGATIONS SAUF NÉCESSITÉ : évite "Lequel de ces X n’est PAS…" sauf si aucune formulation positive ne teste le même fait. Si utilisée, mets "PAS" en majuscules dans la question.
24. NEUTRALITÉ GRAMMATICALE FRANÇAISE : formule pour que genre/nombre (quel/quelle/quels/quelles, accords) ne réduise pas artificiellement les réponses plausibles avant la réflexion sur le fond.

═══════════════════════════════
ANTI-SPOILER — RÉPONSE DANS LA QUESTION (critique, TOUS thèmes / sous-thèmes / niveaux)
═══════════════════════════════
45. L’énoncé ne doit JAMAIS contenir la bonne réponse, ni une partie distinctive de celle-ci (marque, nom propre, titre, modèle).
   INTERDIT :
   - "…la Lamborghini Miura ?" → réponse "Lamborghini" (la marque est déjà dans la question)
   - "…créé par Bentley en 1921 ?" → réponses dont une seule contient "Bentley" (devinable par élimination)
   - "…film Titanic ?" → réponse "Titanic"
   - citer dans la question un mot qui n’apparaît que dans la bonne réponse parmi les 4 choix.
   OBLIGATOIRE : la question doit rester jouable sans révéler la réponse ; les 4 choix doivent rester tous plausibles après lecture de l’énoncé.
   Si le fait nécessite de nommer l’entité → reformule pour QUE l’entité soit la réponse, pas un mot de l’énoncé
   (ex. OK : "Quel constructeur italien a créé la Miura ?" → Lamborghini ; la Miura peut rester si ce n’est PAS la réponse).
46. AUTO-TEST anti-spoiler : pour chaque question, masque mentalement les 4 réponses. Si un lecteur peut déduire la bonne réponse uniquement parce qu’un nom de l’énoncé ne figure que dans un seul choix → REJETTE et reformule.
${modeBlock}

QUALITÉ
- Français naturel. Aucune redondance. Strictement "${theme}" > "${sousTheme}".

NEUTRALITÉ
- Sujets sensibles : factuel, neutre. Pas de contenu violent/discriminatoire/sexuel.

EXPLICATION + SOURCE (obligatoire pour CHAQUE question)
- "explication" : 1–3 phrases qui justifient POURQUOI la bonne réponse est correcte (fait clair, pas vague).
- "type_source" OBLIGATOIRE, exactement l’une de :
  "culture générale/notoriété publique" | "fait historique documenté" | "fait scientifique établi" | "statistique/donnée officielle" | "biographie/déclaration officielle" | "œuvre originale (livre, film...)".
- Pas d’URL. Sans explication ET type_source valides → ne pas inclure la question (remplace-la).
- Ces champs sont affichés au joueur après la bonne réponse : ils doivent être utiles et fiables.

═══════════════════════════════
CALIBRAGE STRICT DES NIVEAUX (critique — respecter à 100 %)
═══════════════════════════════
Ce lot est UNIQUEMENT "${difficulte}". Aucune question d’un autre niveau.

41. FACILE = GRAND PUBLIC ABSOLU (pas fan, pas amateur, pas passionné)
   Public cible : quelqu’un qui a juste « déjà entendu parler » du thème / sous-thème, sans jamais le suivre.
   Test OBLIGATOIRE avant chaque question facile : « Un ado de 14 ans, zéro fan de "${sousTheme}", a-t-il une chance réaliste de savoir sans Google ? »
   Si la réponse est non → REJETTE et remplace. Si tu hésites → ce n’est PAS facile.
   Autorisé en facile : icônes ultra connues, faits scolaires / culture pop de base, titres/franchises planétaires, capitales/pays célèbres, animaux/objets évidents, logos mythiques.
   INTERDIT en facile (même si « connu des fans ») :
   - créateurs, réalisateurs, scénaristes, compositeurs, designers, inventeurs secondaires ;
   - dates exactes, chiffres précis, classements, stats, palmarès détaillés ;
   - personnages secondaires, DLC, saisons obscures, albums hors hits, modèles peu connus ;
   - jargon, coulisses, technique, lore avancé, trivia de niche ;
   - toute question où seuls les passionnés / joueurs / cinéphiles / géeks réussiraient.
   Ex. Jeux vidéo FACILE OK : Mario, Pokémon, Minecraft, GTA (franchise) — PAS le créateur d’Assassin’s Creed, PAS un boss secondaire.
   Ex. Cinéma FACILE OK : Titanic, Star Wars, Harry Potter — PAS le monteur, PAS un second rôle obscur.

42. MOYEN = AMATEUR CURIEUX (suit un peu le sujet, pas un expert)
   Public : quelqu’un qui aime "${sousTheme}" de façon occasionnelle (regarde/joue/écoute de temps en temps).
   Un cran au-dessus du facile : noms un peu moins évidents, relations simples œuvre↔auteur connus, faits un peu plus précis mais encore largement médiatisés.
   INTERDIT en moyen : trivia ultra-niche, détails de coulisses pro, chiffres obscurs, personnages vraiment secondaires — ça = difficile.

43. DIFFICILE = PASSIONNÉ / EXPERT
   Public : fan assidu ou très bonne culture du sujet.
   Autorisé : détails précis vérifiables, dates, stats stables, personnages secondaires connus des fans, coulisses documentées, distinctions fines entre œuvres proches.
   Toujours vérifiable ; jamais inventé. Pas d’impossible absurde.

44. AUTO-CONTRÔLE FINAL (chaque question)
   - Relis la question + les 4 réponses.
   - Classe-la mentalement : facile / moyen / difficile selon les règles 41–43.
   - Si elle ne correspond PAS exactement à "${difficulte}" → remplace-la.
   - "justification_difficulte" doit expliquer en 1 phrase POURQUOI elle est bien de ce niveau (ex. facile : « franchise connue de tous, pas de trivia fan »).

PORTÉE
- Français : priorise France/francophonie si pertinent ; facile = grand public FR (ce qu’on voit à la TV / à l’école / dans la rue).
- International : faits connus mondialement ; évite le franco-français.
La portée change le périmètre, pas le niveau.
Actualité : faits stables seulement (pas d’événements trop récents/évolutifs).
Thème libre / niche : si pas assez de faits grand public pour le niveau demandé → élargis le sous-thème ou {"erreur":"Thème non valide ou insuffisamment documenté pour générer un quiz fiable."}.

SORTIE JSON seule :
${jsonExample}

Génère les 14 questions maintenant.`
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

const ALLOWED_SOURCE_TYPES = [
  'culture générale/notoriété publique',
  'fait historique documenté',
  'fait scientifique établi',
  'statistique/donnée officielle',
  'biographie/déclaration officielle',
  'œuvre originale (livre, film...)',
] as const

function normalizeSourceType(raw: string): string | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const lower = t.toLowerCase()
  const exact = ALLOWED_SOURCE_TYPES.find((s) => s.toLowerCase() === lower)
  if (exact) return exact
  if (/culture|notori/.test(lower)) return ALLOWED_SOURCE_TYPES[0]
  if (/histor/.test(lower)) return ALLOWED_SOURCE_TYPES[1]
  if (/scientif/.test(lower)) return ALLOWED_SOURCE_TYPES[2]
  if (/statisti|donn/.test(lower)) return ALLOWED_SOURCE_TYPES[3]
  if (/biograph|d[eé]clar/.test(lower)) return ALLOWED_SOURCE_TYPES[4]
  if (/oeuvre|œuvre|livre|film|original/.test(lower)) return ALLOWED_SOURCE_TYPES[5]
  if (!/^https?:/i.test(t) && t.length <= 80) return t
  return undefined
}

function parseAndCap(
  text: string,
  themeSlug: string,
  difficulty: Difficulty,
  batchId: string,
  now: string,
  contentMode: QuizContentMode,
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
      String(raw.type_source ?? raw.sourceType ?? ''),
    )
    // Explication + source obligatoires (affichées après la réponse)
    if (explanation.length < 20 || !sourceType) continue
    if (explanationSuggestsMultipleCorrect(explanation)) continue

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
        imageSubject,
        imageKind,
      }),
    )
  }

  const capped = questions.slice(0, 14)
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
): Promise<
  | { questions: GeneratedQuestion[]; source: 'groq' | 'gemini'; model: string }
  | { error: string; themeInvalid?: boolean }
> {
  const prompt = buildPrompt(theme, difficulty, scope, contentMode)
  const errors: string[] = []
  const order: Array<'groq' | 'gemini'> =
    provider === 'groq'
      ? ['groq']
      : provider === 'gemini'
        ? ['gemini']
        : ['groq', 'gemini']

  // Mode image : moins de modèles pour rester sous le timeout serverless
  const groqModels =
    contentMode === 'image' ? GROQ_MODELS.slice(0, 2) : [...GROQ_MODELS]
  const geminiModels =
    contentMode === 'image' ? GEMINI_MODELS.slice(0, 2) : [...GEMINI_MODELS]

  for (const engine of order) {
    if (engine === 'groq') {
      const groqKey = process.env.GROQ_API_KEY
      if (!groqKey) {
        errors.push('GROQ_API_KEY manquante')
        continue
      }
      for (const model of groqModels) {
        try {
          const text = await callGroq(groqKey, model, prompt)
          const parsed = parseAndCap(
            text,
            themeSlug,
            difficulty,
            batchId,
            now,
            contentMode,
          )
          if (parsed.kind === 'ok') {
            const questions =
              contentMode === 'image'
                ? await enrichWithCommonsImages(parsed.questions)
                : parsed.questions
            if (questions.length === 0) {
              errors.push(`groq/${model}: aucune question valide (filtrées)`)
              continue
            }
            return { questions, source: 'groq', model }
          }
          if (parsed.kind === 'theme_error') {
            return { error: parsed.message, themeInvalid: true }
          }
          errors.push(`groq/${model}: JSON invalide`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          errors.push(msg)
          console.warn(`[groq] ${model}:`, msg.slice(0, 200))
        }
      }
      continue
    }

    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) {
      errors.push('GEMINI_API_KEY manquante')
      continue
    }
    for (const model of geminiModels) {
      try {
        const text = await callGemini(geminiKey, model, prompt)
        const parsed = parseAndCap(
          text,
          themeSlug,
          difficulty,
          batchId,
          now,
          contentMode,
        )
        if (parsed.kind === 'ok') {
          const questions =
            contentMode === 'image'
              ? await enrichWithCommonsImages(parsed.questions)
              : parsed.questions
          if (questions.length === 0) {
            errors.push(`gemini/${model}: aucune question valide (filtrées)`)
            continue
          }
          return { questions, source: 'gemini', model }
        }
        if (parsed.kind === 'theme_error') {
          return { error: parsed.message, themeInvalid: true }
        }
        errors.push(`gemini/${model}: JSON invalide`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(msg)
        console.warn(`[gemini] ${model}:`, msg.slice(0, 200))
      }
    }
  }

  return { error: errors[0] ?? 'Aucun provider IA disponible' }
}

/**
 * Un seul palier par appel. provider: auto | groq | gemini.
 * Mode image : écarte les Q sans image Commons et relance pour compléter jusqu’à 10.
 */
export async function generateQuestions(
  theme: string,
  themeSlug: string,
  mode: 'initial' | 'complementary',
  difficulty?: Difficulty,
  scope: 'fr' | 'international' = 'fr',
  provider: AiProvider = 'auto',
  contentMode: QuizContentMode = 'standard',
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
  const hasKey = Boolean(
    process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY,
  )

  if (!hasKey) {
    return {
      questions: buildMockQuestions(theme, themeSlug, 'complementary', tier),
      source: 'mock',
      message:
        'Aucune clé API — questions mock. Ajoute GROQ_API_KEY ou GEMINI_API_KEY.',
    }
  }

  const TARGET = 10
  /** Plusieurs rounds si le filtre anti-spoiler écarte trop de Q */
  const MAX_ROUNDS = contentMode === 'image' ? 1 : 3
  const deadline = Date.now() + 55_000
  const collected: GeneratedQuestion[] = []
  const seen = new Set<string>()
  let lastSource: 'groq' | 'gemini' | null = null
  let lastModel = ''
  let lastError: string | undefined
  let themeInvalid = false

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (Date.now() >= deadline) break

    const result = await generateOneTier(
      theme,
      themeSlug,
      tier,
      batchId,
      now,
      scope,
      provider,
      contentMode,
    )
    if ('error' in result) {
      lastError = result.error
      themeInvalid = Boolean(result.themeInvalid)
      if (themeInvalid) break
      continue
    }

    lastSource = result.source
    lastModel = result.model
    for (const q of result.questions) {
      if (q.difficulty !== tier) continue
      if (contentMode === 'image' && !q.imageUrl && !q.imageSubject) continue
      const key = questionKey(q)
      if (seen.has(key)) continue
      seen.add(key)
      collected.push(q)
      if (collected.length >= TARGET) break
    }
    if (collected.length >= TARGET) break
  }

  if (themeInvalid && lastError) {
    return { questions: [], source: 'mock', error: lastError }
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

  return {
    questions: collected.slice(0, TARGET),
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

async function callGroq(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const res = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
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
    throw new Error(`Groq ${res.status} (${model}): ${detail.slice(0, 400)}`)
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
