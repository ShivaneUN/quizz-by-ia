/**
 * Placement thème / sous-thème pour la banque curatée.
 * Ne crée JAMAIS de thème ou sous-thème : uniquement le catalogue existant
 * (ORBIT_THEMES + SUBTHEMES). Hors catalogue → fichier custom isolé.
 */

export type ThemePlacementKind = 'catalog' | 'custom'

export interface ThemePlacement {
  kind: ThemePlacementKind
  /** Id catalogue (ex: musique) — seulement si kind=catalog */
  themeId?: string
  /** Label parent (ex: Musique) */
  themeLabel: string
  /** Sous-thème catalogue exact, ou "Général" */
  subTheme?: string
  /** Quiz manuel / thème libre : clé de fichier dédiée, pas rattachée au catalogue */
  customKey?: string
  /** Libellé d’origine saisi / généré */
  rawTheme: string
  /** true si on a pu rattacher au catalogue sans inventer */
  matched: boolean
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugKey(s: string): string {
  return norm(s).replace(/\s+/g, '-')
}

/** Catalogue minimal (miroir de src/lib/themes) — ne pas étendre sans demande user. */
export type CatalogTheme = { id: string; label: string; subs: string[] }

export const CATALOG: CatalogTheme[] = [
  {
    id: 'histoire',
    label: 'Histoire',
    subs: [
      'Général',
      'Antiquité',
      'Moyen Âge',
      'Renaissance',
      'Révolutions',
      'Guerres mondiales',
      'Histoire contemporaine',
    ],
  },
  {
    id: 'sport',
    label: 'Sport',
    subs: [
      'Général',
      'Football',
      'Basketball',
      'Tennis',
      'Formule 1',
      'JO & athlétisme',
      'Rugby',
    ],
  },
  {
    id: 'musique',
    label: 'Musique',
    subs: [
      'Général',
      'Pop',
      'Rock',
      'Rap / Hip-hop',
      'Jazz',
      'Classique',
      'Électro',
    ],
  },
  {
    id: 'cinema',
    label: 'Cinéma',
    subs: [
      'Général',
      'Blockbusters',
      'Séries TV',
      'Animation',
      'Cinéma d’auteur',
      'Oscars & festivals',
      'Acteurs & réalisateurs',
    ],
  },
  {
    id: 'geographie',
    label: 'Géographie',
    subs: [
      'Général',
      'Europe',
      'Asie',
      'Afrique',
      'Amériques',
      'Capitales',
      'Reliefs & climats',
    ],
  },
  {
    id: 'sciences',
    label: 'Sciences',
    subs: [
      'Général',
      'Physique',
      'Chimie',
      'Biologie',
      'Mathématiques',
      'Médecine',
      'Découvertes',
    ],
  },
  {
    id: 'tech',
    label: 'Tech',
    subs: [
      'Général',
      'Informatique',
      'Internet & web',
      'IA',
      'Smartphones',
      'Jeux & consoles',
      'Startups & GAFAM',
    ],
  },
  {
    id: 'nature',
    label: 'Nature',
    subs: [
      'Général',
      'Faune',
      'Flore',
      'Océans',
      'Climat',
      'Parcs & réserves',
      'Écologie',
    ],
  },
  {
    id: 'cuisine',
    label: 'Cuisine',
    subs: [
      'Général',
      'Gastronomie française',
      'Cuisine du monde',
      'Pâtisserie',
      'Vins & fromages',
      'Chefs célèbres',
      'Ingrédients',
    ],
  },
  {
    id: 'art',
    label: 'Art',
    subs: [
      'Général',
      'Peinture',
      'Sculpture',
      'Architecture',
      'Photo',
      'Street art',
      'Mouvements artistiques',
    ],
  },
  {
    id: 'mythologie',
    label: 'Mythologie',
    subs: [
      'Général',
      'Grecque',
      'Romaine',
      'Nordique',
      'Égyptienne',
      'Dieux & héros',
      'Créatures',
    ],
  },
  {
    id: 'litterature',
    label: 'Littérature',
    subs: [
      'Général',
      'Romans classiques',
      'Poésie',
      'BD & manga',
      'Fantasy',
      'Polar',
      'Auteurs',
    ],
  },
  {
    id: 'animaux',
    label: 'Animaux',
    subs: [
      'Général',
      'Mammifères',
      'Oiseaux',
      'Reptiles',
      'Insectes',
      'Animaux marins',
      'Animaux domestiques',
    ],
  },
  {
    id: 'espace',
    label: 'Espace',
    subs: [
      'Général',
      'Planètes',
      'Étoiles & galaxies',
      'Astronautes',
      'NASA & ESA',
      'Exploration',
      'Système solaire',
    ],
  },
  {
    id: 'jeuxvideo',
    label: 'Jeux vidéo',
    subs: [
      'Général',
      'Nintendo',
      'PlayStation',
      'Xbox & PC',
      'RPG',
      'FPS',
      'Jeux indés',
    ],
  },
  {
    id: 'actualite',
    label: 'Actualité',
    subs: [
      'Général',
      'Politique',
      'Économie',
      'Société',
      'Culture',
      'Sciences & tech',
      'Sport actualité',
    ],
  },
]

function findSub(subs: string[], raw: string): string | undefined {
  const n = norm(raw)
  if (!n) return undefined
  for (const s of subs) {
    if (norm(s) === n) return s
  }
  // match partiel prudent (ex: "Football" dans "Sport — Football")
  for (const s of subs) {
    if (s === 'Général') continue
    const sn = norm(s)
    if (sn.length >= 4 && (n.includes(sn) || sn.includes(n))) return s
  }
  return undefined
}

/**
 * Place un thème de génération dans le catalogue existant.
 * - Match clair thème (+ sous-thème si possible) → catalog
 * - Sinon → custom (fichier dédié), JAMAIS d’ajout au catalogue
 * - Ne rattache PAS au hasard
 */
export function placeTheme(
  rawTheme: string,
  hints?: { themeId?: string; subTheme?: string },
): ThemePlacement {
  const raw = String(rawTheme ?? '').trim()
  if (!raw) {
    return {
      kind: 'custom',
      themeLabel: 'inconnu',
      customKey: 'inconnu',
      rawTheme: '',
      matched: false,
    }
  }

  // Hints explicites (UI) : seulement s’ils existent déjà
  if (hints?.themeId) {
    const parent = CATALOG.find((c) => c.id === hints.themeId)
    if (parent) {
      const subHint = hints.subTheme?.trim()
      const sub =
        (subHint && findSub(parent.subs, subHint)) ||
        findSub(parent.subs, raw) ||
        'Général'
      return {
        kind: 'catalog',
        themeId: parent.id,
        themeLabel: parent.label,
        subTheme: sub,
        rawTheme: raw,
        matched: true,
      }
    }
  }

  // "Parent — Sous" ou "Parent - Sous"
  const parts = raw.split(/\s*[—–-]\s*/).map((p) => p.trim()).filter(Boolean)
  const head = parts[0] ?? raw
  const tail = parts.length > 1 ? parts.slice(1).join(' — ') : ''

  for (const parent of CATALOG) {
    const labelN = norm(parent.label)
    const idN = norm(parent.id)
    const headN = norm(head)
    const rawN = norm(raw)

    const parentHit =
      headN === labelN ||
      headN === idN ||
      rawN === labelN ||
      rawN.startsWith(`${labelN} `)

    if (!parentHit) continue

    const sub =
      (tail && findSub(parent.subs, tail)) ||
      findSub(parent.subs, raw) ||
      'Général'

    return {
      kind: 'catalog',
      themeId: parent.id,
      themeLabel: parent.label,
      subTheme: sub,
      rawTheme: raw,
      matched: true,
    }
  }

  // Pas de match fiable → fichier dédié nommé d’après le thème généré
  const themeFile = slugKey(raw).slice(0, 80) || 'theme-libre'
  return {
    kind: 'custom',
    themeLabel: raw,
    customKey: themeFile,
    rawTheme: raw,
    matched: false,
  }
}

/** Clé de regroupement / nom de fichier banque. */
export function curatedGroupKey(p: ThemePlacement): string {
  if (p.kind === 'catalog' && p.themeId) {
    const sub = slugKey(p.subTheme || 'general') || 'general'
    return `catalog/${p.themeId}/${sub}`
  }
  // Custom = nom du thème généré (slug), pas un id aléatoire
  const name =
    p.customKey ||
    slugKey(p.themeLabel) ||
    slugKey(p.rawTheme) ||
    'theme-libre'
  return `custom/${name}`
}

/** Slug fichier (sous-thème / custom). */
export function curatedFileSlug(label: string): string {
  return slugKey(label).slice(0, 80) || 'general'
}
