import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import type { Firestore } from 'firebase/firestore'

const injected = vi.hoisted(() => ({
  failBeforeTransaction: false,
  failAfterTransaction: false,
  failNextServerRead: false,
  failNextServerList: false,
  transactionCount: 0,
  failAfterTransactionAt: null as number | null,
  beforeNextTransaction: null as (() => Promise<void>) | null,
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return {
    ...actual,
    runTransaction: async (...args: Parameters<typeof actual.runTransaction>) => {
      if (injected.beforeNextTransaction) {
        const before = injected.beforeNextTransaction
        injected.beforeNextTransaction = null
        await before()
      }
      if (injected.failBeforeTransaction) {
        injected.failBeforeTransaction = false
        throw new Error('injected transaction failure before commit')
      }
      const result = await actual.runTransaction(...args)
      injected.transactionCount += 1
      if (
        injected.failAfterTransaction ||
        injected.transactionCount === injected.failAfterTransactionAt
      ) {
        injected.failAfterTransaction = false
        injected.failAfterTransactionAt = null
        throw new Error('injected lost transaction response after commit')
      }
      return result
    },
    getDocFromServer: async (...args: Parameters<typeof actual.getDocFromServer>) => {
      if (injected.failNextServerRead) {
        injected.failNextServerRead = false
        throw new Error('injected server confirmation failure')
      }
      return actual.getDocFromServer(...args)
    },
    getDocsFromServer: async (...args: Parameters<typeof actual.getDocsFromServer>) => {
      if (injected.failNextServerList) {
        injected.failNextServerList = false
        throw new Error('injected verification read failure')
      }
      return actual.getDocsFromServer(...args)
    },
  }
})

import { collection, doc, getDoc, getDocs, runTransaction } from 'firebase/firestore'
import { makeBackup, type Backup } from '../../src/domain/backup'
import type { Records } from '../../src/domain/model'
import { Repository, type Head } from '../../src/services/repository'

let env: RulesTestEnvironment
let testDb: Firestore
const uid = 'restore-user'
const projectId = 'demo-qualification-records-restore'

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? 8080),
      rules: await readFile('firestore.rules', 'utf8'),
    },
  })
})

beforeEach(async () => {
  injected.failBeforeTransaction = false
  injected.failAfterTransaction = false
  injected.failNextServerRead = false
  injected.failNextServerList = false
  injected.transactionCount = 0
  injected.failAfterTransactionAt = null
  injected.beforeNextTransaction = null
  await env.clearFirestore()
})

afterAll(async () => env.cleanup())

function repository() {
  testDb = env
    .authenticatedContext(uid, { email_verified: true })
    .firestore() as unknown as Firestore
  return new Repository(uid, testDb)
}

function records(prefix: string, count: number): Records {
  const qualifications = Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-q${i}`,
    name: `${prefix} qualification ${i}`,
    gradeOrCategory: `grade ${i}`,
    fixedTagIds: i === 0 ? ['it'] : [],
    memo: `memo ${i}`,
  }))
  const examAttempts = qualifications.map((q, i) => ({
    id: `${prefix}-e${i}`,
    qualificationId: q.id,
    examDate: `2026-0${(i % 9) + 1}-15`,
    result: 'passed' as const,
  }))
  const acquisitions = qualifications.slice(0, 1).map((q, i) => ({
    id: q.id,
    qualificationId: q.id,
    acquiredMonth: '2026-01',
    acquiredAttemptId: examAttempts[i].id,
    renewal: { month: '2026-03', attemptId: `${prefix}-renewal` },
    previousRenewal: { month: '2026-02' },
  }))
  if (acquisitions[0]) {
    examAttempts.push({
      id: `${prefix}-renewal`,
      qualificationId: qualifications[0].id,
      examDate: '2026-03-15',
      result: 'passed',
    })
  }
  return { qualifications, acquisitions, examAttempts }
}

function progressCount(data: Records) {
  return (
    Math.ceil(data.qualifications.length / 4) +
    Math.ceil(data.acquisitions.length / 4) +
    Math.ceil(data.examAttempts.length / 4) +
    2
  )
}

async function rawHead() {
  const snapshot = await getDoc(doc(testDb, 'users', uid))
  return snapshot.data() as Head
}

async function rawRecords(datasetId: string): Promise<Records> {
  const result = { qualifications: [], acquisitions: [], examAttempts: [] } as Records
  for (const kind of ['qualifications', 'acquisitions', 'examAttempts'] as const) {
    const rows = await getDocs(collection(testDb, 'users', uid, 'datasets', datasetId, kind))
    result[kind] = rows.docs.map((row) => ({ ...row.data(), id: row.id })) as never
  }
  return result
}

async function rawDataset(datasetId: string) {
  const snapshot = await getDoc(doc(testDb, 'users', uid, 'datasets', datasetId))
  return snapshot.data()
}

describe('JSON backup restore safety on Firestore Emulator', () => {
  it('restores records across multiple batches with reference and renewal metadata intact', async () => {
    const repo = repository()
    await repo.initialize()
    const old = await repo.load()
    const backup = makeBackup(records('restored', 9), new Date('2026-10-10T00:00:00.000Z'))

    await repo.replaceBackup(old.head, backup)

    const active = await repo.load()
    expect(active.head.activeDatasetId).not.toBe(old.head.activeDatasetId)
    expect(active.head.revision).toBe(old.head.revision + 1)
    expect(active.records).toEqual(records('restored', 9))
    expect(await rawRecords(active.head.activeDatasetId)).toEqual(records('restored', 9))
    expect((await rawDataset(active.head.activeDatasetId))?.status).toBe('ready')
    expect((await rawDataset(old.head.activeDatasetId))?.status).toBe('retired')
    expect(await rawRecords(old.head.activeDatasetId)).toEqual({
      qualifications: [],
      acquisitions: [],
      examAttempts: [],
    })
  })

  it('rejects invalid data before staging and leaves the active dataset unchanged', async () => {
    const repo = repository()
    await repo.initialize()
    const initial = await repo.load()
    const invalid = makeBackup(records('invalid', 1)) as Backup
    invalid.acquisitions[0].acquiredAttemptId = 'missing-attempt'

    await expect(repo.replaceBackup(initial.head, invalid)).rejects.toThrow()

    expect(await rawHead()).toEqual(initial.head)
    expect(await rawRecords(initial.head.activeDatasetId)).toEqual(initial.records)
    expect((await getDocs(collection(testDb, 'users', uid, 'datasets'))).size).toBe(1)
  })

  it('keeps the current dataset when a preparation batch fails', async () => {
    const repo = repository()
    await repo.initialize()
    const initial = await repo.load()
    const stable = records('stable-prepare', 1)
    await repo.save(initial, stable)
    const before = await repo.load()
    const candidate = records('prepare-failure', 5)
    let progressCalls = 0

    await expect(
      repo.replaceBackup(before.head, makeBackup(candidate), () => {
        progressCalls += 1
        if (progressCalls === 1) injected.failBeforeTransaction = true
      }),
    ).rejects.toThrow('injected transaction failure before commit')

    expect(await rawHead()).toEqual(before.head)
    expect(await rawRecords(before.head.activeDatasetId)).toEqual(stable)
    expect((await getDocs(collection(testDb, 'users', uid, 'datasets'))).size).toBe(2)
  })

  it('keeps the current dataset when server verification fails after staging', async () => {
    const repo = repository()
    await repo.initialize()
    const initial = await repo.load()
    const stable = records('stable-verify', 1)
    await repo.save(initial, stable)
    const before = await repo.load()
    const candidate = records('verify-failure', 5)
    let progressCalls = 0

    await expect(
      repo.replaceBackup(before.head, makeBackup(candidate), () => {
        progressCalls += 1
        if (progressCalls === progressCount(candidate) - 1) injected.failNextServerList = true
      }),
    ).rejects.toThrow('injected verification read failure')

    expect(await rawHead()).toEqual(before.head)
    expect(await rawRecords(before.head.activeDatasetId)).toEqual(stable)
    expect((await getDocs(collection(testDb, 'users', uid, 'datasets'))).size).toBe(2)
  })

  it('does not switch datasets when a second device changes the revision during preparation', async () => {
    const repo = repository()
    await repo.initialize()
    const initial = await repo.load()
    const activeRecords = records('original', 1)
    await repo.save(initial, activeRecords)
    const beforeRestore = await repo.load()
    const competingId = 'other-device-dataset'
    let changed = false
    let competingWrite: Promise<void> | undefined
    let progressCalls = 0
    const candidate = records('candidate', 9)

    await expect(
      repo.replaceBackup(beforeRestore.head, makeBackup(candidate), () => {
        progressCalls += 1
        if (changed || progressCalls !== 1) return
        changed = true
        competingWrite = runTransaction(testDb, async (tx) => {
          tx.set(doc(testDb, 'users', uid, 'datasets', competingId), {
            status: 'ready',
            createdAt: new Date().toISOString(),
            counts: { qualifications: 1, acquisitions: 0, examAttempts: 0 },
          })
          tx.set(
            doc(testDb, 'users', uid, 'datasets', competingId, 'qualifications', 'competitor-q'),
            {
              name: 'competitor',
              gradeOrCategory: '',
              fixedTagIds: [],
              memo: '',
            },
          )
          tx.update(doc(testDb, 'users', uid), {
            activeDatasetId: competingId,
            revision: beforeRestore.head.revision + 1,
          })
        })
        injected.beforeNextTransaction = async () => {
          await competingWrite
        }
      }),
    ).rejects.toThrow()
    await competingWrite

    expect(changed).toBe(true)
    expect(await rawHead()).toEqual({
      activeDatasetId: competingId,
      revision: beforeRestore.head.revision + 1,
    })
    expect(await rawRecords(beforeRestore.head.activeDatasetId)).toEqual(activeRecords)
    expect(await rawRecords(competingId)).toEqual({
      qualifications: [
        { id: 'competitor-q', name: 'competitor', gradeOrCategory: '', fixedTagIds: [], memo: '' },
      ],
      acquisitions: [],
      examAttempts: [],
    })
  })

  it('does not overwrite the active dataset when a second device advances only the revision', async () => {
    const repo = repository()
    await repo.initialize()
    const initial = await repo.load()
    const stable = records('revision-race', 2)
    await repo.save(initial, stable)
    const beforeRestore = await repo.load()
    const candidate = records('revision-candidate', 9)
    let changed = false
    let competingWrite: Promise<void> | undefined

    await expect(
      repo.replaceBackup(beforeRestore.head, makeBackup(candidate), () => {
        if (changed) return
        changed = true
        competingWrite = runTransaction(testDb, async (tx) => {
          tx.update(doc(testDb, 'users', uid), { revision: beforeRestore.head.revision + 1 })
        })
        injected.beforeNextTransaction = async () => {
          await competingWrite
        }
      }),
    ).rejects.toThrow()
    await competingWrite

    expect(await rawHead()).toEqual({
      activeDatasetId: beforeRestore.head.activeDatasetId,
      revision: beforeRestore.head.revision + 1,
    })
    expect(await rawRecords(beforeRestore.head.activeDatasetId)).toEqual(stable)
  })

  it('distinguishes a rejected switch from a committed switch with a lost response', async () => {
    const repo = repository()
    await repo.initialize()
    const initial = await repo.load()
    const stable = records('stable', 1)
    await repo.save(initial, stable)
    const before = await repo.load()

    const rejected = records('rejected', 2)
    let rejectProgress = 0
    await expect(
      repo.replaceBackup(before.head, makeBackup(rejected), () => {
        rejectProgress += 1
        if (rejectProgress === progressCount(rejected)) injected.failBeforeTransaction = true
      }),
    ).rejects.toThrow('injected transaction failure before commit')
    expect(await rawHead()).toEqual(before.head)
    expect(await rawRecords(before.head.activeDatasetId)).toEqual(stable)

    const restored = records('committed', 7)
    let commitProgress = 0
    await repo.replaceBackup(before.head, makeBackup(restored), () => {
      commitProgress += 1
      if (commitProgress === progressCount(restored)) injected.failAfterTransaction = true
    })
    expect(await rawHead()).toEqual({
      activeDatasetId: (await repo.load()).head.activeDatasetId,
      revision: before.head.revision + 1,
    })
    expect((await repo.load()).records).toEqual(restored)
  })

  it('retains the old dataset when the switch commits but server confirmation also fails', async () => {
    const repo = repository()
    await repo.initialize()
    const initial = await repo.load()
    const stable = records('stable', 1)
    await repo.save(initial, stable)
    const before = await repo.load()
    const restored = records('uncertain', 6)
    let confirmProgress = 0

    await expect(
      repo.replaceBackup(before.head, makeBackup(restored), () => {
        confirmProgress += 1
        if (confirmProgress === progressCount(restored)) {
          injected.failAfterTransaction = true
          injected.failNextServerRead = true
        }
      }),
    ).rejects.toThrow(
      '復元の切り替え結果を確認できません。オンラインに戻って更新し、内容を確認してください。再実行はまだ行わないでください。',
    )

    // The commit is real even though both the transaction response and follow-up read were lost.
    const committedHead = await rawHead()
    expect(committedHead.activeDatasetId).not.toBe(before.head.activeDatasetId)
    expect(committedHead.revision).toBe(before.head.revision + 1)
    expect(await rawRecords(committedHead.activeDatasetId)).toEqual(restored)
    expect(await rawRecords(before.head.activeDatasetId)).toEqual(stable)
    expect(confirmProgress).toBe(progressCount(restored))
  })

  it('resumes partial cleanup and preserves the active dataset', async () => {
    const repo = repository()
    await repo.initialize()
    const initial = await repo.load()
    await repo.save(initial, records('old', 2))
    const beforeRestore = await repo.load()
    const activeRecords = records('active', 2)
    await repo.replaceBackup(beforeRestore.head, makeBackup(activeRecords))
    const active = await repo.load()
    const retiredId = beforeRestore.head.activeDatasetId

    injected.transactionCount = 0
    injected.failAfterTransactionAt = 2
    await expect(repo.cleanup()).rejects.toThrow('injected lost transaction response after commit')

    expect(await rawHead()).toEqual(active.head)
    expect(await rawRecords(active.head.activeDatasetId)).toEqual(activeRecords)
    expect((await rawRecords(retiredId)).acquisitions).toEqual([])
    expect((await rawRecords(retiredId)).qualifications).toHaveLength(2)

    await repo.cleanup()

    expect(await rawHead()).toEqual(active.head)
    expect(await rawRecords(active.head.activeDatasetId)).toEqual(activeRecords)
    expect(await rawDataset(retiredId)).toBeUndefined()
    expect(await rawRecords(retiredId)).toEqual({
      qualifications: [],
      acquisitions: [],
      examAttempts: [],
    })
  })
})
