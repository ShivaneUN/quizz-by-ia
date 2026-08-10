export interface AuditEntry {
  questionId: string
  question: string
  answers: [string, string, string, string]
  selectedIndex: number
  correctIndex: number
  correct: boolean
  explanation?: string
  sourceType?: string
}
