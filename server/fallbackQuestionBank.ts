/**
 * fallbackQuestionBank.ts
 * Banque de questions STATIQUES, pré-écrites, jamais générées par IA.
 * Utilisée UNIQUEMENT en tout dernier recours, si la cascade technique
 * (retry + modèle de secours) ET la cascade contenu (historique épuisé)
 * échouent TOUTES LES DEUX. Garantit qu'un quiz est toujours jouable.
 *
 * IMPORTANT : ce fichier ne contient qu'un échantillon de départ (3-5 questions
 * par thème principal) — à enrichir progressivement pour couvrir plus de cas
 * et plus de variété si ce filet de secours est déclenché souvent en pratique.
 */

export interface FallbackQuestion {
  question: string
  reponses: [string, string, string, string]
  bonne_reponse_index: 0 | 1 | 2 | 3
  explication: string
  source: string
}

export const FALLBACK_QUESTIONS: Record<string, FallbackQuestion[]> = {
  Histoire: [
    {
      question: 'En quelle année a eu lieu la Révolution française ?',
      reponses: ['1789', '1750', '1804', '1815'],
      bonne_reponse_index: 0,
      explication: 'La Révolution française débute en 1789 avec la prise de la Bastille.',
      source: 'fait historique documenté',
    },
    {
      question: "Qui était empereur des Français après la Révolution ?",
      reponses: ['Napoléon Bonaparte', 'Louis XVI', 'Charlemagne', 'Louis-Philippe'],
      bonne_reponse_index: 0,
      explication: "Napoléon Bonaparte se couronne empereur en 1804.",
      source: 'fait historique documenté',
    },
    {
      question: "Quel mur symbolisait la division de l'Europe pendant la Guerre froide ?",
      reponses: ['Le mur de Berlin', 'La ligne Maginot', "Le mur d'Hadrien", 'La grande muraille'],
      bonne_reponse_index: 0,
      explication: "Le mur de Berlin, construit en 1961, séparait Berlin-Est et Berlin-Ouest.",
      source: 'fait historique documenté',
    },
  ],
  Sport: [
    {
      question: 'Combien de joueurs composent une équipe de football sur le terrain ?',
      reponses: ['11', '9', '13', '7'],
      bonne_reponse_index: 0,
      explication: "Une équipe de football aligne 11 joueurs, dont un gardien.",
      source: 'culture générale',
    },
    {
      question: "Tous les combien d'années ont lieu les Jeux olympiques d'été ?",
      reponses: ['4 ans', '2 ans', '5 ans', '3 ans'],
      bonne_reponse_index: 0,
      explication: "Les JO d'été reviennent tous les 4 ans.",
      source: 'culture générale',
    },
    {
      question: 'Dans quel sport utilise-t-on une raquette et un volant ?',
      reponses: ['Le badminton', 'Le tennis', 'Le squash', 'Le tennis de table'],
      bonne_reponse_index: 0,
      explication:
        "Le badminton se joue avec un volant, contrairement au tennis qui utilise une balle.",
      source: 'culture générale',
    },
  ],
  Musique: [
    {
      question: 'Quel instrument possède 88 touches ?',
      reponses: ['Le piano', 'La guitare', 'Le violon', 'La flûte'],
      bonne_reponse_index: 0,
      explication: 'Un piano standard a 88 touches, noires et blanches.',
      source: 'culture générale',
    },
    {
      question: 'Combien de cordes possède une guitare classique ?',
      reponses: ['6', '4', '8', '5'],
      bonne_reponse_index: 0,
      explication: 'Une guitare classique standard a 6 cordes.',
      source: 'culture générale',
    },
  ],
  Cinéma: [
    {
      question: "Quel animal est le personnage principal du film 'Le Roi Lion' ?",
      reponses: ['Un lion', 'Un tigre', 'Un éléphant', 'Une girafe'],
      bonne_reponse_index: 0,
      explication: 'Simba, le personnage principal, est un lionceau qui devient roi.',
      source: 'culture générale',
    },
    {
      question:
        "Dans quel film un homme se retrouve seul sur une île déserte avec un ballon de volley ?",
      reponses: ['Seul au monde', 'Robinson Crusoé', 'Cast Away 2', "L'île"],
      bonne_reponse_index: 0,
      explication: "Dans 'Seul au monde' (Cast Away), le personnage baptise le ballon 'Wilson'.",
      source: 'culture générale',
    },
  ],
  Géographie: [
    {
      question: 'Quelle est la capitale de la France ?',
      reponses: ['Paris', 'Lyon', 'Marseille', 'Toulouse'],
      bonne_reponse_index: 0,
      explication: 'Paris est la capitale de la France depuis des siècles.',
      source: 'culture générale',
    },
    {
      question: 'Quel est le plus grand océan du monde ?',
      reponses: ["L'océan Pacifique", "L'océan Atlantique", "L'océan Indien", "L'océan Arctique"],
      bonne_reponse_index: 0,
      explication:
        "L'océan Pacifique est le plus vaste, couvrant environ un tiers de la surface terrestre.",
      source: 'fait géographique établi',
    },
  ],
  Sciences: [
    {
      question: "Quelle planète est surnommée la 'planète rouge' ?",
      reponses: ['Mars', 'Vénus', 'Jupiter', 'Saturne'],
      bonne_reponse_index: 0,
      explication: "Mars doit sa couleur rouge à l'oxyde de fer présent à sa surface.",
      source: 'fait scientifique établi',
    },
    {
      question: 'Combien de dents une personne adulte a-t-elle en moyenne ?',
      reponses: ['32', '28', '36', '24'],
      bonne_reponse_index: 0,
      explication: 'Un adulte a en moyenne 32 dents, en comptant les dents de sagesse.',
      source: 'fait scientifique établi',
    },
  ],
  Nature: [
    {
      question: 'Quel est le plus grand animal terrestre ?',
      reponses: ["L'éléphant d'Afrique", 'La girafe', 'Le rhinocéros', "L'hippopotame"],
      bonne_reponse_index: 0,
      explication: "L'éléphant d'Afrique est le plus grand mammifère terrestre.",
      source: 'culture générale',
    },
    {
      question: "Quelle est la couleur d'une banane mûre ?",
      reponses: ['Jaune', 'Violet', 'Bleu', 'Noir'],
      bonne_reponse_index: 0,
      explication: 'Fait de bon sens visible par tous au quotidien.',
      source: 'culture générale',
    },
  ],
  Cuisine: [
    {
      question: 'Quel ingrédient principal compose une omelette ?',
      reponses: ['Des œufs', 'Du lait', 'De la farine', 'Du fromage'],
      bonne_reponse_index: 0,
      explication: "Une omelette est faite d'œufs battus, cuits à la poêle.",
      source: 'culture générale',
    },
  ],
  Animaux: [
    {
      question: "Quel animal est surnommé le 'roi de la jungle' ?",
      reponses: ['Le lion', 'Le tigre', "L'éléphant", 'Le gorille'],
      bonne_reponse_index: 0,
      explication:
        "Le lion est traditionnellement surnommé ainsi, bien qu'il vive en savane plutôt qu'en jungle.",
      source: 'culture générale',
    },
  ],
  Espace: [
    {
      question: 'Quelle est la planète la plus proche du Soleil ?',
      reponses: ['Mercure', 'Vénus', 'Mars', 'Terre'],
      bonne_reponse_index: 0,
      explication: "Mercure est la première planète du système solaire en partant du Soleil.",
      source: 'fait scientifique établi',
    },
  ],
  'Jeux vidéo': [
    {
      question: 'Quel est le prénom du personnage principal de Super Mario ?',
      reponses: ['Mario', 'Luigi', 'Yoshi', 'Wario'],
      bonne_reponse_index: 0,
      explication: "Mario est le personnage emblématique créé par Nintendo.",
      source: 'culture générale',
    },
  ],
  Séries: [
    {
      question: "Quel personnage est connu pour dire 'Winter is coming' dans Game of Thrones ?",
      reponses: ['Eddard Stark', 'Tyrion Lannister', 'Jon Snow', 'Daenerys Targaryen'],
      bonne_reponse_index: 0,
      explication: "La devise de la maison Stark est associée à Eddard Stark au début de la série.",
      source: 'culture générale',
    },
    {
      question: "Dans quelle série suit-on des professeurs qui braquent la Fabrique nationale de la monnaie d'Espagne ?",
      reponses: ['La Casa de Papel', 'Elite', 'Vis a Vis', 'Narcos'],
      bonne_reponse_index: 0,
      explication: "La Casa de Papel met en scène le casse planifié par le Professeur.",
      source: 'culture générale',
    },
    {
      question: "Quel est le métier de Meredith Grey au début de Grey's Anatomy ?",
      reponses: ['Interne en chirurgie', 'Avocate', 'Infirmière', 'Journaliste'],
      bonne_reponse_index: 0,
      explication: "Meredith démarre la série comme interne en chirurgie au Seattle Grace.",
      source: 'culture générale',
    },
    {
      question: "Dans Stranger Things, dans quelle ville fictive se déroule principalement l'histoire ?",
      reponses: ['Hawkins', 'Sunnydale', 'Hill Valley', 'Smallville'],
      bonne_reponse_index: 0,
      explication: "La série se déroule principalement à Hawkins, dans l'Indiana.",
      source: 'culture générale',
    },
    {
      question: "Quel acteur interprète Michael Scott dans la version US de The Office ?",
      reponses: ['Steve Carell', 'Bryan Cranston', 'Jason Bateman', 'Paul Rudd'],
      bonne_reponse_index: 0,
      explication: "Steve Carell joue le rôle iconique de Michael Scott dans The Office US.",
      source: 'culture générale',
    },
  ],
}

// Pool générique multi-thèmes, utilisé si le thème demandé (notamment un thème
// libre non prédéfini) n'a pas d'entrée dédiée dans FALLBACK_QUESTIONS ci-dessus.
export const FALLBACK_GENERIQUE: FallbackQuestion[] = [
  {
    question: 'Combien de continents compte-t-on sur Terre ?',
    reponses: ['7', '5', '6', '8'],
    bonne_reponse_index: 0,
    explication: 'On distingue généralement 7 continents.',
    source: 'culture générale',
  },
  {
    question: 'Quelle est la monnaie utilisée en France ?',
    reponses: ["L'euro", 'Le franc', 'La livre', 'Le dollar'],
    bonne_reponse_index: 0,
    explication: 'La France utilise l\'euro depuis 2002.',
    source: 'culture générale',
  },
  {
    question: 'Combien de jours compte une année bissextile ?',
    reponses: ['366', '365', '364', '367'],
    bonne_reponse_index: 0,
    explication: 'Une année bissextile compte un jour de plus (29 février).',
    source: 'culture générale',
  },
  {
    question: 'Quelle est la langue la plus parlée au monde en nombre de locuteurs natifs ?',
    reponses: ['Le mandarin', "L'anglais", "L'espagnol", 'Le français'],
    bonne_reponse_index: 0,
    explication: "Le mandarin compte le plus grand nombre de locuteurs natifs au monde.",
    source: 'fait établi',
  },
  {
    question: "Combien de couleurs compose l'arc-en-ciel traditionnellement ?",
    reponses: ['7', '5', '6', '8'],
    bonne_reponse_index: 0,
    explication: "On compte traditionnellement 7 couleurs dans l'arc-en-ciel.",
    source: 'culture générale',
  },
]

function normalizeThemeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function resolveThemePool(theme: string): FallbackQuestion[] {
  const direct = FALLBACK_QUESTIONS[theme]
  if (direct?.length) return direct

  // Tolérance accents/casse (ex: "Cinema" -> "Cinéma")
  const wanted = normalizeThemeKey(theme)
  for (const [k, v] of Object.entries(FALLBACK_QUESTIONS)) {
    if (normalizeThemeKey(k) === wanted && v.length > 0) return v
  }
  return []
}

function resolveSubThemePool(sousTheme?: string): FallbackQuestion[] {
  if (!sousTheme) return []
  const direct = FALLBACK_QUESTIONS[sousTheme]
  if (direct?.length) return direct
  const wanted = normalizeThemeKey(sousTheme)
  for (const [k, v] of Object.entries(FALLBACK_QUESTIONS)) {
    if (normalizeThemeKey(k) === wanted && v.length > 0) return v
  }
  return []
}

export interface FallbackQuizQuestion extends FallbackQuestion {
  date_reference: null
  theme: string
  difficulte: string
  portee: string
  justification_difficulte: string
  fait_verifiable: true
  est_fallback_statique: true
}

/**
 * Récupère un lot de secours pour un thème donné.
 * Complète avec le pool générique si le thème n'a pas assez d'entrées dédiées.
 */
export function getFallbackQuiz(
  theme: string,
  nbQuestions = 10,
  sousTheme?: string,
): FallbackQuizQuestion[] {
  const subPool = resolveSubThemePool(sousTheme)
  const themedPool = resolveThemePool(theme)
  // Priorité stricte: sous-thème > thème > générique.
  const complet =
    subPool.length > 0
      ? subPool
      : themedPool.length > 0
        ? themedPool
        : FALLBACK_GENERIQUE

  if (complet.length === 0) return []

  // Mélange simple pour varier l'ordre à chaque appel
  const shuffled = [...complet].sort(() => Math.random() - 0.5)
  const selected: FallbackQuestion[] = []

  // Garantit un lot complet même si la banque statique contient moins de nbQuestions.
  // On reboucle sur le pool mélangé (ordre pseudo-aléatoire stable sur cet appel).
  for (let i = 0; i < nbQuestions; i++) {
    selected.push(shuffled[i % shuffled.length]!)
  }

  return selected.map((q) => ({
    ...q,
    date_reference: null,
    theme,
    difficulte: 'facile',
    portee: 'Français',
    justification_difficulte: 'Question de secours statique, calibrée simple par sécurité.',
    fait_verifiable: true as const,
    est_fallback_statique: true as const,
  }))
}
