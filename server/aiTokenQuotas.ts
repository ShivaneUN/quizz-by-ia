/**
 * Plafonds tokens / jour (free tier) — références publiques 2026.
 * Groq : TPD officiels. Gemini / OpenRouter : pas de TPD clair → budget soft app.
 */

export type TokenCapNote = 'official_tpd' | 'soft_estimate'

/** Tokens in+out max / jour (Europe/Paris côté compteurs app). */
const MODEL_DAY_CAPS: Record<string, { limit: number; note: TokenCapNote }> = {
  // Groq free — TPD publiés
  'groq\x1fopenai/gpt-oss-20b': { limit: 200_000, note: 'official_tpd' },
  'groq\x1fopenai/gpt-oss-120b': { limit: 200_000, note: 'official_tpd' },
  // Compound : TPD non listé (250 RPD) → estimation soft
  'groq\x1fgroq/compound-mini': { limit: 500_000, note: 'soft_estimate' },
  'groq\x1fgroq/compound': { limit: 500_000, note: 'soft_estimate' },

  // Gemini free : RPD/TPM, pas de TPD officiel → budget soft de suivi
  'gemini\x1fgemini-flash-lite-latest': { limit: 1_000_000, note: 'soft_estimate' },
  'gemini\x1fgemini-flash-latest': { limit: 1_000_000, note: 'soft_estimate' },
  'gemini\x1fgemini-3.5-flash': { limit: 1_000_000, note: 'soft_estimate' },
  'gemini\x1fgemini-3.1-flash-lite': { limit: 1_000_000, note: 'soft_estimate' },

  // OpenRouter :free — budget soft
  'openrouter\x1fgoogle/gemma-4-31b-it:free': { limit: 500_000, note: 'soft_estimate' },
  'openrouter\x1fnvidia/nemotron-3-super-120b-a12b:free': {
    limit: 500_000,
    note: 'soft_estimate',
  },
  'openrouter\x1fnvidia/nemotron-3.5-lightning:free': {
    limit: 500_000,
    note: 'soft_estimate',
  },
  'openrouter\x1fgoogle/gemma-4-26b-a4b-it:free': {
    limit: 500_000,
    note: 'soft_estimate',
  },
  'openrouter\x1fnvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': {
    limit: 500_000,
    note: 'soft_estimate',
  },
  'openrouter\x1fz-ai/glm-5.2:free': { limit: 500_000, note: 'soft_estimate' },
  'openrouter\x1fliquid/lfm-2.5-2.6b:free': { limit: 500_000, note: 'soft_estimate' },
  'openrouter\x1fopenrouter/free': { limit: 500_000, note: 'soft_estimate' },
}

const DEFAULT_SOFT_CAP = 500_000

function id(engine: string, model: string): string {
  return `${engine.trim()}\x1f${model.trim()}`
}

export function getModelDayTokenCap(
  engine: string,
  model: string,
): { limit: number; note: TokenCapNote } {
  return (
    MODEL_DAY_CAPS[id(engine, model)] ?? {
      limit: DEFAULT_SOFT_CAP,
      note: 'soft_estimate',
    }
  )
}

export function listConfiguredDayTokenCaps(
  models: Array<{ engine: string; model: string }>,
): Array<{
  engine: string
  model: string
  limit: number
  note: TokenCapNote
}> {
  return models.map((m) => {
    const cap = getModelDayTokenCap(m.engine, m.model)
    return { engine: m.engine, model: m.model, ...cap }
  })
}

export function sumDayTokenCaps(
  models: Array<{ engine: string; model: string }>,
): number {
  let sum = 0
  const seen = new Set<string>()
  for (const m of models) {
    const k = id(m.engine, m.model)
    if (seen.has(k)) continue
    seen.add(k)
    sum += getModelDayTokenCap(m.engine, m.model).limit
  }
  return sum
}
