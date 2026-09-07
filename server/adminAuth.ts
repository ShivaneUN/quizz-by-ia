/** Code panneau admin (accueil) + fallback si CALIB_STATS_SECRET absent / différent. */
export const ADMIN_PANEL_CODE = 'Quizzyosh'

export function isAdminSecret(secret: unknown): boolean {
  const s = String(secret ?? '').trim()
  if (!s) return false
  if (s === ADMIN_PANEL_CODE) return true
  if (s.toLowerCase() === ADMIN_PANEL_CODE.toLowerCase()) return true
  const env = process.env.CALIB_STATS_SECRET?.trim()
  return Boolean(env && s === env)
}
