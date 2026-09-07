/** Doit matcher server/adminAuth.ts */
export const ADMIN_PANEL_CODE = 'Quizzyosh'
export const ADMIN_PROFILE_ID = 'pf_admin'

const UNLOCK_KEY = 'quizz:admin:unlocked'
const ADMIN_PROFILE_KEY = 'quizz:admin:profile_id'

export function isClientAdminCode(value: string): boolean {
  return value.trim().toLowerCase() === ADMIN_PANEL_CODE.toLowerCase()
}

export function hasLocalAdminUnlock(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

export function rememberLocalAdminUnlock(): void {
  try {
    localStorage.setItem(UNLOCK_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function rememberAdminProfileId(profileId: string): void {
  try {
    localStorage.setItem(ADMIN_PROFILE_KEY, profileId)
  } catch {
    /* ignore */
  }
}

export function isAdminProfile(profile: {
  profileId?: string
  recoveryCode?: string
  pseudo?: string
  isAdmin?: boolean
}): boolean {
  if (profile.isAdmin) return true
  if (profile.profileId === ADMIN_PROFILE_ID) return true
  if (profile.recoveryCode && isClientAdminCode(profile.recoveryCode)) return true
  if (profile.pseudo?.trim().toLowerCase() === 'admin') return true
  try {
    return localStorage.getItem(ADMIN_PROFILE_KEY) === profile.profileId
  } catch {
    return false
  }
}
