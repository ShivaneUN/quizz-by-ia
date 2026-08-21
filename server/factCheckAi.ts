/**
 * Vérification factuelle via OpenRouter uniquement.
 * Exige ≥ 2 sources indépendantes qui confirment le fait.
 * Contrôle la bonne réponse + la source déclarée ; réponses en français.
 */

import { listApiKeys } from './aiRotate.js'

export type FactVerdict = 'ok' | 'douteux' | 'faux' | 'inconnu'

export interface ConfirmingSource {
  name: string
  detail: string
}

export interface FactCheckAiResult {
  verdict: FactVerdict
  /** La bonne réponse est-elle correcte pour la question ? */
  answerVerdict: FactVerdict
  /** La source déclarée par le quiz est-elle cohérente ? */
  sourceVerdict: FactVerdict
  title: string
  extract: string
  source: string
  answerNote: string
  sourceNote: string
  /** Au moins 2 sources distinctes qui confirment (sinon answerVerdict ≠ ok) */
  confirmingSources: ConfirmingSource[]
  sourcesConfirmed: number
  provider: 'openrouter'
  model: string
}

const VERIFY_MODELS = [
  'nvidia/nemotron-nano-9b-v2:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-26b-a4b-it:free',
] as const

const MIN_CONFIRMING_SOURCES = 2

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1].trim() : trimmed
  try {
    const parsed = JSON.parse(candidate) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* continue */
  }
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return null
    }
  }
  return null
}

function normalizeVerdict(raw: unknown): FactVerdict {
  const v = String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (v === 'ok' || v === 'vrai' || v === 'correct' || v === 'valide') return 'ok'
  if (v === 'faux' || v === 'incorrect' || v === 'errone') return 'faux'
  if (v === 'douteux' || v === 'incertain' || v === 'ambigu') return 'douteux'
  return 'inconnu'
}

function parseConfirmingSources(raw: unknown): ConfirmingSource[] {
  if (!Array.isArray(raw)) return []
  const out: ConfirmingSource[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const name = String(obj.nom ?? obj.name ?? obj.source ?? '')
      .trim()
      .slice(0, 120)
    const detail = String(obj.detail ?? obj.preuve ?? obj.why ?? '')
      .trim()
      .slice(0, 240)
    if (name.length < 2) continue
    const key = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, detail })
    if (out.length >= 5) break
  }
  return out
}

function buildVerifyPrompt(input: {
  question: string
  correctAnswer: string
  explanation?: string
  sourceType?: string
  theme?: string
  answers?: string[]
}): string {
  const others = (input.answers ?? [])
    .filter((a) => a.trim() && a.trim() !== input.correctAnswer.trim())
    .slice(0, 3)
    .join(' | ')
  const declaredSource = input.sourceType?.trim() || '(aucune)'

  return `Tu es un vérificateur de quiz. Tu réponds UNIQUEMENT en français.
Tu contrôles :
1) la BONNE RÉPONSE vs la QUESTION (dans le thème)
2) la SOURCE DÉCLARÉE par le quiz
3) AU MOINS ${MIN_CONFIRMING_SOURCES} SOURCES INDÉPENDANTES qui confirment le même fait

Thème / univers: ${input.theme?.trim() || '(non précisé)'}
Question: ${input.question.trim()}
Bonne réponse à contrôler: ${input.correctAnswer.trim()}
Autres propositions du QCM: ${others || '(aucune)'}
Explication du quiz: ${input.explanation?.trim() || '(aucune)'}
Source déclarée à contrôler: ${declaredSource}

RÈGLE CRITIQUE — DOUBLE CONFIRMATION
- Pour mettre reponse_verdict = "ok", tu DOIS citer au moins ${MIN_CONFIRMING_SOURCES} sources
  DISTINCTES (noms réels : encyclopédie, site officiel, livre, base de données, presse, etc.)
  qui confirment chacune le fait dans ce thème.
- La source déclarée du quiz peut compter pour 1 si elle est pertinente.
- Tu as besoin d’AU MOINS UNE autre source indépendante en plus.
- Si tu n’as pas ${MIN_CONFIRMING_SOURCES} sources crédibles → reponse_verdict = "inconnu" ou "douteux"
  (JAMAIS "ok").
- N’invente PAS de sources. Si tu n’es pas sûr qu’une source existe / confirme → ne la mets pas.
- Anti-homonyme: reste dans le thème (personnage fiction ≠ personne réelle du même nom).

CONTRÔLE SOURCE DÉCLARÉE
- La source « ${declaredSource} » est-elle un type pertinent pour ce fait ?
- Vague (« culture générale », « internet ») → source_verdict = "douteux".
- Hors sujet → "faux". Ne confonds pas réponse fausse et source fausse.

LANGUE : tout le texte en français.

Réponds UNIQUEMENT en JSON:
{
  "reponse_verdict": "ok" | "douteux" | "faux" | "inconnu",
  "source_verdict": "ok" | "douteux" | "faux" | "inconnu",
  "verdict": "ok" | "douteux" | "faux" | "inconnu",
  "titre": "sujet exact DANS le thème",
  "commentaire_reponse": "1-2 phrases",
  "commentaire_source": "1-2 phrases",
  "resume": "2-3 phrases de synthèse",
  "sources_confirmantes": [
    { "nom": "Nom de la source 1", "detail": "ce qu’elle confirme" },
    { "nom": "Nom de la source 2", "detail": "ce qu’elle confirme" }
  ],
  "source": "source déclarée si cohérente, sinon vide"
}
"verdict" global = le plus sévère (faux > douteux > inconnu > ok).
reponse_verdict "ok" INTERDIT si sources_confirmantes a moins de ${MIN_CONFIRMING_SOURCES} entrées.`
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 22_000)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://quizz-by-ia.vercel.app',
        'X-Title': 'Quizz By IA - fact check',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 900,
        messages: [
          {
            role: 'system',
            content:
              `Tu vérifies en français. JSON strict. Pour valider une réponse: minimum ${MIN_CONFIRMING_SOURCES} sources indépendantes réelles. Sinon verdict inconnu/douteux. Anti-homonyme.`,
          },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`openrouter ${res.status}: ${detail.slice(0, 200)}`)
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = String(data.choices?.[0]?.message?.content ?? '').trim()
    if (!content) throw new Error('openrouter: réponse vide')
    return content
  } finally {
    clearTimeout(timer)
  }
}

function mergeVerdict(a: FactVerdict, b: FactVerdict): FactVerdict {
  const rank: Record<FactVerdict, number> = {
    faux: 3,
    douteux: 2,
    inconnu: 1,
    ok: 0,
  }
  return rank[a] >= rank[b] ? a : b
}

export async function verifyFactWithOpenRouter(input: {
  question: string
  correctAnswer: string
  explanation?: string
  sourceType?: string
  theme?: string
  answers?: string[]
}): Promise<FactCheckAiResult | { error: string }> {
  const keys = listApiKeys('openrouter')
  if (keys.length === 0) {
    return { error: 'OPENROUTER_API_KEY manquante' }
  }

  const prompt = buildVerifyPrompt(input)
  const errors: string[] = []

  for (const apiKey of keys.slice(0, 2)) {
    for (const model of VERIFY_MODELS) {
      try {
        const raw = await callOpenRouter(apiKey, model, prompt)
        const obj = extractJsonObject(raw)
        if (!obj) {
          errors.push(`${model}: JSON invalide`)
          continue
        }
        const confirmingSources = parseConfirmingSources(
          obj.sources_confirmantes ?? obj.confirming_sources ?? obj.sources,
        )
        const extract = String(obj.resume ?? obj.extract ?? '').trim()
        const title = String(obj.titre ?? obj.title ?? input.correctAnswer).trim()
        const source = String(obj.source ?? input.sourceType ?? '').trim()
        const answerNote = String(
          obj.commentaire_reponse ?? obj.answer_note ?? '',
        ).trim()
        let sourceNote = String(
          obj.commentaire_source ?? obj.source_note ?? '',
        ).trim()
        if (extract.length < 12 && answerNote.length < 8) {
          errors.push(`${model}: résumé trop court`)
          continue
        }

        let answerVerdict = normalizeVerdict(
          obj.reponse_verdict ?? obj.answer_verdict ?? obj.verdict,
        )
        const sourceVerdict = normalizeVerdict(
          obj.source_verdict ??
            (input.sourceType?.trim() ? obj.verdict : 'inconnu'),
        )

        // Garde-fou serveur : pas de "ok" sans ≥ 2 sources distinctes
        if (
          answerVerdict === 'ok' &&
          confirmingSources.length < MIN_CONFIRMING_SOURCES
        ) {
          answerVerdict = 'inconnu'
          sourceNote =
            sourceNote ||
            `Moins de ${MIN_CONFIRMING_SOURCES} sources confirmantes — validation refusée.`
        }

        let verdict = normalizeVerdict(
          obj.verdict ?? mergeVerdict(answerVerdict, sourceVerdict),
        )
        if (
          verdict === 'ok' &&
          confirmingSources.length < MIN_CONFIRMING_SOURCES
        ) {
          verdict = 'inconnu'
        }
        verdict = mergeVerdict(verdict, mergeVerdict(answerVerdict, sourceVerdict))

        const sourcesLine =
          confirmingSources.length > 0
            ? `Sources (${confirmingSources.length}) : ${confirmingSources
                .map((s) => s.name)
                .join(' · ')}`
            : ''
        const combined =
          [extract || answerNote, sourcesLine, sourceNote]
            .filter(Boolean)
            .join(' ') || 'Vérification terminée.'

        return {
          verdict,
          answerVerdict,
          sourceVerdict,
          title: title || input.correctAnswer,
          extract:
            combined.length > 800 ? `${combined.slice(0, 800)}…` : combined,
          source: source || String(input.sourceType ?? '').trim(),
          answerNote,
          sourceNote,
          confirmingSources,
          sourcesConfirmed: confirmingSources.length,
          provider: 'openrouter',
          model,
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
  }

  return {
    error:
      errors.length > 0
        ? errors[errors.length - 1]!.slice(0, 160)
        : 'Vérification impossible pour le moment',
  }
}
