import type { Difficulty } from '../types'
import { addPenduSeen, clearPenduSeen, loadPenduSeen } from './penduSeen'
import {
  drawPenduWords,
  remainingPenduPool,
  recyclePenduWords,
  type PenduWordSource,
} from './penduWords'
import { SOLO_DUO_WORDS } from './pendu'

export function remainingPenduCount(difficulty: Difficulty): number {
  return remainingPenduPool(difficulty, loadPenduSeen(difficulty)).length
}

export async function takePenduWords(
  count: number,
  difficulty: Difficulty,
  mode: 'solo' | 'duo' | 'multi' = 'solo',
  wordSource: PenduWordSource = 'bank',
): Promise<string[]> {
  const need = Math.max(1, Math.min(12, count))
  const seen = loadPenduSeen(difficulty)
  const fromBank = drawPenduWords(need, difficulty, seen)
  if (fromBank.length >= need) {
    const words = fromBank.slice(0, need)
    addPenduSeen(difficulty, words)
    return words
  }

  if (wordSource === 'bank') {
    const words = recyclePenduWords(need, difficulty, fromBank)
    clearPenduSeen(difficulty)
    addPenduSeen(difficulty, words)
    return words
  }

  const exclude = [...seen, ...fromBank]
  try {
    const extraNeed = need - fromBank.length
    const res = await fetch('/api/pendu-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'fill',
        difficulty,
        count: extraNeed,
        exclude,
        mode,
        wordSource: 'ai',
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      words?: unknown
    }
    if (res.ok && Array.isArray(data.words)) {
      const extra = data.words.filter(
        (x): x is string => typeof x === 'string' && x.trim().length > 0,
      )
      const words = [...fromBank, ...extra].slice(0, need)
      if (words.length > 0) {
        addPenduSeen(difficulty, words)
        return words
      }
    }
  } catch {
    /* recycle */
  }

  const recycled = recyclePenduWords(need, difficulty, fromBank)
  clearPenduSeen(difficulty)
  addPenduSeen(difficulty, recycled)
  return recycled
}

export function takePenduWordsNeeded(mode: 'solo' | 'duo' | 'multi'): number {
  return mode === 'multi' ? 1 : SOLO_DUO_WORDS
}
