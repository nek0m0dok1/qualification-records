import { beforeEach, describe, expect, it, vi } from 'vitest'

const memory = vi.hoisted(() => new Map<string, Record<string, unknown>>())
vi.mock('firebase/firestore', () => ({
  collection: (parent: unknown, ...parts: string[]) => ({
    path: [
      ...((parent as { path?: string })?.path ? [(parent as { path: string }).path] : []),
      ...parts,
    ].join('/'),
  }),
  doc: (parent: unknown, ...parts: (string | { path: string })[]) => ({
    path: [
      ...((parent as { path?: string })?.path ? [(parent as { path: string }).path] : []),
      ...parts.map((part) => (typeof part === 'string' ? part : part.path)),
    ].join('/'),
  }),
  getDocFromServer: async (ref: { path: string }) => {
    const value = memory.get(ref.path)
    return { exists: () => value !== undefined, data: () => value }
  },
  getDocFromCache: vi.fn(),
  getDocsFromServer: async (ref: { path: string }) => {
    const prefix = `${ref.path}/`
    const docs = Array.from(memory.entries())
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, value]) => ({
        id: path.slice(prefix.length),
        ref: { path },
        data: () => value,
      }))
    return { docs }
  },
  getDocsFromCache: vi.fn(),
  runTransaction: async (_db: unknown, callback: (tx: unknown) => unknown) =>
    callback({
      get: async (ref: { path: string }) => {
        const value = memory.get(ref.path)
        return { exists: () => value !== undefined, data: () => value }
      },
      set: (ref: { path: string }, value: Record<string, unknown>) => memory.set(ref.path, value),
      update: (ref: { path: string }, value: Record<string, unknown>) =>
        memory.set(ref.path, { ...memory.get(ref.path), ...value }),
      delete: (ref: { path: string }) => memory.delete(ref.path),
    }),
}))
vi.mock('../../src/services/firebase', () => ({ database: () => ({}) }))

import { emptyRecords } from '../../src/domain/model'
import { Repository } from '../../src/services/repository'

const uid = 'alice'
const expected = { activeDatasetId: 'original', revision: 7 }
const rootPath = `users/${uid}`

beforeEach(() => {
  memory.clear()
  memory.set(rootPath, { ...expected })
  memory.set(`${rootPath}/datasets/original`, {
    status: 'ready',
    createdAt: '2026-01-01T00:00:00.000Z',
    counts: { qualifications: 0, acquisitions: 0, examAttempts: 0 },
  })
})

describe('restore cancellation fence', () => {
  it('invalidates the expected revision before cleanup can remove an absent-target fence', async () => {
    const repository = new Repository(uid, {} as never)
    expect(await repository.confirmReplace(expected, 'cancelled-target')).toBe('not-switched')
    expect(memory.get(rootPath)).toEqual({ ...expected, revision: 8 })

    // Cleanup removes the retired target; the stale operation still cannot prepare.
    await repository.cleanup()
    expect(memory.has(`${rootPath}/datasets/cancelled-target`)).toBe(false)
    await expect(
      repository.replace(expected, emptyRecords(), undefined, 'cancelled-target'),
    ).rejects.toThrow('既存記録が変更されています')
    expect(memory.get(rootPath)).toEqual({ ...expected, revision: 8 })
  })

  it('also invalidates a pre-existing target before confirming no switch', async () => {
    memory.set(`${rootPath}/datasets/cancelled-target`, {
      status: 'building',
      createdAt: '2026-01-01T00:00:00.000Z',
      counts: { qualifications: 0, acquisitions: 0, examAttempts: 0 },
    })
    const repository = new Repository(uid, {} as never)
    expect(await repository.confirmReplace(expected, 'cancelled-target')).toBe('not-switched')
    expect(memory.get(`${rootPath}/datasets/cancelled-target`)?.status).toBe('retired')
    expect(memory.get(rootPath)).toEqual({ ...expected, revision: 8 })
  })
})
