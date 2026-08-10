/** Thèmes en orbite + sous-thèmes */

export type ThemeTile = {
  id: string
  label: string
  color: string
  shape: 'circle' | 'rect'
  angle?: number
}

/** Tous les thèmes sur la roue (16 pastilles, 22.5° d’écart) */
export const ORBIT_THEMES: ThemeTile[] = [
  { id: 'histoire', label: 'Histoire', color: '#6b4423', shape: 'circle', angle: -90 },
  { id: 'sport', label: 'Sport', color: '#1e7a3a', shape: 'circle', angle: -67.5 },
  { id: 'musique', label: 'Musique', color: '#5b2d8e', shape: 'circle', angle: -45 },
  { id: 'cinema', label: 'Cinéma', color: '#8b1e2d', shape: 'circle', angle: -22.5 },
  { id: 'geographie', label: 'Géographie', color: '#0d6b6b', shape: 'circle', angle: 0 },
  { id: 'sciences', label: 'Sciences', color: '#1a4a8a', shape: 'circle', angle: 22.5 },
  { id: 'tech', label: 'Tech', color: '#0f4c75', shape: 'circle', angle: 45 },
  { id: 'nature', label: 'Nature', color: '#2d6a4f', shape: 'circle', angle: 67.5 },
  { id: 'cuisine', label: 'Cuisine', color: '#a35a1f', shape: 'circle', angle: 90 },
  { id: 'art', label: 'Art', color: '#9b2d5a', shape: 'circle', angle: 112.5 },
  { id: 'mythologie', label: 'Mythologie', color: '#6a3d9a', shape: 'circle', angle: 135 },
  { id: 'litterature', label: 'Littérature', color: '#2a5080', shape: 'circle', angle: 157.5 },
  { id: 'animaux', label: 'Animaux', color: '#3d6b2a', shape: 'circle', angle: 180 },
  { id: 'espace', label: 'Espace', color: '#1a2a6b', shape: 'circle', angle: 202.5 },
  { id: 'jeuxvideo', label: 'Jeux vidéo', color: '#0d5c5c', shape: 'circle', angle: 225 },
  { id: 'actualite', label: 'Actualité', color: '#8a3a1a', shape: 'circle', angle: 247.5 },
]

/** @deprecated tout est dans ORBIT_THEMES */
export const BOTTOM_THEMES: ThemeTile[] = []

/**
 * Sous-thèmes par thème parent.
 * "Général" = tout le thème sans focus particulier.
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
