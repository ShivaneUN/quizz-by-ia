export interface AuditEntry {
  questionId: string
  question: string
  answers: [string, string, string, string]
  selectedIndex: number
  correctIndex: number
  correct: boolean
  explanation?: string
  sourceType?: string
  /** Titre — Artiste (Deezer) ou libellé complet pour l’audit */
  revealAnswer?: string
  /** Pochette Deezer — affichée seulement dans l’audit */
  coverUrl?: string
}
