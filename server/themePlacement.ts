/**
 * Placement thème / sous-thème pour la banque curatée.
 *
 * Règles :
 * 1. Thème catalogue + sous-thème officiel → catalog/<theme>/<sub>
 * 2. Thème catalogue + sous-thème inconnu / libre → catalog/<theme>/<custom-sub>
 *    (ex. DOFUS → Jeux vidéo — DOFUS)
 * 3. Aucun thème parent fiable → Custom — <nom> (fichier custom/<slug>.json)
 *
 * On n’ajoute JAMAIS de thème parent au catalogue ORBIT sans demande user.
 */

export type ThemePlacementKind = 'catalog' | 'custom'

export interface ThemePlacement {
  kind: ThemePlacementKind
  /** Id catalogue (ex: jeuxvideo) — seulement si kind=catalog */
  themeId?: string
  /** Label parent (ex: Jeux vidéo) ou "Custom" */
  themeLabel: string
  /** Sous-thème officiel, custom sous catalogue, ou nom orphelin sous Custom */
  subTheme?: string
  /** true si le sous-thème n’est pas dans la liste fixe ORBIT */
  subIsCustom?: boolean
  /** Quiz hors catalogue : clé de fichier sous custom/ */
  customKey?: string
  /** Libellé d’origine saisi / généré */
  rawTheme: string
  /** true si rattaché à un thème catalogue (y compris sous-thème custom) */
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

/** Libellé sous-thème affichable (conserve casse utile). */
export function prettySubLabel(raw: string): string {
  const t = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return 'Général'
  return t.slice(0, 80)
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
  {
    id: 'langues',
    label: 'Langues',
    subs: [
      'Général',
      'Anglais',
      'Espagnol',
      'Allemand',
      'Italien',
      'Portugais',
      'Français',
      'Arabe',
      'Japonais',
      'Coréen',
      'Chinois',
      'Russe',
      'Néerlandais',
      'Turc',
      'Polonais',
      'Suédois',
      'Grec',
      'Hébreu',
      'Hindi',
      'Vietnamien',
      'Cambodgien',
    ],
  },
  {
    id: 'drapeaux',
    label: 'Drapeaux',
    subs: [],
  },
]

/**
 * Indices franchise / genre → thème parent catalogue.
 * Le sous-thème custom = le nom saisi (ex. DOFUS), pas un inventaire ORBIT.
 */
const PARENT_HINTS: { themeId: string; patterns: RegExp[] }[] = [
  {
    themeId: 'jeuxvideo',
    patterns: [
      /\bdofus\b/,
      /\bwakfu\b/,
      /\bmario\b/,
      /\bzeld[ae]\b/,
      /\bpok[eé]mon\b/,
      /\bminecraft\b/,
      /\bfortnite\b/,
      /\bleague of legends\b/,
      /\blol\b/,
      /\bvalorant\b/,
      /\bcounter.?strike\b/,
      /\bcs:? ?go\b/,
      /\brocket league\b/,
      /\bgta\b/,
      /\bgrand theft\b/,
      /\bfifa\b/,
      /\bea fc\b/,
      /\bcall of duty\b/,
      /\bcod\b/,
      /\boverwatch\b/,
      /\bworld of warcraft\b/,
      /\bwow\b/,
      /\bfinal fantasy\b/,
      /\belden ring\b/,
      /\bdark souls\b/,
      /\bthe witcher\b/,
      /\bskyrim\b/,
      /\bassassins? creed\b/,
      /\bred dead\b/,
      /\bapex legends\b/,
      /\btetris\b/,
      /\bsonic\b/,
      /\bhalo\b/,
      /\bmortal kombat\b/,
      /\bstreet fighter\b/,
      /\btekken\b/,
      /\bamong us\b/,
      /\broblox\b/,
      /\bgenshin\b/,
      /\bleague\b.*\blegends\b/,
      /\bmmorpg\b/,
      /\bjeux? videos?\b/,
      /\bvideo ?games?\b/,
      /\bnintendo\b/,
      /\bplaystation\b/,
      /\bxbox\b/,
    ],
  },
  {
    themeId: 'cinema',
    patterns: [
      /\bblack clover\b/,
      /\bnaruto\b/,
      /\bone piece\b/,
      /\bdragon ball\b/,
      /\battack on titan\b/,
      /\battaque des titans\b/,
      /\bsolo leveling\b/,
      /\bdemon slayer\b/,
      /\bkimetsu\b/,
      /\bmarvel\b/,
      /\bbatman\b/,
      /\bsuperman\b/,
      /\bstar wars\b/,
      /\bharry potter\b/,
      /\bstranger things\b/,
      /\bgame of thrones\b/,
      /\blord of the rings\b/,
      /\bseigneur des anneaux\b/,
    ],
  },
  {
    themeId: 'litterature',
    patterns: [
      /\bmanga\b/,
      /\blight novel\b/,
      /\bbd\b/,
      /\bcomics?\b/,
    ],
  },
  {
    themeId: 'musique',
    patterns: [
      /\bk-?pop\b/,
      /\bmetal\b/,
      /\breggae\b/,
      /\bblues\b/,
      /\bdisco\b/,
    ],
  },
  {
    themeId: 'sport',
    patterns: [
      /\brugby\b/,
      /\bhandball\b/,
      /\bvolleyball\b/,
      /\bnba\b/,
      /\bucl\b/,
      /\bchampions league\b/,
    ],
  },
  {
    themeId: 'langues',
    patterns: [
      /\blangues?\b/,
      /\banglais\b/,
      /\benglish\b/,
      /\bespagnol\b/,
      /\bspanish\b/,
      /\ballemand\b/,
      /\bgerman\b/,
      /\bitalien\b/,
      /\bitalian\b/,
      /\bportugais\b/,
      /\bportuguese\b/,
      /\barabe\b/,
      /\barabic\b/,
      /\bjaponais\b/,
      /\bjapanese\b/,
      /\bcor[eé]en\b/,
      /\bkorean\b/,
      /\bchinois\b/,
      /\bmandarin\b/,
      /\bcantonese?\b/,
      /\brusse\b/,
      /\brussian\b/,
      /\bn[eé]erlandais\b/,
      /\bdutch\b/,
      /\bturc\b/,
      /\bturkish\b/,
      /\bpolonais\b/,
      /\bpolish\b/,
      /\bsu[eé]dois\b/,
      /\bswedish\b/,
      /\bgrec\b/,
      /\bgreek\b/,
      /\bh[eé]breu\b/,
      /\bhebrew\b/,
      /\bhindi\b/,
      /\bvietnamien\b/,
      /\bvietnamese\b/,
      /\bkhmer\b/,
      /\bcambodgien\b/,
      /\bvocabulaire\b/,
      /\btraduction\b/,
      /\bconjugaison\b/,
    ],
  },
]

function findSub(subs: string[], raw: string): string | undefined {
  const n = norm(raw)
  if (!n) return undefined
  for (const s of subs) {
    if (norm(s) === n) return s
  }
  for (const s of subs) {
    if (s === 'Général') continue
    const sn = norm(s)
    if (sn.length >= 4 && (n.includes(sn) || sn.includes(n))) return s
  }
  return undefined
}

function findParentByLabel(text: string): CatalogTheme | undefined {
  const n = norm(text)
  if (!n) return undefined
  for (const parent of CATALOG) {
    const labelN = norm(parent.label)
    const idN = norm(parent.id)
    if (
      n === labelN ||
      n === idN ||
      n.startsWith(`${labelN} `) ||
      n.startsWith(`${idN} `)
    ) {
      return parent
    }
  }
  return undefined
}

function findParentByKeywords(text: string): CatalogTheme | undefined {
  const n = norm(text)
  if (!n) return undefined
  for (const hint of PARENT_HINTS) {
    for (const re of hint.patterns) {
      if (re.test(n)) {
        return CATALOG.find((c) => c.id === hint.themeId)
      }
    }
  }
  return undefined
}

/**
 * Sous-thème : officiel si connu, sinon custom sous le parent
 * (sauf si le texte = uniquement le nom du parent → Général).
 */
function resolveCatalogSub(
  parent: CatalogTheme,
  raw: string,
  tail: string,
  hintSub?: string,
): { sub: string; subIsCustom: boolean } {
  const hint = hintSub?.trim()
  if (hint) {
    const official = findSub(parent.subs, hint)
    if (official) return { sub: official, subIsCustom: false }
    return { sub: prettySubLabel(hint), subIsCustom: true }
  }

  if (tail) {
    const official = findSub(parent.subs, tail)
    if (official) return { sub: official, subIsCustom: false }
    return { sub: prettySubLabel(tail), subIsCustom: true }
  }

  const fromRaw = findSub(parent.subs, raw)
  if (fromRaw) return { sub: fromRaw, subIsCustom: false }

  const rawN = norm(raw)
  const parentOnly =
    rawN === norm(parent.label) || rawN === norm(parent.id)
  if (parentOnly) return { sub: 'Général', subIsCustom: false }

  return { sub: prettySubLabel(raw), subIsCustom: true }
}

function catalogPlacement(
  parent: CatalogTheme,
  raw: string,
  tail: string,
  hintSub?: string,
): ThemePlacement {
  const { sub, subIsCustom } = resolveCatalogSub(parent, raw, tail, hintSub)
  return {
    kind: 'catalog',
    themeId: parent.id,
    themeLabel: parent.label,
    subTheme: sub,
    subIsCustom,
    rawTheme: raw,
    matched: true,
  }
}

function customCatchAll(raw: string): ThemePlacement {
  const label = prettySubLabel(raw)
  const themeFile = slugKey(raw).slice(0, 80) || 'theme-libre'
  return {
    kind: 'custom',
    themeLabel: 'Custom',
    subTheme: label,
    subIsCustom: true,
    customKey: themeFile,
    rawTheme: raw,
    matched: false,
  }
}

/**
 * Place un thème de génération dans le catalogue (éventuellement sous-thème custom)
 * ou dans le filet Custom.
 */
export function placeTheme(
  rawTheme: string,
  hints?: { themeId?: string; subTheme?: string },
): ThemePlacement {
  const raw = String(rawTheme ?? '').trim()
  if (!raw) {
    return {
      kind: 'custom',
      themeLabel: 'Custom',
      subTheme: 'inconnu',
      subIsCustom: true,
      customKey: 'inconnu',
      rawTheme: '',
      matched: false,
    }
  }

  const parts = raw.split(/\s*[—–-]\s*/).map((p) => p.trim()).filter(Boolean)
  const head = parts[0] ?? raw
  const tail = parts.length > 1 ? parts.slice(1).join(' — ') : ''

  // Thème UI « Custom » (orphelins banque)
  if (norm(head) === 'custom') {
    if (!tail || norm(tail) === 'general') {
      return {
        kind: 'custom',
        themeLabel: 'Custom',
        subTheme: 'Général',
        subIsCustom: true,
        customKey: 'custom-general',
        rawTheme: raw,
        matched: false,
      }
    }
    const byKw = findParentByKeywords(tail)
    if (byKw) return catalogPlacement(byKw, raw, tail)
    return {
      kind: 'custom',
      themeLabel: 'Custom',
      subTheme: prettySubLabel(tail),
      subIsCustom: true,
      customKey: slugKey(tail).slice(0, 80) || 'theme-libre',
      rawTheme: raw,
      matched: false,
    }
  }

  // Hints UI explicites
  if (hints?.themeId) {
    const parent = CATALOG.find((c) => c.id === hints.themeId)
    if (parent) {
      return catalogPlacement(parent, raw, tail || hints.subTheme || '', hints.subTheme)
    }
  }

  // "Parent — Sous" avec parent catalogue
  const byHead = findParentByLabel(head)
  if (byHead) {
    return catalogPlacement(byHead, raw, tail)
  }

  // Parent mentionné dans le texte complet
  const byRaw = findParentByLabel(raw)
  if (byRaw) {
    return catalogPlacement(byRaw, raw, tail)
  }

  // Franchise / genre → parent + sous-thème = nom saisi
  const byKw = findParentByKeywords(raw)
  if (byKw) {
    return catalogPlacement(byKw, raw, tail)
  }

  // Filet : thème Custom, sous-thème = nom généré / saisi
  return customCatchAll(raw)
}

/** Clé de regroupement / chemin logique banque. */
export function curatedGroupKey(p: ThemePlacement): string {
  if (p.kind === 'catalog' && p.themeId) {
    const sub = slugKey(p.subTheme || 'general') || 'general'
    return `catalog/${p.themeId}/${sub}`
  }
  const name =
    p.customKey ||
    slugKey(p.subTheme || '') ||
    slugKey(p.rawTheme) ||
    'theme-libre'
  return `custom/${name}`
}

/** Slug fichier (sous-thème / custom). */
export function curatedFileSlug(label: string): string {
  return slugKey(label).slice(0, 80) || 'general'
}

/** Affichage admin / logs. */
export function formatPlacementLabel(p: ThemePlacement): string {
  if (p.kind === 'catalog') {
    const sub = p.subTheme && p.subTheme !== 'Général' ? ` — ${p.subTheme}` : ''
    const mark = p.subIsCustom ? ' · custom' : ''
    return `${p.themeLabel}${sub}${mark}`
  }
  return `Custom — ${p.subTheme || p.rawTheme || p.customKey || '…'}`
}
