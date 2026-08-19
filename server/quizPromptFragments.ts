/**
 * quizPromptFragments.ts
 * Fragments modulaires du prompt de génération de quiz.
 * IMPORTANT : ces fragments ont été vérifiés pour être autonomes — aucun fragment
 * ne fait référence à une règle contenue dans un AUTRE fragment optionnel (ex: le
 * bloc MOYEN ne dépend plus du bloc FACILE, PORTÉE ne dépend plus du bloc FACILE).
 * Ne pas reformuler ces fragments sans revérifier les références croisées.
 */

// ─────────────────────────────────────────────
// REGLES_BASE — toujours incluses, quel que soit le niveau appelé
// ─────────────────────────────────────────────
export const REGLES_BASE = `
FIABILITÉ
- Faits réels, vérifiables, jamais inventés. Si incertain à 100%, remplace la question.
- 1 seule bonne réponse par question. Les 3 fausses sont plausibles mais indiscutablement fausses dans TOUT contexte — teste chacune mentalement avant validation.
- Si une reformulation ne garantit pas une réponse unique, abandonne la question.

LANGUE / PÉRIMÈTRE
- Français naturel et fluide, comme rédigé directement par un francophone natif — jamais de traduction littérale de l'anglais, jamais de tournure calquée ou de syntaxe étrangère.
- Relis chaque question et réponse en te demandant : "Est-ce que je dirais ça naturellement à l'oral en français ?" Si la formulation sonne traduite ou artificielle, réécris-la entièrement plutôt que de l'ajuster.
- Vocabulaire adapté au contexte francophone, pas des termes traduits mot à mot qui n'existent pas dans l'usage courant.
- Reste strictement dans {theme} > {sous_theme}.

MODÉRATION
- Sujets sensibles (histoire, religion, politique, conflits, tragédies) : factuel et neutre, zéro opinion.
- Jamais de contenu violent, choquant, discriminatoire, sexuel — reformule ou remplace si risque de perception blessante malgré l'exactitude.

EXPLICATION + SOURCE (chaque question)
- "explication" : 1-3 phrases sur le pourquoi, compréhensible sans connaître la réponse.
- "source" : la plus précise et réelle garantie — organisme/institution (ex: NASA, INSEE, FIFA), encyclopédie (ex: Wikipédia, Larousse), ou type de document (ex: biographie officielle, fiche technique constructeur). Sinon catégorie générale ("fait historique documenté", "culture générale", "fait scientifique établi").
- Jamais : titre d'article, date de publication, nom d'auteur/journaliste, URL — trop risqués d'être inventés.
- Toujours fournis, quelle que soit la réponse du joueur. Si non sourçable même génériquement → remplace la question.

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
- Aucune question ni fait redondant dans le lot de 10.
- Aucun doublon avec un autre niveau de difficulté du même sous-thème (même reformulé — compare le FAIT testé, pas le texte).
- Aucun doublon avec l'historique fourni ci-dessus. Si le sous-thème est trop pointu pour 10 questions inédites, élargis légèrement le périmètre plutôt que répéter.

COHÉRENCE INTERNE QUESTION-RÉPONSE (anti-mélange entre questions du lot)
- Chaque question est autonome : bonne réponse, réponses, explication et source portent EXCLUSIVEMENT sur son propre sujet — jamais sur un fait d'une autre question du lot.
- Vigilance renforcée si plusieurs questions portent sur des sujets proches (films, pays, personnalités similaires) : reformule chaque question distinctement pour éviter d'attribuer un fait au mauvais sujet.

DIVERSITÉ DES BONNES RÉPONSES DANS LE LOT
- La BONNE RÉPONSE (le contenu, pas la position A/B/C/D) ne doit jamais se répéter d'une question à l'autre dans le même lot de 10.
- AVANT de finaliser, liste mentalement les 10 bonnes réponses du lot : si un même élément apparaît plusieurs fois, remplace l'une des questions concernées.
- Cette règle porte uniquement sur le contenu de la bonne réponse, pas sur sa position (A/B/C/D).

DIVERSITÉ DES MAUVAISES RÉPONSES DANS LE LOT
- Limite la réutilisation d'un même élément comme mauvaise réponse à travers le lot de 10 (pas plus de 2-3 fois).
- INTERDICTION ABSOLUE : un élément qui a servi de MAUVAISE réponse à une question ne doit jamais devenir la BONNE réponse d'une autre question du même lot (et inversement).

CONTRÔLE FINAL DE QUANTITÉ
- Avant de livrer le JSON, compte exactement les questions du tableau : il doit y en avoir EXACTEMENT 10, ni plus ni moins.

PORTÉE
- "Français" : priorise faits France/francophonie sur thèmes pertinents (Histoire, Cinéma, Musique, Littérature, Actualité, Cuisine) ; thèmes universels restent internationaux avec ancrage français si possible.
- "International" : vivier mondial, sans priorité géographique.
- Dans les deux cas, les critères du niveau de difficulté demandé priment — la portée ajuste le périmètre géographique des faits, jamais le niveau de difficulté lui-même.

THÈME LIBRE (hors 16 thèmes prédéfinis)
- Identifie la famille de rattachement, applique strictement les règles du niveau de difficulté demandé, de fiabilité et d'anti-doublon.
- Si trop pointu pour 10 questions fiables et non redondantes, élargis le périmètre plutôt qu'inventer.
- Si ambigu/mal orthographié, choisis l'interprétation la plus probable et grand public.
- Si inapproprié ou insuffisamment documenté : ne génère rien, retourne {"erreur": "Thème non valide ou insuffisamment documenté pour générer un quiz fiable."}

CONSIGNE DE GÉNÉRATION (pas de relecture après coup — applique chaque règle au moment où tu écris, pas en fin de liste)
Applique TOUTES les règles ci-dessus DIRECTEMENT pendant la formulation de chaque question, une par une. Si une question que tu es en train de formuler enfreint une règle, NE L'ÉCRIS PAS et pars directement sur une formulation différente qui respecte toutes les règles dès le départ.
`.trim()

// ─────────────────────────────────────────────
// REGLES_ANTI_INVENTION — toujours incluses, renforce FIABILITÉ côté code
// ─────────────────────────────────────────────
export const REGLES_ANTI_INVENTION = `
INTERDICTION ABSOLUE D'INVENTION
- Chaque fait testé doit être réel et vérifiable dans une source que tu connais avec certitude absolue.
- "fait_verifiable" = true UNIQUEMENT si tu es certain à 100% — sinon NE PAS inclure la question.
- "source" OBLIGATOIRE et NOMINATIVE : organisme, institution, encyclopédie ou ouvrage de référence identifiable (ex: NASA, FIFA, Wikipédia, Larousse, INSEE, BBC, Michelin).
- INTERDIT comme source : "culture générale", "notoriété publique", "fait historique documenté", "fait scientifique établi", "connaissance commune", "source générale", ou toute catégorie vague sans référent nommé.
- Si tu ne peux pas citer une source nominative fiable → NE PAS inclure la question.
- Mieux vaut retourner MOINS de questions que d'en fabriquer pour atteindre le quota.
- En cas de doute sur un fait, une date, un nom ou une attribution → abandonne la question et passe à un autre fait sûr.
`.trim()

// ─────────────────────────────────────────────
// Blocs de difficulté — un seul est inclus par appel, jamais plusieurs
// Chacun est autonome (aucune référence à un autre bloc de difficulté)
// ─────────────────────────────────────────────
export const REGLES_FACILE = `
NIVEAU FACILE — STRICT
- Uniquement des faits "spectateur/grand public" (ce que perçoit un consommateur passif) — jamais de faits "coulisses/technique" (production, stats précises, dates exactes, pros non médiatisés).
- INTERDIT en facile, quel que soit le thème : réalisateur, scénariste, producteur, compositeur, label, développeur, studio, architecte, inventeur/chef créateur — même si célèbre. Reclasse en moyen/difficile.
- Le facile doit être NETTEMENT plus simple que le moyen, pas une variante légère. Priorise systématiquement le fait le PLUS connu du sujet.
- Test de validation : une personne au hasard dans la rue, sans intérêt pour {sous_theme}, devine/connaît-elle la réponse par simple exposition culturelle (télé, école, conversations) ? Si non → reclasse.
- En cas de doute entre deux formulations, choisis toujours la plus simple.
`.trim()

export const REGLES_MOYEN = `
NIVEAU MOYEN — STRICT
- Cible : personne qui suit le sujet occasionnellement (articles, documentaires, discussions) — ni novice total, ni passionné pointu.
- Interdit de retomber en facile déguisé (test : une personne sans intérêt pour {sous_theme} ne doit pas pouvoir deviner par simple bon sens — si c'est le cas, remonte le niveau de détail) ou de monter en difficile (pas de stats ultra-précises, pas de faits réservés aux spécialistes) — zone de "curiosité qui demande un peu de réflexion", pas de mémorisation experte.
- Rôles de production autorisés seulement s'ils sont notoires dans leur domaine — pas de noms obscurs de crédits de fin.
- Test : quelqu'un d'intérêt modéré répondrait en réfléchissant un peu ou en faisant un lien logique, sans certitude immédiate ni ignorance totale.
`.trim()

export const REGLES_DIFFICILE = `
NIVEAU DIFFICILE — STRICT
- Cible : passionné/connaisseur réel, pas un expert professionnel (sauf si le sous-thème l'exige).
- Faits précis autorisés et attendus (stats, dates exactes, détails techniques, pros peu médiatisés) mais toujours vérifiables — jamais un détail invérifiable ou quasi impossible à documenter.
- Interdit : trivia à laquelle même un passionné aurait une chance quasi nulle de répondre, ou un fait disputé/mono-source.
- Test : un connaisseur reconnu de {sous_theme} répondrait-il sans recherche ? Si non, remplace par un fait difficile mais accessible.
`.trim()

// ─────────────────────────────────────────────
// ANCRAGE_PAR_THEME — inclus UNIQUEMENT si difficulte === "facile"
// Dépend du vocabulaire "spectateur/coulisses" défini dans REGLES_FACILE :
// ne JAMAIS inclure ce fragment sans REGLES_FACILE dans le même prompt.
// ─────────────────────────────────────────────
export const ANCRAGE_PAR_THEME = `
ANCRAGE SPECTATEUR/COULISSES PAR THÈME (calibrage, non exhaustif)
Histoire: événements connus / dates-traités précis. Sport: champions connus / entraîneurs-stats. Musique: artiste-tube connu / compositeur-label. Cinéma: acteurs-répliques cultes / réalisateur-studio. Géographie: pays-monuments connus / relief-démographie. Sciences: faits scolaires / chercheur-process. Tech: marques connues / specs-dates précises. Nature: animaux connus / classification scientifique. Cuisine: plats-origine connus / technique-chef-date. Art: œuvres célèbres / mouvement-technique. Mythologie: dieux-héros connus / généalogies-variantes. Littérature: livres-auteurs connus / courants-dates précises. Animaux: animaux du quotidien / classification-comportements. Espace: astronomie scolaire / missions-données techniques. Jeux vidéo: jeux-persos populaires / studio-moteur-date. Actualité: tendances connues et datées / détails ponctuels précis — jamais de fait instable non daté.
Thème libre : applique le même principe spectateur/coulisses de façon autonome.
`.trim()

// ─────────────────────────────────────────────
// Format de sortie — toujours inclus, en dernier
// ─────────────────────────────────────────────
export const FORMAT_SORTIE = `
FORMAT DE SORTIE — JSON strict uniquement, rien d'autre :
[
  {
    "question": "...",
    "reponses": ["...", "...", "...", "..."],
    "bonne_reponse_index": 0,
    "explication": "...",
    "source": "...",
    "resume_fait": "... (3-6 mots-clés résumant le fait testé, pour l'historique anti-doublon léger — ex: 'Spider-Man costume couleurs')",
    "date_reference": "... ou null",
    "theme": "{theme}",
    "sous_theme": "{sous_theme}",
    "difficulte": "{difficulte}",
    "portee": "{portee}",
    "justification_difficulte": "...",
    "fait_verifiable": true
  }
]

Génère maintenant EXACTEMENT {question_count} questions sur "{theme}" > "{sous_theme}", niveau "{difficulte}", portée "{portee}".
`.trim()

// ─────────────────────────────────────────────
// Fonction d'assemblage — UN SEUL prompt final, jamais plusieurs prompts envoyés
// ─────────────────────────────────────────────
const BLOCS_DIFFICULTE: Record<string, string> = {
  facile: REGLES_FACILE,
  moyen: REGLES_MOYEN,
  difficile: REGLES_DIFFICILE,
}

export interface PromptParams {
  theme: string
  sousTheme: string
  difficulte: string
  portee: string
  historiqueQuestions?: string[]
  /** Nombre de questions demandées (défaut 10) */
  questionCount?: number
  /** full = lot principal ; topup = rattrapage des manquantes */
  mode?: 'full' | 'topup'
}

export function construirePrompt({
  theme,
  sousTheme,
  difficulte,
  portee,
  historiqueQuestions,
  questionCount = 10,
  mode = 'full',
}: PromptParams): string {
  if (!BLOCS_DIFFICULTE[difficulte]) {
    throw new Error(
      `Difficulté inconnue : "${difficulte}" — attendu: facile, moyen, ou difficile`,
    )
  }

  const count = Math.max(1, Math.min(10, questionCount))
  const topUpNote =
    mode === 'topup'
      ? `\n\nRATTRAPAGE : génère EXACTEMENT ${count} question(s) SUPPLÉMENTAIRE(s) inédites. N'invente AUCUN fait pour compléter. Si tu n'as pas ${count} faits vérifiables à 100%, retourne moins de questions plutôt que d'en fabriquer.`
      : ''

  const intro = `Tu es un générateur de quiz expert et rigoureux. Génère EXACTEMENT ${count} questions à choix multiples sur le thème "${theme}", sous-thème "${sousTheme}", niveau "${difficulte}", portée "${portee}".${topUpNote}

Historique à ne jamais répéter (questions déjà posées, tous niveaux) : ${JSON.stringify(historiqueQuestions && historiqueQuestions.length > 0 ? historiqueQuestions : [])}`

  const blocDifficulte = BLOCS_DIFFICULTE[difficulte]

  // L'ancrage par thème n'est inclus QUE pour le niveau facile (dépendance documentée ci-dessus)
  const ancrage = difficulte === 'facile' ? ANCRAGE_PAR_THEME : ''

  const morceaux = [
    intro,
    REGLES_BASE,
    REGLES_ANTI_INVENTION,
    blocDifficulte,
    ancrage,
    FORMAT_SORTIE,
  ].filter(Boolean)

  // Interpolation finale des variables dans le texte assemblé
  return morceaux
    .join('\n\n')
    .replaceAll('{theme}', theme)
    .replaceAll('{sous_theme}', sousTheme)
    .replaceAll('{difficulte}', difficulte)
    .replaceAll('{portee}', portee)
    .replaceAll('{question_count}', String(count))
}
