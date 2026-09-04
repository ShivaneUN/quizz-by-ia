/**
 * Affichage des réponses QCM thème Langues.
 * Écritures spéciales : native + transcription latine (comme le japonais / coréen / khmer…).
 * Jamais de sens FR dans les options pendant le QCM.
 */

function normalizeLoose(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[«»"'']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const FR_GLOSS_WORDS = new Set(
  [
    'bonjour',
    'bonsoir',
    'salut',
    'merci',
    'oui',
    'non',
    'chat',
    'chien',
    'maison',
    'eau',
    'pain',
    'homme',
    'femme',
    'enfant',
    'amour',
    'vie',
    'mort',
    'jour',
    'nuit',
    'matin',
    'soir',
    'aujourdhui',
    'demain',
    'hier',
    'sillvousplait',
    'silvousplait',
    'excusezmoi',
    'aurevoir',
    'abientot',
    'bienvenue',
    'sante',
    'pardon',
    'desole',
    'derien',
    'cava',
    'comment',
    'pourquoi',
    'parceque',
    'mercibeaucoup',
    'matinal',
    'soiree',
  ].map((w) => normalizeLoose(w).replace(/\s+/g, '')),
)

/** Parenthèse = transcription latine OK (un ou plusieurs mots type « ni hao »). */
export function isLatinTranscriptionGloss(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  if (
    !/^[A-Za-zĀāĒēĪīŌōŪūÂâÊêÎîÔôÛûÄäËëÏïÖöÜüŸÿ'\-\s]+$/.test(t)
  ) {
    return false
  }
  // Accents FR (é, ç…) hors macrons de romanisation → glose FR
  if (/[àâäéèêëïîôùûüçœæ]/i.test(t) && !/[āēīōū]/.test(t)) return false
  const words = t.split(/\s+/).map((w) => normalizeLoose(w).replace(/\s+/g, ''))
  if (words.some((w) => FR_GLOSS_WORDS.has(w))) return false
  return true
}

/**
 * Pendant le QCM : native + transcription latine uniquement.
 * À la révélation : texte complet.
 */
export function displayLangueAnswerChoice(
  answer: string,
  question: string,
  revealed: boolean,
): string {
  const raw = answer.trim()
  if (!raw || revealed) return raw

  let s = raw
  // native (roma) (sens FR) → native (roma)
  while (/\([^)]*\)\s*\([^)]*\)\s*$/u.test(s)) {
    s = s.replace(/\s*\([^)]*\)\s*$/u, '').trim()
  }

  const nq = normalizeLoose(question)

  return s
    .replace(/\s*\(([^)]+)\)\s*$/u, (_full, inner: string) => {
      const t = String(inner).trim()
      if (!t) return ''
      if (!isLatinTranscriptionGloss(t)) return ''
      const ni = normalizeLoose(t)
      const compact = ni.replace(/\s+/g, '')
      // Spoiler : glose = mot FR déjà dans la question (ex. bonjour)
      if (
        compact.length >= 2 &&
        FR_GLOSS_WORDS.has(compact) &&
        nq.includes(ni)
      ) {
        return ''
      }
      if (compact.length >= 2 && nq.includes(ni) && FR_GLOSS_WORDS.has(compact)) {
        return ''
      }
      // Mot FR dans la question même si pas dans la liste (entre « »)
      if (
        ni.length >= 3 &&
        ni.length <= 12 &&
        !ni.includes(' ') &&
        (nq.includes(`«${ni}»`) ||
          nq.includes(`"${ni}"`) ||
          nq.includes(`'${ni}'`)) &&
        !/[āēīōū]/.test(t)
      ) {
        return ''
      }
      return ` (${t})`
    })
    .replace(/\s+/g, ' ')
    .trim()
}
