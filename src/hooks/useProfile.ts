import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { ADMIN_PROFILE_ID, hasLocalAdminUnlock, isAdminProfile } from '../lib/adminCode'
import { saveDisplayName } from '../lib/displayName'

export interface LocalProfileRef {
  profileId: string
  pseudo: string
}

export interface QuizScoreEntry {
  theme: string
  difficulty: string
  score: number
  date: number
}

export interface MiniGameStats {
  parties: number
  victoires: number
  meilleurScore?: number
}

export interface ProfileData {
  profileId: string
  pseudo: string
  recoveryCode: string
  createdAt: number
  lastUsedAt: number
  usageCount: number
  isAdmin?: boolean
  scores: {
    quiz: QuizScoreEntry[]
    pendu: MiniGameStats
    morpion: MiniGameStats
    flagQuiz: MiniGameStats
  }
}

export type ProfileGameMode = 'quiz' | 'pendu' | 'morpion' | 'flagQuiz'

const PROFILES_KEY = 'quizz:profiles'
const ACTIVE_PROFILE_KEY = 'quizz:active_profile_id'

const emptyMini = (): MiniGameStats => ({ parties: 0, victoires: 0 })

function asMini(raw: unknown): MiniGameStats {
  if (!raw || typeof raw !== 'object') return emptyMini()
  const o = raw as Record<string, unknown>
  const best = Number(o.meilleurScore)
  return {
    parties: Math.max(0, Math.floor(Number(o.parties) || 0)),
    victoires: Math.max(0, Math.floor(Number(o.victoires) || 0)),
    meilleurScore: Number.isFinite(best) && best > 0 ? best : undefined,
  }
}

function normalizeProfile(raw: unknown): ProfileData | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const profileId = String(o.profileId ?? '')
  const pseudo = String(o.pseudo ?? '').trim()
  if (!profileId || !pseudo) return null
  const scores =
    o.scores && typeof o.scores === 'object'
      ? (o.scores as Record<string, unknown>)
      : {}
  const quiz = Array.isArray(scores.quiz)
    ? scores.quiz.filter(
        (e): e is QuizScoreEntry =>
          Boolean(e) &&
          typeof e === 'object' &&
          typeof (e as QuizScoreEntry).theme === 'string',
      )
    : []
  return {
    profileId,
    pseudo,
    recoveryCode: String(o.recoveryCode ?? ''),
    createdAt: Number(o.createdAt) || Date.now(),
    lastUsedAt: Number(o.lastUsedAt) || Date.now(),
    usageCount: Math.max(0, Math.floor(Number(o.usageCount) || 0)),
    isAdmin: o.isAdmin === true || profileId === 'pf_admin',
    scores: {
      quiz,
      pendu: asMini(scores.pendu),
      morpion: asMini(scores.morpion),
      flagQuiz: asMini(scores.flagQuiz),
    },
  }
}

function readProfilesList(): LocalProfileRef[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is LocalProfileRef =>
        Boolean(p) &&
        typeof p === 'object' &&
        typeof p.profileId === 'string' &&
        typeof p.pseudo === 'string',
    )
  } catch {
    return []
  }
}

function writeProfilesList(profiles: LocalProfileRef[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
}

function adminListEntry(): LocalProfileRef {
  try {
    const id = localStorage.getItem('quizz:admin:profile_id') || ADMIN_PROFILE_ID
    return { profileId: id, pseudo: 'Admin' }
  } catch {
    return { profileId: ADMIN_PROFILE_ID, pseudo: 'Admin' }
  }
}

function profilesForDevice(list: LocalProfileRef[]): LocalProfileRef[] {
  const players = list.filter((p) => !isAdminProfile(p))
  if (!hasLocalAdminUnlock()) return players
  const existing = list.find((p) => isAdminProfile(p))
  return [...players, existing ?? adminListEntry()]
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  return data.error || `Erreur ${res.status}`
}

function useProfileState() {
  const [profiles, setProfiles] = useState<LocalProfileRef[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [activeProfile, setActiveProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const next = profilesForDevice(readProfilesList())
    writeProfilesList(next)
    setProfiles(next)
    setActiveProfileId(localStorage.getItem(ACTIVE_PROFILE_KEY))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!activeProfileId) {
      setActiveProfile(null)
      return
    }
    let cancelled = false
    fetch(`/api/profile?id=${encodeURIComponent(activeProfileId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (cancelled) return
        const profile = normalizeProfile(raw)
        setActiveProfile(profile)
        if (profile) saveDisplayName(profile.pseudo)
      })
      .catch(() => {
        if (!cancelled) setActiveProfile(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeProfileId])

  const remember = useCallback((profile: ProfileData, makeActive = true) => {
    const current = readProfilesList()
    const merged = current.some((p) => p.profileId === profile.profileId)
      ? current.map((p) =>
          p.profileId === profile.profileId
            ? { profileId: profile.profileId, pseudo: profile.pseudo }
            : p,
        )
      : [...current, { profileId: profile.profileId, pseudo: profile.pseudo }]
    const next = profilesForDevice(merged)
    writeProfilesList(next)
    setProfiles(next)
    if (makeActive) {
      localStorage.setItem(ACTIVE_PROFILE_KEY, profile.profileId)
      setActiveProfileId(profile.profileId)
      setActiveProfile(profile)
      saveDisplayName(profile.pseudo)
    }
  }, [])

  const createProfile = useCallback(
    async (pseudo: string) => {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo }),
      })
      if (!res.ok) throw new Error(await readError(res))
      const profile = normalizeProfile(await res.json())
      if (!profile) throw new Error('Erreur création du profil')
      remember(profile)
      return profile
    },
    [remember],
  )

  const recoverProfile = useCallback(
    async (recoveryCode: string) => {
      const res = await fetch('/api/profile?action=recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryCode }),
      })
      if (!res.ok) throw new Error(await readError(res))
      const profile = normalizeProfile(await res.json())
      if (!profile) throw new Error('Code invalide')
      remember(profile)
      return profile
    },
    [remember],
  )

  const switchProfile = useCallback((profileId: string) => {
    localStorage.setItem(ACTIVE_PROFILE_KEY, profileId)
    setActiveProfileId(profileId)
    const local = readProfilesList().find((p) => p.profileId === profileId)
    if (local) saveDisplayName(local.pseudo)
  }, [])

  const playWithoutProfile = useCallback(() => {
    localStorage.removeItem(ACTIVE_PROFILE_KEY)
    setActiveProfileId(null)
    setActiveProfile(null)
  }, [])

  const updatePseudo = useCallback(
    async (pseudo: string) => {
      if (!activeProfileId) return
      const res = await fetch(
        `/api/profile?id=${encodeURIComponent(activeProfileId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pseudo }),
        },
      )
      if (!res.ok) throw new Error(await readError(res))
      const profile = normalizeProfile(await res.json())
      if (!profile) throw new Error('Erreur mise à jour du pseudo')
      remember(profile)
    },
    [activeProfileId, remember],
  )

  const submitScore = useCallback(
    async (mode: ProfileGameMode, payload: unknown) => {
      if (!activeProfileId) return
      const res = await fetch(
        `/api/profile?id=${encodeURIComponent(activeProfileId)}&action=scores`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, payload }),
        },
      )
      if (!res.ok) return
      const profile = normalizeProfile(await res.json())
      if (profile) setActiveProfile(profile)
    },
    [activeProfileId],
  )

  const recordMiniGame = useCallback(
    async (
      mode: Exclude<ProfileGameMode, 'quiz'>,
      result: { won?: boolean; score?: number },
    ) => {
      if (!activeProfileId || !activeProfile) return
      const cur = activeProfile.scores[mode] ?? emptyMini()
      await submitScore(mode, {
        parties: cur.parties + 1,
        victoires: cur.victoires + (result.won ? 1 : 0),
        meilleurScore: Math.max(cur.meilleurScore ?? 0, result.score ?? 0),
      })
    },
    [activeProfile, activeProfileId, submitScore],
  )

  const removeFromDevice = useCallback(
    (profileId: string) => {
      const updated = readProfilesList().filter((p) => p.profileId !== profileId)
      writeProfilesList(updated)
      setProfiles(updated)
      if (activeProfileId === profileId) {
        const next = updated[0]?.profileId || null
        if (next) {
          localStorage.setItem(ACTIVE_PROFILE_KEY, next)
          const local = updated[0]
          if (local) saveDisplayName(local.pseudo)
        } else {
          localStorage.removeItem(ACTIVE_PROFILE_KEY)
        }
        setActiveProfileId(next)
      }
    },
    [activeProfileId],
  )

  const deleteForever = useCallback(
    async (profileId: string) => {
      const res = await fetch(
        `/api/profile?id=${encodeURIComponent(profileId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error(await readError(res))
      removeFromDevice(profileId)
    },
    [removeFromDevice],
  )

  return {
    profiles,
    activeProfileId,
    activeProfile,
    loading,
    createProfile,
    recoverProfile,
    switchProfile,
    playWithoutProfile,
    updatePseudo,
    submitScore,
    recordMiniGame,
    removeFromDevice,
    deleteForever,
  }
}

type ProfileApi = ReturnType<typeof useProfileState>

const ProfileContext = createContext<ProfileApi | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const value = useProfileState()
  return createElement(ProfileContext.Provider, { value }, children)
}

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileContext)
  if (!ctx) {
    throw new Error('useProfile doit être utilisé dans ProfileProvider')
  }
  return ctx
}

/** Pseudo du profil actif, ou null s’il n’y en a pas. */
export function useLockedPseudo(): string | null {
  const { activeProfile, activeProfileId, profiles } = useProfile()
  const fromActive = activeProfile?.pseudo?.trim() ?? ''
  if (fromActive.length >= 2) return fromActive.slice(0, 24)
  const local = profiles.find((p) => p.profileId === activeProfileId)?.pseudo?.trim() ?? ''
  if (local.length >= 2) return local.slice(0, 24)
  return null
}
