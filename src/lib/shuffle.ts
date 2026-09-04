/** Mélange Fisher-Yates (en place). */
export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = arr[i]!
    arr[i] = arr[j]!
    arr[j] = a
  }
  return arr
}

/** Copie mélangée (Fisher-Yates). */
export function shuffle<T>(arr: readonly T[]): T[] {
  return shuffleInPlace(arr.slice())
}
