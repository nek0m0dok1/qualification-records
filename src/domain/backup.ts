import { TAGS, fail, type Records } from './model'
import { validateRecords } from './validation'
export interface Backup extends Records {
  format: 'qualification-records'
  version: 1
  exportedAt: string
  tags: { id: string; label: string }[]
}
const only = (obj: unknown, keys: string[]) =>
  obj &&
  typeof obj === 'object' &&
  !Array.isArray(obj) &&
  Object.keys(obj).every((k) => keys.includes(k))
export function parseBackup(text: string): Backup {
  let raw: Backup
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('JSONファイルを読み取れません。')
  }
  if (
    !only(raw, [
      'format',
      'version',
      'exportedAt',
      'tags',
      'qualifications',
      'acquisitions',
      'examAttempts',
    ]) ||
    raw.format !== 'qualification-records' ||
    raw.version !== 1 ||
    typeof raw.exportedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(raw.exportedAt) ||
    !Number.isFinite(Date.parse(raw.exportedAt))
  )
    fail('未対応の形式・バージョン、または不正な書き出し日時です。')
  if (
    !Array.isArray(raw.tags) ||
    raw.tags.length !== TAGS.length ||
    raw.tags.some(
      (t) =>
        !only(t, ['id', 'label']) ||
        !TAGS.some((x) => x.id === t.id) ||
        typeof t.label !== 'string',
    ) ||
    new Set(raw.tags.map((t) => t.id)).size !== raw.tags.length
  )
    fail('タグ定義が不正です。')
  for (const [key, allowed] of [
    ['qualifications', ['id', 'name', 'gradeOrCategory', 'fixedTagIds', 'memo']],
    [
      'acquisitions',
      ['id', 'qualificationId', 'acquiredMonth', 'acquiredAttemptId', 'renewal', 'previousRenewal'],
    ],
    ['examAttempts', ['id', 'qualificationId', 'examDate', 'result']],
  ] as const)
    if (!Array.isArray(raw[key]) || raw[key].some((row) => !only(row, [...allowed])))
      fail('記録に不正な項目があります。')
  for (const a of raw.acquisitions)
    for (const renewal of [a.renewal, a.previousRenewal])
      if (renewal !== undefined && !only(renewal, ['month', 'attemptId']))
        fail('更新情報の構造が不正です。')
  validateRecords(raw)
  return raw
}
export function makeBackup(records: Records, now = new Date()): Backup {
  validateRecords(records)
  return {
    format: 'qualification-records',
    version: 1,
    exportedAt: now.toISOString(),
    tags: TAGS.map(({ id, label }) => ({ id, label })),
    ...structuredClone(records),
  }
}

export function backupRecords(backup: Backup): Records {
  // A Backup held in a Vue ref is a Proxy and cannot be passed to structuredClone directly.
  const copy = JSON.parse(JSON.stringify(backup)) as Backup
  return {
    qualifications: copy.qualifications,
    acquisitions: copy.acquisitions,
    examAttempts: copy.examAttempts,
  }
}
