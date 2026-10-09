import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import type { Firestore } from 'firebase/firestore'
import { makeBackup } from '../../src/domain/backup'
import { emptyRecords } from '../../src/domain/model'
import { Repository } from '../../src/services/repository'
import { ref } from 'vue'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-qualification-records',
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
  })
  await env.clearFirestore()
})
afterAll(async () => env.cleanup())

describe('JSONバックアップの復元', () => {
  it('正常な空バックアップをデータセット切り替えまで実行できる', async () => {
    const repo = new Repository('restore-user', env.authenticatedContext('restore-user', { email_verified: true }).firestore() as unknown as Firestore)
    await repo.initialize()
    const before = await repo.load()
    const candidate = ref(makeBackup(emptyRecords(), new Date('2026-10-10T00:00:00.000Z')))

    await repo.replaceBackup(before.head, candidate.value)
    const restored = await repo.load()

    expect(restored.head.activeDatasetId).not.toBe(before.head.activeDatasetId)
    expect(restored.head.revision).toBe(before.head.revision + 1)
    expect(restored.records).toEqual(emptyRecords())
  })
})
