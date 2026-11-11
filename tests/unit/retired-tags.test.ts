import { describe, expect, it } from 'vitest'
import { emptyRecords, TAGS, type Qualification, type Records } from '../../src/domain/model'
import { editQualification, ownedQualifications, register } from '../../src/domain/records'
import { makeBackup, parseBackup } from '../../src/domain/backup'
import { validateRecords } from '../../src/domain/validation'

const qualification = (fixedTagIds: string[]): Qualification => ({
  id: 'q1',
  name: '旧タグつき資格',
  gradeOrCategory: '',
  fixedTagIds,
  memo: '',
})

describe('廃止固定タグ', () => {
  it('新規付与を拒否し、既存タグの表示・検索・訂正・バックアップ復元を保つ', () => {
    const retired = TAGS.find((tag) => tag.id === 'law-public')!
    retired.selectable = false
    try {
      expect(TAGS.filter((tag) => tag.selectable).some((tag) => tag.id === retired.id)).toBe(false)
      expect(() =>
        register(emptyRecords(), {
          qualification: qualification([retired.id]),
          existing: false,
          result: 'failed',
          includeAttempt: true,
          examDate: '2024-05',
          attemptId: 'a1',
        }),
      ).toThrow('選択できない固定タグ')

      const legacy: Records = {
        qualifications: [qualification([retired.id])],
        acquisitions: [{ id: 'q1', qualificationId: 'q1', acquiredMonth: '2020-04' }],
        examAttempts: [],
      }
      expect(() => validateRecords(legacy)).not.toThrow()
      expect(
        ownedQualifications(legacy, '旧タグ', [], 'desc')[0].qualification.fixedTagIds,
      ).toEqual([retired.id])

      const edited = editQualification(legacy, { ...legacy.qualifications[0], memo: '訂正' })
      expect(edited.qualifications[0].fixedTagIds).toEqual([retired.id])
      expect(() =>
        editQualification(legacy, {
          ...legacy.qualifications[0],
          fixedTagIds: [...legacy.qualifications[0].fixedTagIds, 'it'],
        }),
      ).not.toThrow()
      expect(() =>
        editQualification(
          { ...legacy, qualifications: [{ ...legacy.qualifications[0], fixedTagIds: ['it'] }] },
          { ...legacy.qualifications[0], fixedTagIds: [retired.id, 'business-finance'] },
        ),
      ).toThrow('選択できない固定タグ')
      expect(
        editQualification(legacy, { ...legacy.qualifications[0], fixedTagIds: [] })
          .qualifications[0].fixedTagIds,
      ).toEqual([])

      const backup = makeBackup(legacy, new Date('2024-06-01T00:00:00.000Z'))
      expect(parseBackup(JSON.stringify(backup)).qualifications[0].fixedTagIds).toEqual([
        retired.id,
      ])
    } finally {
      retired.selectable = true
    }
  })
})
