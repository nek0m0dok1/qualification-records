import { TAGS, fail, type Records } from './model'
export const MIN_DATE_YEAR = 1900
export const MAX_DATE_YEAR = 2100
export function formatDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${Number(year)}年${Number(month)}月${day ? `${Number(day)}日` : ''}`
}

export function validDate(value: unknown, dayAllowed = false): value is string {
  if (
    typeof value !== 'string' ||
    !(dayAllowed ? /^\d{4}-\d{2}(?:-\d{2})?$/ : /^\d{4}-\d{2}$/).test(value)
  )
    return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || year > 9999 || month < 1 || month > 12) return false
  if (day === undefined) return true
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}
export function validInputDate(value: unknown, dayAllowed = false): value is string {
  if (!validDate(value, dayAllowed)) return false
  const year = Number(value.slice(0, 4))
  return year >= MIN_DATE_YEAR && year <= MAX_DATE_YEAR
}
const idPattern = /^[A-Za-z0-9_-]{1,128}$/
export const validId = (v: unknown): v is string => typeof v === 'string' && idPattern.test(v)
export function validateRecords(records: Records, tagIds = TAGS.map((t) => t.id)): void {
  if (
    !records ||
    !Array.isArray(records.qualifications) ||
    !Array.isArray(records.acquisitions) ||
    !Array.isArray(records.examAttempts)
  )
    fail('記録の構造が不正です。')
  for (const rows of [records.qualifications, records.acquisitions, records.examAttempts]) {
    const seen = new Set<string>()
    for (const row of rows) {
      if (!row || !validId(row.id) || seen.has(row.id)) fail('記録IDが不正、または重複しています。')
      seen.add(row.id)
    }
  }
  const qualifications = new Set(records.qualifications.map((q) => q.id))
  for (const q of records.qualifications) {
    if (typeof q.name !== 'string' || !q.name.trim() || q.name.length > 200)
      fail('資格名は1〜200文字で入力してください。')
    if (
      typeof q.gradeOrCategory !== 'string' ||
      q.gradeOrCategory.length > 100 ||
      typeof q.memo !== 'string' ||
      q.memo.length > 5000
    )
      fail('級・区分またはメモが不正です。')
    if (
      !Array.isArray(q.fixedTagIds) ||
      q.fixedTagIds.some((t) => !tagIds.includes(t)) ||
      new Set(q.fixedTagIds).size !== q.fixedTagIds.length
    )
      fail('固定タグが不正です。')
  }
  const attempts = new Map(records.examAttempts.map((a) => [a.id, a]))
  for (const a of records.examAttempts) {
    if (
      !qualifications.has(a.qualificationId) ||
      !validDate(a.examDate, true) ||
      !['passed', 'failed', 'pending'].includes(a.result)
    )
      fail('受験履歴の日付・結果・資格への参照が不正です。')
  }
  const acquisitionQualifications = new Set<string>()
  for (const a of records.acquisitions) {
    if (
      !qualifications.has(a.qualificationId) ||
      a.id !== a.qualificationId ||
      acquisitionQualifications.has(a.qualificationId)
    )
      fail('取得情報は資格ごとに1件です。')
    acquisitionQualifications.add(a.qualificationId)
    if (!validDate(a.acquiredMonth)) fail('取得年月が不正です。')
    const links: unknown[] = [a.acquiredAttemptId]
    for (const renewal of [a.renewal, a.previousRenewal]) {
      if (!renewal) continue
      if (!validDate(renewal.month) || renewal.month < a.acquiredMonth)
        fail('更新年月は取得年月以降にしてください。')
      links.push(renewal.attemptId)
    }
    if (a.previousRenewal && !a.renewal) fail('直前更新の控えだけを保存できません。')
    for (const link of links)
      if (link !== undefined) {
        if (!validId(link)) fail('合格履歴への参照が不正です。')
        const exam = attempts.get(link)
        if (!exam || exam.result !== 'passed' || exam.qualificationId !== a.qualificationId)
          fail('取得・更新の根拠は同じ資格の合格履歴である必要があります。')
      }
    const linked = links.filter((x) => x !== undefined)
    if (new Set(linked).size !== linked.length)
      fail('同じ履歴を取得と更新の根拠に重複指定できません。')
  }
}
