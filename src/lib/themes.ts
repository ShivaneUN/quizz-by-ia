/** Thèmes en orbite + sous-thèmes */

export type ThemeTile = {
  id: string
  label: string
  color: string
  shape: 'circle' | 'rect'
  angle?: number
  /** Pastille désactivée (ex. bientôt) */
  soon?: boolean
}

const ORBIT_IDS: Omit<ThemeTile, 'angle'>[] = [
  { id: 'histoire', label: 'Histoire', color: '#6b4423', shape: 'circle' },
  { id: 'sport', label: 'Sport', color: '#1e7a3a', shape: 'circle' },
  { id: 'musique', label: 'Musique', color: '#5b2d8e', shape: 'circle' },
  { id: 'cinema', label: 'Cinéma', color: '#8b1e2d', shape: 'circle' },
  { id: 'geographie', label: 'Géographie', color: '#0d6b6b', shape: 'circle' },
  { id: 'sciences', label: 'Sciences', color: '#1a4a8a', shape: 'circle' },
  { id: 'tech', label: 'Tech', color: '#0f4c75', shape: 'circle' },
  { id: 'nature', label: 'Nature', color: '#2d6a4f', shape: 'circle' },
  { id: 'cuisine', label: 'Cuisine', color: '#a35a1f', shape: 'circle' },
  { id: 'art', label: 'Art', color: '#9b2d5a', shape: 'circle' },
  { id: 'mythologie', label: 'Mythologie', color: '#6a3d9a', shape: 'circle' },
  { id: 'litterature', label: 'Littérature', color: '#2a5080', shape: 'circle' },
  { id: 'animaux', label: 'Animaux', color: '#3d6b2a', shape: 'circle' },
  { id: 'espace', label: 'Espace', color: '#1a2a6b', shape: 'circle' },
  { id: 'jeuxvideo', label: 'Jeux vidéo', color: '#0d5c5c', shape: 'circle' },
  { id: 'actualite', label: 'Actualité', color: '#8a3a1a', shape: 'circle' },
  /** Orphelins banque — bientôt */
  { id: 'custom', label: 'Custom', color: '#4a5568', shape: 'circle', soon: true },
  /** Banque Q déjà générées — bientôt */
  {
    id: 'pregen',
    label: 'Thème pré-généré',
    color: '#6a5a2a',
    shape: 'circle',
    soon: true,
  },
]

/** Tous les thèmes sur la roue (angles répartis) */
export const ORBIT_THEMES: ThemeTile[] = ORBIT_IDS.map((t, i) => ({
  ...t,
  angle: -90 + (360 / ORBIT_IDS.length) * i,
}))

/** @deprecated tout est dans ORBIT_THEMES */
export const BOTTOM_THEMES: ThemeTile[] = []

/**
 * Sous-thèmes par thème parent.
 * "Général" = tout le thème sans focus particulier.
 * `custom` : sous-thèmes orphelins banque (complétés dynamiquement côté UI).
 */
export const SUBTHEMES: Record<string, string[]> = {
  histoire: [
    'Général',
    'Antiquité',
    'Moyen Âge',
    'Renaissance',
    'Révolutions',
    'Guerres mondiales',
    'Histoire contemporaine',
  ],
  sport: [
    'Général',
    'Football',
    'Basketball',
    'Tennis',
    'Formule 1',
    'JO & athlétisme',
    'Rugby',
  ],
  musique: [
    'Général',
    'Pop',
    'Rock',
    'Rap / Hip-hop',
    'Jazz',
    'Classique',
    'Électro',
  ],
  cinema: [
    'Général',
    'Blockbusters',
    'Séries TV',
    'Animation',
    'Cinéma d’auteur',
    'Oscars & festivals',
    'Acteurs & réalisateurs',
  ],
  geographie: [
    'Général',
    'Europe',
    'Asie',
    'Afrique',
    'Amériques',
    'Capitales',
    'Reliefs & climats',
  ],
  sciences: [
    'Général',
    'Physique',
    'Chimie',
    'Biologie',
    'Mathématiques',
    'Médecine',
    'Découvertes',
  ],
  tech: [
    'Général',
    'Informatique',
    'Internet & web',
    'IA',
    'Smartphones',
    'Jeux & consoles',
    'Startups & GAFAM',
  ],
  nature: [
    'Général',
    'Faune',
    'Flore',
    'Océans',
    'Climat',
    'Parcs & réserves',
    'Écologie',
  ],
  cuisine: [
    'Général',
    'Gastronomie française',
    'Cuisine du monde',
    'Pâtisserie',
    'Vins & fromages',
    'Chefs célèbres',
    'Ingrédients',
  ],
  art: [
    'Général',
    'Peinture',
    'Sculpture',
    'Architecture',
    'Photo',
    'Street art',
    'Mouvements artistiques',
  ],
  mythologie: [
    'Général',
    'Grecque',
    'Romaine',
    'Nordique',
    'Égyptienne',
    'Dieux & héros',
    'Créatures',
  ],
  litterature: [
    'Général',
    'Romans classiques',
    'Poésie',
    'BD & manga',
    'Fantasy',
    'Polar',
    'Auteurs',
  ],
  animaux: [
    'Général',
    'Mammifères',
    'Oiseaux',
    'Reptiles',
    'Insectes',
    'Animaux marins',
    'Animaux domestiques',
  ],
  espace: [
    'Général',
    'Planètes',
    'Étoiles & galaxies',
    'Astronautes',
    'NASA & ESA',
    'Exploration',
    'Système solaire',
  ],
  jeuxvideo: [
    'Général',
    'Nintendo',
    'PlayStation',
    'Xbox & PC',
    'RPG',
    'FPS',
    'Jeux indés',
  ],
  actualite: [
    'Général',
    'Politique',
    'Économie',
    'Société',
    'Culture',
    'Sciences & tech',
    'Sport actualité',
  ],
  custom: ['Général'],
  pregen: ['Général'],
}

/** Sous-thèmes officiels + pastille « Custom » (générés associés). */
export function officialSubsForTheme(themeId: string): string[] {
  const base = SUBTHEMES[themeId] ?? ['Général']
  if (themeId === 'custom' || themeId === 'pregen') return base
  if (base.includes('Custom')) return base
  return [...base, 'Custom']
}

export function getThemeById(id: string): ThemeTile | undefined {
  return ORBIT_THEMES.find((t) => t.id === id)
}

/** Libellé envoyé à l’API : "Musique — Pop" ou "Musique" si Général */
export function formatThemeQuery(parentLabel: string, sub: string): string {
  if (!sub || sub === 'Général') return parentLabel
  return `${parentLabel} — ${sub}`
}

export const PRESET_THEMES = ORBIT_THEMES.map((t) => t.label)
