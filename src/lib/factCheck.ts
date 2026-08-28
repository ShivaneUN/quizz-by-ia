/** Client : vérification via /api/fact-check (Wikipédia + OpenRouter). */

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
  provider?: 'openrouter' | 'wikipedia'
  model?: string
  aiFailed?: boolean
  aiError?: string
  lang?: 'fr' | 'en'
}

export type FactCheckLookup =
  | { ok: true; result: FactCheckResult }
  | { ok: false; message: string }

/** OpenRouter + fallback Wikipédia côté serveur. */
export async function lookupFactCheck(
  question: string,
  correctAnswer: string,
  theme?: string,
  explanation?: string,
  sourceType?: string,
  answers?: string[],
): Promise<FactCheckLookup> {
  try {
    const res = await fetch('/api/fact-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        correctAnswer,
        theme,
        explanation,
        sourceType,
        answers,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
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
      provider?: 'openrouter' | 'wikipedia'
      model?: string
      aiFailed?: boolean
      aiError?: string
    }

    if (!res.ok) {
      return {
        ok: false,
        message:
          typeof data.error === 'string' && data.error.trim()
            ? data.error.trim()
            : `Vérification indisponible (${res.status}).`,
      }
    }

    const extract = String(data.extract ?? '').trim()
    if (!extract) {
      return {
        ok: false,
        message: 'Réponse de vérification vide — réessaie.',
      }
    }

    const confirmingSources = Array.isArray(data.confirmingSources)
      ? data.confirmingSources.filter(
          (s) => s && typeof s.name === 'string' && s.name.trim().length > 0,
        )
      : []

    return {
      ok: true,
      result: {
        title: String(data.title ?? correctAnswer).trim(),
        extract,
        source: String(data.source ?? '').trim() || undefined,
        verdict: data.verdict ?? 'inconnu',
        answerVerdict: data.answerVerdict ?? data.verdict ?? 'inconnu',
        sourceVerdict: data.sourceVerdict ?? 'inconnu',
        answerNote: String(data.answerNote ?? '').trim() || undefined,
        sourceNote: String(data.sourceNote ?? '').trim() || undefined,
        confirmingSources,
        sourcesConfirmed: data.sourcesConfirmed ?? confirmingSources.length,
        provider: data.provider ?? 'openrouter',
        model: data.model,
        aiFailed: Boolean(data.aiFailed),
        aiError: String(data.aiError ?? '').trim() || undefined,
      },
    }
  } catch {
    return {
      ok: false,
      message: 'Réseau indisponible pour la vérification.',
    }
  }
}
