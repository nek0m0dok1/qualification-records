import { afterEach, describe, expect, it, vi } from 'vitest'

const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('../../src/services/firebase', () => ({
  auth: null,
  eraseCache: vi.fn(),
  storageGet: vi.fn(() => null),
  storageSet: vi.fn(),
  storageRemove: vi.fn(),
}))
vi.mock('../../src/services/repository', () => ({
  Repository: class {
    save = save
    load = vi.fn()
  },
}))

import { changeRecords, session } from '../../src/state/session'
import {
  recheckRestoreState,
  reserveRestore,
  restoreState,
  restoreStatus,
} from '../../src/state/restore'

let failWrites = false
const values = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error('quota exceeded')
      values.set(key, value)
    },
    removeItem: (key: string) => values.delete(key),
  },
})
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    onLine: true,
    locks: { request: (_name: string, _options: unknown, callback: () => unknown) => callback() },
  },
})

afterEach(() => {
  failWrites = false
  values.clear()
  save.mockReset()
  session.user = null
  session.loaded = null
  session.writable = false
  session.busy = false
  session.fetching = false
  restoreState.pending = null
  restoreState.unavailableUid = null
  restoreState.unavailableByUid = {}
})

describe('session mutations while restore state is unavailable', () => {
  it('keeps normal changes blocked after failed persistence until explicit recovery succeeds', async () => {
    failWrites = true
    await expect(
      reserveRestore('alice', { activeDatasetId: 'active', revision: 3 }, 'target'),
    ).rejects.toThrow()
    failWrites = false
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reasons: ['write'] })

    session.user = { uid: 'alice', emailVerified: true } as never
    session.loaded = {
      head: { activeDatasetId: 'active', revision: 3 },
      records: { qualifications: [], examAttempts: [], acquisitions: [] },
      cached: false,
    }
    session.records = { qualifications: [], examAttempts: [], acquisitions: [] }
    session.writable = true

    expect(await changeRecords((records) => records)).toBe(false)
    expect(save).not.toHaveBeenCalled()
    expect(await recheckRestoreState('alice')).toEqual({ kind: 'clear' })
  })
})
