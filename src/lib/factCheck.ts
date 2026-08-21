/** Client : vérification via OpenRouter uniquement (≥ 2 sources confirmantes). */

export type FactVerdict = 'ok' | 'douteux' | 'faux' | 'inconnu'

export interface ConfirmingSource {
  name: string
  detail: string
}

export interface FactCheckResult {
  title: string
  extract: string
  url?: string
  source?: string
  verdict?: FactVerdict
  answerVerdict?: FactVerdict
  sourceVerdict?: FactVerdict
  answerNote?: string
  sourceNote?: string
  confirmingSources?: ConfirmingSource[]
  sourcesConfirmed?: number
  provider?: 'openrouter'
  lang?: 'fr' | 'en'
}

async function lookupOpenRouter(input: {
  question: string
  correctAnswer: string
  explanation?: string
  sourceType?: string
  theme?: string
  answers?: string[]
}): Promise<FactCheckResult | null> {
  const res = await fetch('/api/fact-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) return null
  const data = (await res.json()) as {
    verdict?: FactVerdict
    answerVerdict?: FactVerdict
    sourceVerdict?: FactVerdict
    title?: string
    extract?: string
    source?: string
    answerNote?: string
    sourceNote?: string
    confirmingSources?: ConfirmingSource[]
    sourcesConfirmed?: number
  }
  const extract = String(data.extract ?? '').trim()
  if (!extract) return null
  const confirmingSources = Array.isArray(data.confirmingSources)
    ? data.confirmingSources.filter(
        (s) => s && typeof s.name === 'string' && s.name.trim().length > 0,
      )
    : []
  return {
    title: String(data.title ?? input.correctAnswer).trim(),
    extract,
    source: String(data.source ?? '').trim() || undefined,
    verdict: data.verdict ?? 'inconnu',
    answerVerdict: data.answerVerdict ?? data.verdict ?? 'inconnu',
    sourceVerdict: data.sourceVerdict ?? 'inconnu',
    answerNote: String(data.answerNote ?? '').trim() || undefined,
    sourceNote: String(data.sourceNote ?? '').trim() || undefined,
    confirmingSources,
    sourcesConfirmed: data.sourcesConfirmed ?? confirmingSources.length,
    provider: 'openrouter',
  }
}

/** OpenRouter uniquement — pas de secours Wikipédia. */
export async function lookupFactCheck(
  question: string,
  correctAnswer: string,
  theme?: string,
  explanation?: string,
  sourceType?: string,
  answers?: string[],
): Promise<FactCheckResult | null> {
  return lookupOpenRouter({
    question,
    correctAnswer,
    theme,
    explanation,
    sourceType,
    answers,
  })
}
