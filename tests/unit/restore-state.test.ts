import { afterEach, describe, expect, it } from 'vitest'
import { classifyRestore, type Head } from '../../src/services/repository'
import { beginRestore, finishRestore, restorePending, restoreState } from '../../src/state/restore'

const values = new Map<string, string>()
let failWrites = false
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error('storage unavailable')
      values.set(key, value)
    },
    removeItem: (key: string) => values.delete(key),
  },
})

const expected: Head = { activeDatasetId: 'old', revision: 4 }
afterEach(() => {
  values.clear()
  failWrites = false
  restoreState.pending = null
})

describe('restore uncertainty state', () => {
  it('persists the intended operation by UID and survives state reinitialization', () => {
    beginRestore('alice', expected, 'target')
    restoreState.pending = null

    expect(restorePending('alice')).toEqual({ uid: 'alice', expected, targetDatasetId: 'target' })
    expect(restorePending('bob')).toBeNull()
  })

  it('clears only the matching UID operation', () => {
    beginRestore('alice', expected, 'target')
    finishRestore('bob')
    expect(restorePending('alice')).not.toBeNull()
    finishRestore('alice')
    expect(restorePending('alice')).toBeNull()
  })

  it('does not start a restore when durable pending state cannot be written', () => {
    failWrites = true
    expect(() => beginRestore('alice', expected, 'target')).toThrow('storage unavailable')
    expect(restoreState.pending).toBeNull()
    expect(restorePending('alice')).toBeNull()
  })

  it('distinguishes confirmed switch, unchanged head, and concurrent switch', () => {
    expect(classifyRestore(expected, 'target', { activeDatasetId: 'target', revision: 5 })).toBe('switched')
    expect(classifyRestore(expected, 'target', expected)).toBe('not-switched')
    expect(classifyRestore(expected, 'target', { activeDatasetId: 'other', revision: 5 })).toBe('conflict')
  })
})
