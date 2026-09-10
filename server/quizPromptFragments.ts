/**
 * quizPromptFragments.ts
 * Fragments modulaires du prompt de génération de quiz.
 * IMPORTANT : ces fragments ont été vérifiés pour être autonomes — aucun fragment
 * ne fait référence à une règle contenue dans un AUTRE fragment optionnel (ex: le
 * bloc MOYEN ne dépend plus du bloc FACILE, PORTÉE ne dépend plus du bloc FACILE).
 * Ne pas reformuler ces fragments sans revérifier les références croisées.
 *
 * PATCH CACHING (voir conversation) :
 * - Les blocs de règles ne contiennent plus {theme} / {sous_theme} : le préfixe
 *   reste identique d'un thème à l'autre (même difficulté + même question_count).
 * - {question_count} EST interpolé dans REGLES_BASE : un « 10 » figé contredisait
 *   le rattrapage (1–6 Q). Le cache se partage entre lots de même taille, pas
 *   entre un lot de 10 et un topup de 3 — et c'est voulu.
 * - construirePrompt() place les règles EN PREMIER, le thème/historique EN DERNIER.
 */

// ─────────────────────────────────────────────
// REGLES_BASE — toujours incluses, quel que soit le niveau appelé
// Pas de {theme}/{sous_theme} (fin de prompt). {question_count} oui, pour coller au lot.
// ─────────────────────────────────────────────
export const REGLES_BASE = `
FIABILITÉ
- Faits réels, vérifiables, jamais inventés. Incertain à 100% → remplace la question.
- 1 seule bonne réponse. Les 3 fausses indiscutablement fausses en TOUT contexte — teste chacune mentalement.
- Reformulation ne garantissant pas une réponse unique → abandonne.

LANGUE / PÉRIMÈTRE
- Français naturel, fluide, natif — jamais de traduction littérale ni tournure calquée.
- Teste chaque question/réponse : "je dirais ça à l'oral ?" Si non → réécris entièrement.
- Vocabulaire francophone courant, pas de calque anglais.
- Reste strictement dans le thème et le sous-thème demandés (précisés en fin de prompt).

MODÉRATION
- Sujets sensibles (histoire, religion, politique, conflits, tragédies) : factuel, neutre, zéro opinion.
- Jamais violent, choquant, discriminatoire, sexuel — reformule/remplace si risque, même exact.

EXPLICATION + SOURCE (chaque question)
- "explication" : 1-3 phrases, compréhensible sans connaître la réponse.
- "source" : nominative et réelle (organisme/institution/encyclopédie/ouvrage officiel — ex: NASA, FIFA, Larousse). Jamais vague.
- Interdit : titre d'article, date de publication, auteur/journaliste, URL (trop risqué d'invention).
- Obligatoire. Non sourçable nominativement → remplace la question.

DATATION DES FAITS ÉVOLUTIFS
- Fait pouvant changer (record, poste, cumul, actualité) → préciser date/période dans la question.
- "date_reference" renseigné (année/période, ou null si permanent).
- Actualité : date (mois+année) obligatoire, sans exception.
- Jamais de date approximative inventée — incertain → choisis un fait non daté.
- Consoles/jeux/extensions : année exacte obligatoire (ex: portable Nintendo 2017 = Switch, pas 3DS).

ANTI-PRÉMISSE FAUSSE
- Jamais présupposer catégorie/statut/rôle erroné (ex: "quel groupe" pour un artiste solo ; "chanteuse" pour un chanteur homme, ou l'inverse).
- Relis chaque terme catégoriel (solo/groupe, genre) ; doute → formule neutre.

ANTI-CONFUSION
- Ne mélange jamais œuvre originale et adaptation — reste sur une version, précise si besoin.
- Vérifie l'absence d'homonymes ambigus ; précise un identifiant si nécessaire.
- Chiffres approximatifs → toujours "environ", jamais présentés comme exacts.

ANTI-DOUBLON
- Aucune question/fait redondant dans le lot de {question_count}.
- Aucun doublon avec un autre niveau du même sous-thème (même reformulé — compare le FAIT, pas le texte).
- Aucun doublon avec l'historique fourni. Sous-thème trop pointu → élargis le périmètre, ne répète pas.

COHÉRENCE INTERNE (anti-mélange entre questions du lot)
- Chaque question autonome : réponse, explication, source portent EXCLUSIVEMENT sur son propre sujet.
- Sujets proches (films, pays, personnalités) : vigilance renforcée, reformule distinctement.

DIVERSITÉ DES BONNES RÉPONSES
- Contenu de la bonne réponse jamais répété dans le lot de {question_count} (position A/B/C/D non concernée).
- Avant de finaliser : liste mentalement les {question_count} bonnes réponses, remplace en cas de doublon.

DIVERSITÉ DES MAUVAISES RÉPONSES
- Réutilisation d'un élément en mauvaise réponse limitée à 2-3 fois max dans le lot.
- Interdit : un élément mauvaise réponse dans une question devient bonne réponse ailleurs (et inversement).

PIÈGES FRÉQUENTS (abandonne la question si risque)
- Pas de tautologie (bonne réponse = nom du thème/titre testé).
- Pas de "premier / a inventé / a popularisé" sans fait consensuel solide.
- Pas de "le plus célèbre / le meilleur" subjectif.
- Fiction/jeux (Dofus, manga…) : aucun lore inventé ; Wiki seul insuffisant → source officielle, sinon abandon.
- Co-création média : ne réduis pas à un seul nom si plusieurs créateurs.

CONTRÔLE FINAL DE QUANTITÉ
- Avant de livrer le JSON : compte le tableau — EXACTEMENT {question_count} questions.

PORTÉE
- "Français" : priorise France/francophonie UNIQUEMENT sur : Histoire, Cinéma, Musique, Littérature, Actualité, Cuisine, Sport, Art, Géographie.
- "International" : vivier mondial, sans priorité géographique.
- Si la portée reçue est "Français" hors de cette liste → traite comme "International" (pas d'ancrage FR forcé).
- La portée ajuste le périmètre géographique, jamais le niveau de difficulté.

LANGUES (apprentissage)
- Si le thème est « Langues », le sous-thème = langue cible. « Général » = mélange de langues courantes.
- Sous-thèmes VALIDES (génère toujours, sans {"erreur":...}) :
  Latin : Anglais, Espagnol, Allemand, Italien, Portugais, Français, Néerlandais, Turc, Polonais, Suédois, Vietnamien.
  Écriture spéciale (MÊME règle pour toutes) : Arabe, Japonais, Coréen, Chinois, Russe, Grec, Hébreu, Hindi, Cambodgien (= khmer).
- Priorise l'apprentissage : vocabulaire courant, traduction FR ↔ langue cible, phrases utiles, conjugaison / grammaire de base — pas de culture générale sur le pays.
- Ces règles d'apprentissage PRIMENT sur le calibrage spectateur/coulisses et sur les tests « personne dans la rue ».
- ANTI-SPOILER STRICT sur les 4 réponses du QCM :
  - INTERDIT le sens français dans les options (interdit : 안녕하세요 (bonjour) ou 안녕하세요 (annyeonghaseyo) (bonjour)).
  - Le sens français va UNIQUEMENT dans "explication", jamais dans "reponses".
- FORMAT OBLIGATOIRE — écritures spéciales (Arabe, Japonais, Coréen, Chinois, Russe, Grec, Hébreu, Hindi, Cambodgien) :
  "forme native (transcription latine)" — une seule paire de parenthèses, transcription uniquement (pas de français).
  Exemples (applique le même principe à CHAQUE langue spéciale) :
  - Japonais : こんにちは (konnichiwa)
  - Coréen : 안녕하세요 (annyeonghaseyo)
  - Chinois : 你好 (nihao)
  - Arabe : مرحبا (marhaba)
  - Russe : привет (privet)
  - Grec : γεια (geia)
  - Hébreu : שלום (shalom)
  - Hindi : नमस्ते (namaste)
  - Cambodgien : សួស្តី (suostei)
  Si l'écriture native est incertaine : transcription latine SEULE encore acceptable (ex. suostei), plutôt que d'inventer des caractères.
- Alphabet latin (Anglais, Espagnol, etc.) : mot/phrase seul, SANS parenthèse de sens FR.
- Énonce clairement ce qui est demandé. Facile = quotidien ; moyen = faux amis / temps courants ; difficile = nuances.
- Traductions exactes uniquement. Sources : Larousse, dictionnaire, Wiktionnaire, manuel scolaire.
- fait_verifiable = true pour toute traduction standard de vocabulaire courant.
- INTERDIT de refuser un sous-thème Langues listé.

THÈME LIBRE (hors 17 thèmes prédéfinis)
- Identifie la famille de rattachement, applique strictement niveau/fiabilité/anti-doublon.
- Trop pointu pour 10 questions fiables → élargis, n'invente pas.
- Ambigu/mal orthographié → interprétation la plus probable et grand public.
- Inapproprié/mal documenté → ne génère rien, retourne {"erreur": "Thème non valide ou insuffisamment documenté pour générer un quiz fiable."}

CONSIGNE DE GÉNÉRATION (applique chaque règle en écrivant, pas en relecture finale)
Applique TOUTES les règles ci-dessus pendant la formulation de chaque question, une par une. Question qui enfreint une règle → NE L'ÉCRIS PAS, reformule directement.
`.trim()

// ─────────────────────────────────────────────
// REGLES_ANTI_INVENTION — toujours incluses, renforce FIABILITÉ côté code
// 100% statique (inchangé — ne contenait déjà aucun placeholder)
// ─────────────────────────────────────────────
export const REGLES_ANTI_INVENTION = `
INTERDICTION ABSOLUE D'INVENTION
- Chaque fait doit être réel, vérifiable, connu avec certitude absolue.
- "fait_verifiable" = true UNIQUEMENT si certitude 100% — sinon exclue la question.
- "source" OBLIGATOIRE et NOMINATIVE : organisme, institution, encyclopédie ou ouvrage identifiable (ex: NASA, FIFA, Wikipédia, Larousse, INSEE, BBC, Michelin).
- Interdit comme source : "culture générale", "notoriété publique", "fait historique documenté", "fait scientifique établi", "connaissance commune", ou toute catégorie vague sans référent nommé.
- Lore fiction/jeux : n'invente aucun lieu, extension, monnaie, personnage secondaire ; Wiki seul + incertitude → abandonne.
- Pas de source nominative fiable → exclue la question.
- Mieux vaut MOINS de questions que d'en fabriquer pour le quota.
- Doute sur fait/date/nom/attribution → abandonne, passe à un autre fait sûr.
`.trim()

// ─────────────────────────────────────────────
// Blocs de difficulté — un seul est inclus par appel, jamais plusieurs
// Chacun est autonome (aucune référence à un autre bloc de difficulté)
// Désormais 100% statiques : {sous_theme} remplacé par une formulation générique
// ─────────────────────────────────────────────
export const REGLES_FACILE = `
NIVEAU FACILE — STRICT
- Uniquement des faits "spectateur/grand public" (ce que perçoit un consommateur passif) — jamais de faits "coulisses/technique" (production, stats précises, dates exactes, pros non médiatisés).
- INTERDIT en facile, quel que soit le thème : réalisateur, scénariste, producteur, compositeur, label, développeur, studio, architecte, inventeur/chef créateur — même si célèbre. Reclasse en moyen/difficile.
- Le facile doit être NETTEMENT plus simple que le moyen, pas une variante légère. Priorise systématiquement le fait le PLUS connu du sujet.
- Test de validation : une personne au hasard dans la rue, sans intérêt pour le sous-thème demandé, devine/connaît-elle la réponse par simple exposition culturelle (télé, école, conversations) ? Si non → reclasse.
- En cas de doute entre deux formulations, choisis toujours la plus simple.
`.trim()

export const REGLES_MOYEN = `
NIVEAU MOYEN — STRICT
- Cible : personne qui suit le sujet occasionnellement (articles, documentaires, discussions) — ni novice total, ni passionné pointu.
- Interdit de retomber en facile déguisé (test : une personne sans intérêt pour le sous-thème demandé ne doit pas pouvoir deviner par simple bon sens — si c'est le cas, remonte le niveau de détail) ou de monter en difficile (pas de stats ultra-précises, pas de faits réservés aux spécialistes) — zone de "curiosité qui demande un peu de réflexion", pas de mémorisation experte.
- Rôles de production autorisés seulement s'ils sont notoires dans leur domaine — pas de noms obscurs de crédits de fin.
- Test : quelqu'un d'intérêt modéré répondrait en réfléchissant un peu ou en faisant un lien logique, sans certitude immédiate ni ignorance totale.
`.trim()

export const REGLES_DIFFICILE = `
NIVEAU DIFFICILE — STRICT
- Cible : passionné/connaisseur réel, pas un expert professionnel (sauf si le sous-thème l'exige).
- Faits précis autorisés et attendus (stats, dates exactes, détails techniques, pros peu médiatisés) mais toujours vérifiables — jamais un détail invérifiable ou quasi impossible à documenter.
- Interdit : trivia à laquelle même un passionné aurait une chance quasi nulle de répondre, ou un fait disputé/mono-source.
- Test : un connaisseur reconnu du sous-thème demandé répondrait-il sans recherche ? Si non, remplace par un fait difficile mais accessible.
`.trim()

// ─────────────────────────────────────────────
// ANCRAGE_PAR_THEME — inclus UNIQUEMENT si difficulte === "facile"
// Dépend du vocabulaire "spectateur/coulisses" défini dans REGLES_FACILE :
// ne JAMAIS inclure ce fragment sans REGLES_FACILE dans le même prompt.
// 100% statique (inchangé — ne contenait déjà aucun placeholder)
// ─────────────────────────────────────────────
export const ANCRAGE_PAR_THEME = `
ANCRAGE SPECTATEUR/COULISSES PAR THÈME (calibrage, non exhaustif)
Histoire: événements connus / dates-traités précis. Sport: champions connus / entraîneurs-stats. Musique: artiste-tube connu / compositeur-label. Cinéma: acteurs-répliques cultes / réalisateur-studio. Géographie: pays-monuments connus / relief-démographie. Sciences: faits scolaires / chercheur-process. Tech: marques connues / specs-dates précises. Nature: animaux connus / classification scientifique. Cuisine: plats-origine connus / technique-chef-date. Art: œuvres célèbres / mouvement-technique. Mythologie: dieux-héros connus / généalogies-variantes. Littérature: livres-auteurs connus / courants-dates précises. Animaux: animaux du quotidien / classification-comportements. Espace: astronomie scolaire / missions-données techniques. Jeux vidéo: jeux-persos populaires / studio-moteur-date. Actualité: tendances connues et datées / détails ponctuels précis — jamais de fait instable non daté. Langues: mots/phrases du quotidien / conjugaisons-nuances-faux amis.
Thème libre : applique le même principe spectateur/coulisses de façon autonome.
`.trim()

// ─────────────────────────────────────────────
// Format de sortie — toujours inclus, en dernier
// Reste variable (interpole theme/sous_theme/difficulte/portee/question_count) :
// c'est volontaire, il reste en toute fin de prompt donc n'affecte pas le cache
// de tout ce qui le précède.
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
//
// ORDRE (patché pour le prompt caching) :
//   1. Blocs 100% fixes (REGLES_BASE, REGLES_ANTI_INVENTION, blocDifficulte, ancrage)
//   2. Partie variable (intro : thème/sous-thème/historique, puis FORMAT_SORTIE)
//
// Préfixe identique pour une même difficulté + un même question_count, quel que
// soit le thème. Un topup (count ≠ 10) a un préfixe différent — normal.
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
  /** Mode Aléatoire : une affectation thème/sous-thème par question */
  mixAssignments?: { theme: string; sousTheme: string }[]
}

export function construirePrompt({
  theme,
  sousTheme,
  difficulte,
  portee,
  historiqueQuestions,
  questionCount = 10,
  mode = 'full',
  mixAssignments,
}: PromptParams): string {
  if (!BLOCS_DIFFICULTE[difficulte]) {
    throw new Error(
      `Difficulté inconnue : "${difficulte}" — attendu: facile, moyen, ou difficile`,
    )
  }

  const count = Math.max(1, Math.min(10, questionCount))
  const isMix = Array.isArray(mixAssignments) && mixAssignments.length > 0
  const topUpNote =
    mode === 'topup'
      ? `\n\nRATTRAPAGE : génère EXACTEMENT ${count} question(s) SUPPLÉMENTAIRE(s) inédites. N'invente AUCUN fait pour compléter. Si tu n'as pas ${count} faits vérifiables à 100%, retourne moins de questions plutôt que d'en fabriquer.`
      : ''

  const mixList = isMix
    ? mixAssignments!
        .slice(0, count)
        .map((a, i) => `Q${i + 1}: "${a.theme}" > "${a.sousTheme}"`)
        .join('\n')
    : ''

  const intro = isMix
    ? `Tu es un générateur de quiz expert et rigoureux. Génère EXACTEMENT ${count} questions à choix multiples en mode MIX ALÉATOIRE : chaque question porte sur un couple thème/sous-thème DIFFÉRENT (liste ci-dessous), niveau "${difficulte}", portée "${portee}".${topUpNote}

Affectation OBLIGATOIRE (une question = un couple, dans l'ordre) :
${mixList}

Règles mix :
- Respecte STRICTEMENT le couple assigné à chaque question (pas de mélange entre Q).
- Maximise la diversité : domaines, époques, pays, œuvres — pas deux questions sur le même sujet proche.
- Les champs JSON "theme" et "sous_theme" de chaque question doivent reprendre EXACTEMENT le couple assigné.

Historique à ne jamais répéter (questions déjà posées, tous niveaux) : ${JSON.stringify(historiqueQuestions && historiqueQuestions.length > 0 ? historiqueQuestions : [])}`
    : `Tu es un générateur de quiz expert et rigoureux. Génère EXACTEMENT ${count} questions à choix multiples sur le thème "${theme}", sous-thème "${sousTheme}", niveau "${difficulte}", portée "${portee}".${topUpNote}

Historique à ne jamais répéter (questions déjà posées, tous niveaux) : ${JSON.stringify(historiqueQuestions && historiqueQuestions.length > 0 ? historiqueQuestions : [])}`

  const blocDifficulte = BLOCS_DIFFICULTE[difficulte]

  // L'ancrage par thème n'est inclus QUE pour le niveau facile (dépendance documentée ci-dessus)
  const ancrage = difficulte === 'facile' ? ANCRAGE_PAR_THEME : ''

  const formatMix = isMix
    ? FORMAT_SORTIE.replace(
        `Génère maintenant EXACTEMENT {question_count} questions sur "{theme}" > "{sous_theme}", niveau "{difficulte}", portée "{portee}".`,
        `Génère maintenant EXACTEMENT {question_count} questions selon la liste MIX ALÉATOIRE ci-dessus (Q1…Q{question_count}), niveau "{difficulte}", portée "{portee}". Chaque objet JSON doit avoir "theme"/"sous_theme" = couple assigné.`,
      )
    : FORMAT_SORTIE

  // Partie FIXE en premier (identique quel que soit le thème demandé, pour un même
  // couple difficulté/ancrage), partie VARIABLE en dernier (thème, historique, format)
  const morceaux = [
    REGLES_BASE,
    REGLES_ANTI_INVENTION,
    blocDifficulte,
    ancrage,
    intro,
    formatMix,
  ].filter(Boolean)

  // {theme}/{sous_theme} ne touchent que l'intro et FORMAT_SORTIE (fin de prompt).
  // {question_count} est aussi dans REGLES_BASE, pour que le quota du lot soit cohérent.
  return morceaux
    .join('\n\n')
    .replaceAll('{theme}', isMix ? 'Aléatoire' : theme)
    .replaceAll('{sous_theme}', isMix ? 'Mix' : sousTheme)
    .replaceAll('{difficulte}', difficulte)
    .replaceAll('{portee}', portee)
    .replaceAll('{question_count}', String(count))
}
