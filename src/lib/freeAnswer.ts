/** Normalise pour comparer titre / artiste (réponse libre Deezer). */
export function normalizeAnswerKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Distance d’édition (Levenshtein) — fautes / lettres manquantes. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  // Optim : si trop éloignés en longueur, pas la peine
  if (Math.abs(m - n) > 2) return Math.abs(m - n)

  const prev = new Array<number>(n + 1)
  const cur = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    cur[0] = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + cost,
      )
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j]!
  }
  return prev[n]!
}

/** 1 faute si titre court, 2 si plus long (≥ 6 caractères). */
function maxTyposAllowed(targetLen: number): number {
  if (targetLen <= 3) return 0
  if (targetLen <= 5) return 1
  return 2
}

function closeEnough(input: string, target: string): boolean {
  if (input === target) return true
  const max = maxTyposAllowed(target.length)
  if (max <= 0) return false
  if (Math.abs(input.length - target.length) > max) return false
  return editDistance(input, target) <= max
}

/**
 * La saisie est bonne si elle correspond au titre OU à l’artiste
 * (égalité, inclusion raisonnable, ou 1–2 fautes de frappe).
 */
export function matchesFreeMusicAnswer(
  input: string,
  acceptedAnswers: string[] | undefined,
): boolean {
  const n = normalizeAnswerKey(input)
  if (!n || n.length < 2) return false
  const accepted = (acceptedAnswers ?? [])
    .map(normalizeAnswerKey)
    .filter((a) => a.length >= 2)
  if (accepted.length === 0) return false

  const nCompact = n.replace(/\s+/g, '')

  for (const a of accepted) {
    if (n === a) return true
    // Sous-chaîne si assez long (évite trop de faux positifs)
    if (n.length >= 5 && (a.includes(n) || n.includes(a))) return true
    // Tolérance typos : avec espaces
    if (closeEnough(n, a)) return true
    // Tolérance typos : sans espaces (ex. "onemoretime")
    const aCompact = a.replace(/\s+/g, '')
    if (aCompact.length >= 4 && closeEnough(nCompact, aCompact)) return true
  }
  return false
}
