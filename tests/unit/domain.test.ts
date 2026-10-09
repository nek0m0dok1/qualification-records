import { describe, expect, it } from 'vitest'
import { emptyRecords, type Qualification } from '../../src/domain/model'
import { cancelLatestRenewal, compareExamDates, deleteAttempt, editAttempt, register, ownedQualifications } from '../../src/domain/records'
import { validDate } from '../../src/domain/validation'
import { makeBackup, parseBackup } from '../../src/domain/backup'

const qualification = (id: string, name: string, tags: string[]): Qualification => ({ id, name, gradeOrCategory: '', fixedTagIds: tags, memo: '' })

describe('日付の検証と履歴の並び順', () => {
  it('実在する年月日を検証し、うるう年と日付なしを扱う', () => {
    expect(validDate('2024-02-29', true)).toBe(true)
    expect(validDate('2023-02-29', true)).toBe(false)
    expect(validDate('2024-04-31', true)).toBe(false)
    expect(validDate('2024-04', true)).toBe(true)
    expect(validDate('2024-4', true)).toBe(false)
  })

  it('日が不明な履歴は同月の末尾に置き、IDで順序を安定させる', () => {
    const rows = [
      { id: 'unknown', examDate: '2024-05' },
      { id: 'later', examDate: '2024-05-31' },
      { id: 'earlier', examDate: '2024-05-02' },
    ]
    expect([...rows].sort((a, b) => compareExamDates(a, b, 'asc')).map(x => x.id)).toEqual(['earlier', 'later', 'unknown'])
    expect([...rows].sort((a, b) => compareExamDates(a, b, 'desc')).map(x => x.id)).toEqual(['later', 'earlier', 'unknown'])
  })
})

describe('資格・受験履歴の連動', () => {
  it('不合格履歴を保存し、合格時は取得年月と根拠を記録する', () => {
    const records = register(emptyRecords(), { qualification: qualification('q1', '資格A', ['it']), existing: false, result: 'failed', includeAttempt: false, examDate: '2024-05', attemptId: 'a1' })
    expect(records.examAttempts).toHaveLength(1)
    const passed = register(records, { qualification: qualification('q1', '資格A', ['it']), existing: true, result: 'passed', includeAttempt: true, examDate: '2024-05', month: '2024-06', attemptId: 'a2' })
    expect(passed.acquisitions[0]).toMatchObject({ acquiredMonth: '2024-06', acquiredAttemptId: 'a2' })
  })

  it('最新更新を一度だけ巻き戻し、根拠履歴の削除時に関連付けを外す', () => {
    let records = register(emptyRecords(), { qualification: qualification('q1', '資格A', []), existing: false, result: 'passed', includeAttempt: true, examDate: '2020-01', month: '2020-02', attemptId: 'a1' })
    records = register(records, { qualification: qualification('q1', '資格A', []), existing: true, result: 'passed', includeAttempt: true, examDate: '2023-01', month: '2023-02', attemptId: 'a2' })
    records = register(records, { qualification: qualification('q1', '資格A', []), existing: true, result: 'passed', includeAttempt: true, examDate: '2025-01', month: '2025-02', attemptId: 'a3' })
    expect(records.acquisitions[0].previousRenewal?.month).toBe('2023-02')
    expect(cancelLatestRenewal(records, 'q1', true).acquisitions[0].renewal?.month).toBe('2023-02')
    const deleted = deleteAttempt(records, 'a2', true)
    expect(deleted.acquisitions[0].previousRenewal).toBeUndefined()
    expect(deleted.acquisitions[0].renewal?.attemptId).toBe('a3')
  })

  it('合否訂正時に同意がなければ変更せず、同意後は保有情報も連動する', () => {
    const records = register(emptyRecords(), { qualification: qualification('q1', '資格A', []), existing: false, result: 'passed', includeAttempt: true, examDate: '2024-01', month: '2024-02', attemptId: 'a1' })
    expect(() => editAttempt(records, 'a1', 'failed', '2024-01', false)).toThrow()
    const corrected = editAttempt(records, 'a1', 'failed', '2024-01', true)
    expect(corrected.acquisitions).toHaveLength(0)
    expect(records.acquisitions).toHaveLength(1)
  })
})

describe('検索・絞り込みとJSONバックアップ', () => {
  it('資格名検索と複数タグをAND条件で適用する', () => {
    const records = {
      qualifications: [qualification('q1', '情報処理技術者', ['it', 'business-finance']), qualification('q2', '情報セキュリティ', ['it'])],
      acquisitions: [{ id: 'q1', qualificationId: 'q1', acquiredMonth: '2024-01' }, { id: 'q2', qualificationId: 'q2', acquiredMonth: '2024-02' }],
      examAttempts: [],
    }
    expect(ownedQualifications(records, '情報', ['it', 'business-finance'], 'desc').map(x => x.qualification.id)).toEqual(['q1'])
    expect(ownedQualifications(records, '', [], 'desc').map(x => x.qualification.id)).toEqual(['q2', 'q1'])
  })

  it('バックアップを往復でき、不正な追加項目や参照を拒否する', () => {
    const records = register(emptyRecords(), { qualification: qualification('q1', '資格A', ['it']), existing: false, result: 'passed', includeAttempt: true, examDate: '2024-01-02', month: '2024-02', attemptId: 'a1' })
    const backup = makeBackup(records, new Date('2024-03-01T00:00:00.000Z'))
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup)
    expect(() => parseBackup(JSON.stringify({ ...backup, unexpected: true }))).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...backup, acquisitions: [{ ...backup.acquisitions[0], acquiredAttemptId: 'missing' }] }))).toThrow()
  })
})
