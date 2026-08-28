/**
 * Vérification factuelle : Wikipédia (preuves réelles) + OpenRouter (interprétation).
 * Fallback Wiki si les modèles free plantent — plus de « impossible » trompeur.
 */

import { listApiKeys } from './aiRotate.js'
import { lookupWikiEvidence, type WikiHit } from './factCheckWiki.js'

export type FactVerdict = 'ok' | 'douteux' | 'faux' | 'inconnu'

export interface ConfirmingSource {
  name: string
  detail: string
}

export interface FactCheckAiResult {
  verdict: FactVerdict
  answerVerdict: FactVerdict
  sourceVerdict: FactVerdict
  title: string
  extract: string
  source: string
  answerNote: string
  sourceNote: string
  confirmingSources: ConfirmingSource[]
  sourcesConfirmed: number
  provider: 'openrouter' | 'wikipedia'
  model: string
  /** true si OpenRouter n’a pas pu faire la 2ᵉ vérif */
  aiFailed?: boolean
  aiError?: string
}

/** 1–2 modèles max, timeouts courts — plafond Vercel souvent 30 s. */
const VERIFY_MODELS = [
  'nvidia/nemotron-3.5-lightning:free',
  'openrouter/free',
] as const

const OR_TIMEOUT_MS = 8_000
/** Temps max pour toute la boucle OpenRouter (hors Wiki). */
const AI_BUDGET_MS = 10_000

const MIN_CONFIRMING_SOURCES = 2

function isWikiSourceName(name: string): boolean {
  return /wikip[eé]dia/i.test(name)
}

function isAiSourceName(name: string): boolean {
  return /^ia\b/i.test(name.trim()) || /\bopenrouter\b/i.test(name)
}

/** Règle : 1 Wiki + 1 IA = 2, ou 2 Wiki. */
function splitConfirmations(sources: ConfirmingSource[]): {
  wiki: number
  ai: number
  other: number
} {
  let wiki = 0
  let ai = 0
  let other = 0
  for (const s of sources) {
    if (isWikiSourceName(s.name)) wiki += 1
    else if (isAiSourceName(s.name)) ai += 1
    else other += 1
  }
  return { wiki, ai, other }
}

function meetsConfirmRule(sources: ConfirmingSource[]): boolean {
  const { wiki, ai, other } = splitConfirmations(sources)
  if (wiki >= 1 && ai >= 1) return true
  if (wiki >= 2) return true
  // Source déclarée / autre + Wiki compte aussi comme 2e preuve
  if (wiki >= 1 && other >= 1) return true
  return wiki + ai + other >= MIN_CONFIRMING_SOURCES && wiki >= 1
}

function ensureAiConfirmSource(
  sources: ConfirmingSource[],
  model: string,
  detail: string,
): ConfirmingSource[] {
  if (sources.some((s) => isAiSourceName(s.name))) return sources
  return [
    ...sources,
    {
      name: `IA (${model})`,
      detail: detail.slice(0, 240) || 'Confirmation du modèle OpenRouter.',
    },
  ]
}

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

function wikiAsSources(hits: WikiHit[]): ConfirmingSource[] {
  return hits.map((h) => ({
    name: `Wikipédia FR — ${h.title}`,
    detail: h.extract.slice(0, 180),
  }))
}

function declaredSourceLooksVague(raw?: string): boolean {
  const s = String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (!s) return true
  return (
    s.includes('culture generale') ||
    s === 'internet' ||
    s === 'web' ||
    s === 'ia' ||
    s.includes('connaissance')
  )
}

function declaredSourceLooksEncyclopedia(raw?: string): boolean {
  const s = String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  return (
    s.includes('wikipedia') ||
    s.includes('wikimedia') ||
    s.includes('encyclop') ||
    s.includes('universalis') ||
    s.includes('larousse') ||
    s.includes('britannica')
  )
}

function buildVerifyPrompt(input: {
  question: string
  correctAnswer: string
  explanation?: string
  sourceType?: string
  theme?: string
  answers?: string[]
  wikiHits: WikiHit[]
}): string {
  const others = (input.answers ?? [])
    .filter((a) => a.trim() && a.trim() !== input.correctAnswer.trim())
    .slice(0, 3)
    .join(' | ')
  const declaredSource = input.sourceType?.trim() || '(aucune)'
  const wikiBlock =
    input.wikiHits.length > 0
      ? input.wikiHits
          .map(
            (h, i) =>
              `[Wiki ${i + 1} ${h.lang}] ${h.title}\n${h.extract}\nURL: ${h.url}`,
          )
          .join('\n\n')
      : '(aucune page Wikipédia trouvée)'

  return `Tu es un vérificateur de quiz. Tu réponds UNIQUEMENT en français.
Tu contrôles avec les EXTRAITS WIKIPÉDIA fournis (preuves réelles) + ton jugement :
1) la BONNE RÉPONSE vs la QUESTION (dans le thème)
2) la SOURCE DÉCLARÉE par le quiz
3) sources confirmantes (tu peux reprendre Wikipédia FR + source déclarée si pertinente)

Thème / univers: ${input.theme?.trim() || '(non précisé)'}
Question: ${input.question.trim()}
Bonne réponse à contrôler: ${input.correctAnswer.trim()}
Autres propositions du QCM: ${others || '(aucune)'}
Explication du quiz: ${input.explanation?.trim() || '(aucune)'}
Source déclarée à contrôler: ${declaredSource}

EXTRAITS WIKIPÉDIA FR (à utiliser en priorité) :
${wikiBlock}

RÈGLES
- Si Wikipédia confirme clairement la réponse dans le thème → reponse_verdict = "ok".
- Confirmations : il faut 1 preuve Wikipédia FR + 1 confirmation IA (toi) = 2 au total.
  Tu peux aussi citer 2 pages Wiki FR. Mets toujours au moins une entrée Wikipédia
  et une entrée « IA » dans sources_confirmantes quand tu valides.
- N’invente PAS de sources encyclopédiques hors des extraits Wiki / source déclarée. Langue : français uniquement.
- Anti-homonyme: reste dans le thème.
- Source déclarée vague (« culture générale ») → source_verdict = "douteux".
- Source encyclopédique plausible même si non vérifiable ligne à ligne → "ok" ou "douteux", pas "faux" sans raison.

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
    { "nom": "Wikipédia FR — titre page", "detail": "ce qu’elle confirme" },
    { "nom": "IA", "detail": "ton jugement en 1 phrase" }
  ],
  "source": "source déclarée si cohérente, sinon vide"
}
"verdict" global = le plus sévère (faux > douteux > inconnu > ok).`
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), OR_TIMEOUT_MS)
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
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content:
              `Tu vérifies en français avec les extraits Wikipédia fournis. JSON strict. Anti-homonyme.`,
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

function resultFromWiki(input: {
  correctAnswer: string
  sourceType?: string
  wikiHits: WikiHit[]
  orNote?: string
  aiError?: string
}): FactCheckAiResult {
  const sources = wikiAsSources(input.wikiHits)
  const declared = input.sourceType?.trim() || ''
  if (
    declared &&
    declaredSourceLooksEncyclopedia(declared) &&
    !sources.some((s) =>
      s.name.toLowerCase().includes(declared.slice(0, 12).toLowerCase()),
    )
  ) {
    sources.push({
      name: declared,
      detail: 'Source encyclopédique déclarée par le quiz (non relue ligne à ligne).',
    })
  }

  // Wiki seul → réponse plausible mais incomplète (manque la 2ᵉ vérif IA)
  const answerVerdict: FactVerdict =
    input.wikiHits.length >= 1 ? 'douteux' : 'inconnu'
  let sourceVerdict: FactVerdict = 'inconnu'
  if (!declared) sourceVerdict = 'inconnu'
  else if (declaredSourceLooksVague(declared)) sourceVerdict = 'douteux'
  else if (declaredSourceLooksEncyclopedia(declared)) sourceVerdict = 'ok'
  else sourceVerdict = 'douteux'

  const aiErr =
    input.aiError?.trim() ||
    'Tous les modèles OpenRouter free ont échoué ou sont saturés.'

  const extract = [
    input.wikiHits[0]?.extract,
    input.wikiHits.length > 1
      ? `Aussi trouvé sur « ${input.wikiHits[1]!.title} » (Wikipédia FR).`
      : '',
    'La 2ᵉ vérification (IA) n’a pas pu se faire — seules les preuves Wikipédia sont disponibles.',
    input.orNote,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    verdict: mergeVerdict(answerVerdict, sourceVerdict),
    answerVerdict,
    sourceVerdict,
    title: input.wikiHits[0]?.title || input.correctAnswer,
    extract: extract || 'Preuves Wikipédia trouvées (IA indisponible).',
    source: declared,
    answerNote:
      input.wikiHits.length >= 1
        ? 'Wikipédia a trouvé des preuves, mais la confirmation IA (2ᵉ vérif) a échoué.'
        : 'Pas d’éléments Wikipédia ni IA.',
    sourceNote:
      sourceVerdict === 'ok'
        ? 'Étiquette d’origine du quiz de type encyclopédique / crédible.'
        : sourceVerdict === 'douteux'
          ? 'Étiquette d’origine vague ou non vérifiée précisément.'
          : 'Pas d’étiquette d’origine.',
    confirmingSources: sources.slice(0, 5),
    sourcesConfirmed: Math.min(sources.length, 5),
    provider: 'wikipedia',
    model: 'wikipedia-fr',
    aiFailed: true,
    aiError: aiErr.slice(0, 200),
  }
}

export async function verifyFactWithOpenRouter(input: {
  question: string
  correctAnswer: string
  explanation?: string
  sourceType?: string
  theme?: string
  answers?: string[]
}): Promise<FactCheckAiResult | { error: string }> {
  const wikiHits = await lookupWikiEvidence({
    correctAnswer: input.correctAnswer,
    question: input.question,
    theme: input.theme,
  })

  const keys = listApiKeys('openrouter')
  const prompt = buildVerifyPrompt({ ...input, wikiHits })
  const errors: string[] = []
  const aiStarted = Date.now()

  if (keys.length > 0) {
    // 1 clé × 2 modèles max, budget temps strict → évite 504 Vercel
    outer: for (const apiKey of keys.slice(0, 1)) {
      for (const model of VERIFY_MODELS) {
        if (Date.now() - aiStarted > AI_BUDGET_MS) {
          errors.push('budget IA épuisé (évite timeout serveur)')
          break outer
        }
        try {
          const raw = await callOpenRouter(apiKey, model, prompt)
          const obj = extractJsonObject(raw)
          if (!obj) {
            errors.push(`${model}: JSON invalide`)
            continue
          }

          let confirmingSources = parseConfirmingSources(
            obj.sources_confirmantes ?? obj.confirming_sources ?? obj.sources,
          )
          for (const w of wikiAsSources(wikiHits)) {
            const key = w.name.toLowerCase()
            if (!confirmingSources.some((s) => s.name.toLowerCase() === key)) {
              confirmingSources.push(w)
            }
          }

          const extract = String(obj.resume ?? obj.extract ?? '').trim()
          const title = String(
            obj.titre ?? obj.title ?? wikiHits[0]?.title ?? input.correctAnswer,
          ).trim()
          const source = String(obj.source ?? input.sourceType ?? '').trim()
          const answerNote = String(
            obj.commentaire_reponse ?? obj.answer_note ?? '',
          ).trim()
          let sourceNote = String(
            obj.commentaire_source ?? obj.source_note ?? '',
          ).trim()
          if (extract.length < 12 && answerNote.length < 8 && wikiHits.length === 0) {
            errors.push(`${model}: résumé trop court`)
            continue
          }

          let answerVerdict = normalizeVerdict(
            obj.reponse_verdict ?? obj.answer_verdict ?? obj.verdict,
          )
          if (wikiHits.length >= 1 && answerVerdict === 'inconnu') {
            answerVerdict = 'ok'
          }

          const sourceVerdict = normalizeVerdict(
            obj.source_verdict ??
              (input.sourceType?.trim() ? obj.verdict : 'inconnu'),
          )

          // 1 Wiki + 1 IA = 2 confirmations
          if (answerVerdict === 'ok' || answerVerdict === 'douteux') {
            confirmingSources = ensureAiConfirmSource(
              confirmingSources,
              model,
              answerNote || extract || 'Jugement du modèle OpenRouter.',
            )
          }
          confirmingSources = confirmingSources.slice(0, 5)

          if (answerVerdict === 'ok' && !meetsConfirmRule(confirmingSources)) {
            if (wikiHits.length >= 1) {
              answerVerdict = 'douteux'
              sourceNote =
                sourceNote ||
                'Il faut 1 preuve Wikipédia + 1 confirmation IA pour valider.'
            } else {
              answerVerdict = 'inconnu'
              sourceNote =
                sourceNote ||
                'Pas de Wikipédia ni confirmation IA suffisante — validation refusée.'
            }
          }

          let verdict = normalizeVerdict(
            obj.verdict ?? mergeVerdict(answerVerdict, sourceVerdict),
          )
          verdict = mergeVerdict(verdict, mergeVerdict(answerVerdict, sourceVerdict))

          const split = splitConfirmations(confirmingSources)
          const sourcesLine =
            confirmingSources.length > 0
              ? `Sources (${confirmingSources.length} · Wiki ${split.wiki} + IA ${split.ai}) : ${confirmingSources
                  .map((s) => s.name)
                  .join(' · ')}`
              : ''
          const combined =
            [
              extract || answerNote || wikiHits[0]?.extract || '',
              sourcesLine,
              sourceNote,
            ]
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
            answerNote:
              answerNote ||
              (wikiHits.length
                ? 'Confirmé avec Wikipédia + IA.'
                : 'Confirmé par IA (sans Wikipédia).'),
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
  } else {
    errors.push('OPENROUTER_API_KEY manquante')
  }

  // Fallback : Wiki quand même + préciser que l’IA a échoué
  if (wikiHits.length > 0) {
    return resultFromWiki({
      correctAnswer: input.correctAnswer,
      sourceType: input.sourceType,
      wikiHits,
      aiError:
        errors.length > 0
          ? errors[errors.length - 1]!.slice(0, 160)
          : 'OPENROUTER_API_KEY manquante ou aucun modèle free joignable',
      orNote: undefined,
    })
  }

  return {
    error:
      errors.length > 0
        ? errors[errors.length - 1]!.slice(0, 160)
        : 'Aucune preuve Wikipédia ni modèle OpenRouter disponible',
  }
}
