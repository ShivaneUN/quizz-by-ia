import type { Difficulty } from '../types'
import { canonPenduWord } from './penduWords'

const KEY = 'quizz:pendu:seen:v1'

type SeenMap = Record<Difficulty, string[]>

function empty(): SeenMap {
  return { easy: [], medium: [], hard: [] }
}

function load(): SeenMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<SeenMap>
    return {
      easy: Array.isArray(parsed.easy) ? parsed.easy : [],
      medium: Array.isArray(parsed.medium) ? parsed.medium : [],
      hard: Array.isArray(parsed.hard) ? parsed.hard : [],
    }
  } catch {
    return empty()
  }
}

function save(map: SeenMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* quota */
  }
}

export function loadPenduSeen(difficulty: Difficulty): string[] {
  return load()[difficulty].map(canonPenduWord).filter(Boolean)
}

export function addPenduSeen(
  difficulty: Difficulty,
  words: readonly string[],
): void {
  const map = load()
  const set = new Set(map[difficulty].map(canonPenduWord))
  for (const w of words) {
    const c = canonPenduWord(w)
    if (c) set.add(c)
  }
  map[difficulty] = [...set]
  save(map)
}

export function clearPenduSeen(difficulty: Difficulty): void {
  const map = load()
  map[difficulty] = []
  save(map)
}
