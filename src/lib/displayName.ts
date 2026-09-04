/**
 * Pseudo unique pour chat, salles quiz et morpion.
 * Un nom validé quelque part est repris partout — il n’y a plus qu’à confirmer.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { loadLastMultiRoom, loadMultiSession } from './multiSession'
import { loadMorpionSession } from './morpionSession'

const KEY = 'quizz:displayName'
const LEGACY_CHAT_KEY = 'quizz:chatDisplayName'

let cached: string | null = null
const listeners = new Set<() => void>()
let storageBound = false

function notify() {
  for (const l of listeners) l()
}

function onStorage(e: StorageEvent) {
  if (e.key !== KEY && e.key !== LEGACY_CHAT_KEY) return
  cached = null
  loadDisplayName()
  notify()
}

function ensureStorageListener() {
  if (storageBound || typeof window === 'undefined') return
  storageBound = true
  window.addEventListener('storage', onStorage)
}

export function loadDisplayName(): string {
  if (cached !== null) return cached
  const found = readLegacySources()
  cached = found
  if (found) {
    try {
      localStorage.setItem(KEY, found)
    } catch {
      /* ignore */
    }
  }
  return found
}

function readLegacySources(): string {
  const keys = [KEY, LEGACY_CHAT_KEY]
  for (const k of keys) {
    try {
      const v = localStorage.getItem(k)?.trim() ?? ''
      if (v.length >= 2) return v.slice(0, 24)
    } catch {
      /* ignore */
    }
  }
  const multi = loadMultiSession()
  if (multi && multi.playerName.trim().length >= 2) {
    return multi.playerName.trim().slice(0, 24)
  }
  const morpion = loadMorpionSession()
  if (morpion && morpion.playerName.trim().length >= 2) {
    return morpion.playerName.trim().slice(0, 24)
  }
  const last = loadLastMultiRoom()
  if (last && last.playerName.trim().length >= 2) {
    return last.playerName.trim().slice(0, 24)
  }
  return ''
}

export function saveDisplayName(raw: string): string {
  const name = raw.trim().slice(0, 24)
  if (name.length < 2) return cached ?? ''
  cached = name
  try {
    localStorage.setItem(KEY, name)
    localStorage.setItem(LEGACY_CHAT_KEY, name)
  } catch {
    /* ignore */
  }
  notify()
  return name
}

function subscribe(cb: () => void) {
  ensureStorageListener()
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): string {
  return loadDisplayName()
}

function getServerSnapshot(): string {
  return ''
}

/**
 * Brouillon local + synchro dès qu’un autre écran valide un pseudo.
 */
export function useSharedDisplayName(fallback = ''): {
  name: string
  setName: (value: string) => void
  commit: (value?: string) => string
  ready: boolean
} {
  const shared = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const seed = shared || fallback.trim()
  const [name, setName] = useState(seed)

  useEffect(() => {
    if (shared.length >= 2) setName(shared)
  }, [shared])

  useEffect(() => {
    if (name.trim().length >= 2) return
    const hint = fallback.trim()
    if (hint.length >= 2) setName(hint)
  }, [fallback, name])

  function commit(value?: string): string {
    return saveDisplayName(value ?? name)
  }

  return {
    name,
    setName,
    commit,
    ready: name.trim().length >= 2,
  }
}
