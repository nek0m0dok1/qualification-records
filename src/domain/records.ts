import {
  fail,
  TAGS,
  type Records,
  type Result,
  type Direction,
  type Qualification,
  type Acquisition,
} from './model'
import { validateRecords, validDate } from './validation'
export interface Registration {
  qualification: Qualification
  existing: boolean
  result: Result
  includeAttempt: boolean
  examDate?: string
  month?: string
  attemptId: string
}
function checked(records: Records): Records {
  validateRecords(records)
  return records
}
export function register(records: Records, input: Registration): Records {
  const next = structuredClone(records)
  const q = input.qualification
  if (input.existing) {
    if (!next.qualifications.some((x) => x.id === q.id)) fail('対象資格が見つかりません。')
  } else {
    if (next.qualifications.some((x) => x.id === q.id)) fail('資格IDが重複しています。')
    if (q.fixedTagIds.some((tagId) => !TAGS.some((tag) => tag.id === tagId && tag.selectable)))
      fail('選択できない固定タグが含まれています。')
    next.qualifications.push(q)
  }
  const include = input.result !== 'passed' || input.includeAttempt
  if (include) {
    if (!validDate(input.examDate, true)) fail('受験年月を入力してください。日は任意です。')
    next.examAttempts.push({
      id: input.attemptId,
      qualificationId: q.id,
      examDate: input.examDate,
      result: input.result,
    })
  }
  if (input.result === 'passed')
    applyPass(next, q.id, input.month, include ? input.attemptId : undefined)
  return checked(next)
}
function applyPass(
  records: Records,
  qualificationId: string,
  month: string | undefined,
  attemptId?: string,
) {
  if (!validDate(month)) fail('取得・更新年月を入力してください。')
  const a = records.acquisitions.find((x) => x.qualificationId === qualificationId)
  if (!a) {
    records.acquisitions.push({
      id: qualificationId,
      qualificationId,
      acquiredMonth: month,
      ...(attemptId ? { acquiredAttemptId: attemptId } : {}),
    })
  } else {
    if (a.renewal) a.previousRenewal = structuredClone(a.renewal)
    else delete a.previousRenewal
    a.renewal = { month, ...(attemptId ? { attemptId } : {}) }
  }
}
export function linkedImpact(records: Records, attemptId: string): string {
  const a = records.acquisitions.find(
    (x) =>
      x.acquiredAttemptId === attemptId ||
      x.renewal?.attemptId === attemptId ||
      x.previousRenewal?.attemptId === attemptId,
  )
  if (!a) return '保有情報への変更はありません。'
  if (a.acquiredAttemptId === attemptId)
    return '取得年月・全更新情報も削除します。\n資格情報・他の受験履歴は残ります。'
  if (a.renewal?.attemptId === attemptId)
    return a.previousRenewal
      ? `最新更新を取り消し、${a.previousRenewal.month}の更新情報へ戻します。`
      : '最新の更新情報を削除します。取得年月は残ります。'
  return '直前更新の控えも削除します。'
}
function undoRenewal(a: Acquisition) {
  if (a.previousRenewal) a.renewal = structuredClone(a.previousRenewal)
  else delete a.renewal
  delete a.previousRenewal
}
function detach(records: Records, attemptId: string) {
  records.acquisitions = records.acquisitions.filter((a) => a.acquiredAttemptId !== attemptId)
  for (const a of records.acquisitions) {
    if (a.renewal?.attemptId === attemptId) undoRenewal(a)
    else if (a.previousRenewal?.attemptId === attemptId) delete a.previousRenewal
  }
}
export function editAttempt(
  records: Records,
  id: string,
  result: Result,
  examDate: string,
  consent: boolean,
  month?: string,
): Records {
  const next = structuredClone(records)
  const a = next.examAttempts.find((x) => x.id === id)
  if (!a) fail('受験履歴が見つかりません。')
  if (a.result !== result) {
    if (!consent) fail('変更を取り消しました。')
    if (a.result === 'passed') detach(next, id)
    if (result === 'passed') applyPass(next, a.qualificationId, month, id)
  }
  a.result = result
  a.examDate = examDate
  return checked(next)
}
export function deleteAttempt(records: Records, id: string, consent: boolean): Records {
  if (!consent) fail('削除を取り消しました。')
  if (!records.examAttempts.some((a) => a.id === id)) fail('受験履歴が見つかりません。')
  const next = structuredClone(records)
  detach(next, id)
  next.examAttempts = next.examAttempts.filter((a) => a.id !== id)
  return checked(next)
}
export function deleteQualification(records: Records, id: string, consent: boolean): Records {
  if (!consent) fail('削除を取り消しました。')
  return checked({
    qualifications: records.qualifications.filter((q) => q.id !== id),
    acquisitions: records.acquisitions.filter((a) => a.qualificationId !== id),
    examAttempts: records.examAttempts.filter((a) => a.qualificationId !== id),
  })
}
export function editQualification(
  records: Records,
  qualification: Qualification,
  acquiredMonth?: string,
  renewedMonth?: string,
): Records {
  const next = structuredClone(records)
  const index = next.qualifications.findIndex((q) => q.id === qualification.id)
  if (index < 0) fail('資格が見つかりません。')
  const existingTags = new Set(next.qualifications[index].fixedTagIds)
  if (
    qualification.fixedTagIds.some(
      (tagId) =>
        !existingTags.has(tagId) && !TAGS.some((tag) => tag.id === tagId && tag.selectable),
    )
  )
    fail('選択できない固定タグは追加できません。')
  next.qualifications[index] = qualification
  const a = next.acquisitions.find((x) => x.qualificationId === qualification.id)
  if (a && acquiredMonth !== undefined) a.acquiredMonth = acquiredMonth
  if (a?.renewal && renewedMonth !== undefined) a.renewal.month = renewedMonth
  return checked(next)
}
export function cancelLatestRenewal(
  records: Records,
  qualificationId: string,
  consent: boolean,
): Records {
  if (!consent) fail('変更を取り消しました。')
  const next = structuredClone(records)
  const a = next.acquisitions.find((x) => x.qualificationId === qualificationId)
  if (!a?.renewal) fail('取り消す更新情報がありません。')
  undoRenewal(a)
  return checked(next)
}
export function deleteAcquisitionOnly(): never {
  return fail('保有情報のみの削除は未実装です')
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
export function compareExamDates(
  a: { examDate: string; id: string },
  b: { examDate: string; id: string },
  direction: Direction,
) {
  const factor = direction === 'asc' ? 1 : -1
  const month = compare(a.examDate.slice(0, 7), b.examDate.slice(0, 7)) * factor
  if (month) return month
  const ad = a.examDate.length === 10,
    bd = b.examDate.length === 10
  if (ad !== bd) return ad ? -1 : 1
  return compare(a.examDate, b.examDate) * factor || compare(a.id, b.id)
}
export function ownedQualifications(
  records: Records,
  search: string,
  tags: string[],
  direction: Direction,
) {
  return records.acquisitions
    .map((a) => ({
      acquisition: a,
      qualification: records.qualifications.find((q) => q.id === a.qualificationId)!,
    }))
    .filter(
      ({ qualification: q }) =>
        q.name.includes(search) && tags.every((t) => q.fixedTagIds.includes(t)),
    )
    .sort(
      (a, b) =>
        compare(a.acquisition.acquiredMonth, b.acquisition.acquiredMonth) *
          (direction === 'asc' ? 1 : -1) || compare(a.qualification.id, b.qualification.id),
    )
}
export function filteredAttempts(
  records: Records,
  search: string,
  results: Result[],
  direction: Direction,
) {
  return records.examAttempts
    .filter(
      (a) =>
        records.qualifications.find((q) => q.id === a.qualificationId)!.name.includes(search) &&
        (!results.length || results.includes(a.result)),
    )
    .sort((a, b) => compareExamDates(a, b, direction))
}
