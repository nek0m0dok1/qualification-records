import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-qualification-records', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } })
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await db.doc('users/owner').set({ activeDatasetId: 'active', revision: 0 })
    await db.doc('users/owner/datasets/active').set({ status: 'ready', createdAt: '2026-01-01T00:00:00.000Z', counts: { qualifications: 0, acquisitions: 0, examAttempts: 0 } })
  })
})
afterAll(async () => env.cleanup())

describe('Firestore Security Rules', () => {
  it('permits a verified owner write and denies access to another account', async () => {
    const owner = env.authenticatedContext('owner', { email_verified: true }).firestore()
    const batch = owner.batch()
    batch.update(owner.doc('users/owner'), { revision: 1 })
    batch.set(owner.doc('users/owner/datasets/active/qualifications/q1'), { name: '資格A', gradeOrCategory: '', fixedTagIds: [], memo: '' })
    await assertSucceeds(batch.commit())
    await assertSucceeds(owner.doc('users/owner/datasets/active/qualifications/q1').get())

    const other = env.authenticatedContext('other', { email_verified: true }).firestore()
    await assertFails(other.doc('users/owner/datasets/active/qualifications/q1').get())
    await assertFails(other.doc('users/owner').get())
  })

  it('denies an unverified account', async () => {
    const unverified = env.authenticatedContext('owner', { email_verified: false }).firestore()
    await assertFails(unverified.doc('users/owner').get())
  })

  it('denies unauthenticated reads and writes', async () => {
    const guest = env.unauthenticatedContext().firestore()
    await assertFails(guest.doc('users/owner').get())
    await assertFails(guest.doc('users/owner').update({ revision: 2 }))
  })
})
