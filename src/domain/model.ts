export type Result = 'passed' | 'failed' | 'pending'
export type Direction = 'asc' | 'desc'
export interface Qualification {
  id: string
  name: string
  gradeOrCategory: string
  fixedTagIds: string[]
  memo: string
}
export interface Renewal {
  month: string
  attemptId?: string
}
export interface Acquisition {
  id: string
  qualificationId: string
  acquiredMonth: string
  acquiredAttemptId?: string
  renewal?: Renewal
  previousRenewal?: Renewal
}
export interface ExamAttempt {
  id: string
  qualificationId: string
  examDate: string
  result: Result
}
export interface Records {
  qualifications: Qualification[]
  acquisitions: Acquisition[]
  examAttempts: ExamAttempt[]
}
export interface Tag {
  id: string
  label: string
  selectable: boolean
}
export const TAGS: readonly Tag[] = [
  ['language', '語学'],
  ['it', 'IT'],
  ['business-finance', 'ビジネス・金融'],
  ['law-public', '法律・行政'],
  ['industry', '工業・技術'],
  ['health-welfare', '医療・福祉'],
  ['education-childcare', '教育・保育'],
  ['life-culture', '生活・文化'],
  ['other', 'その他'],
].map(([id, label]) => ({ id, label, selectable: true }))
export const emptyRecords = (): Records => ({
  qualifications: [],
  acquisitions: [],
  examAttempts: [],
})
export const resultLabel: Record<Result, string> = {
  passed: '合格',
  failed: '不合格',
  pending: '結果待ち',
}
export function fail(message: string): never {
  throw new Error(message)
}
