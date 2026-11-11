import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  finishRestore,
  reserveRestore,
  recheckRestoreState,
  restoreState,
  restoreStatus,
  syncRestoreStorageEvent,
  withMutationLock,
} from '../../src/state/restore'

const values = new Map<string, string>()
let failReads = false
let failWrites = false
let failRemoves = false
const lockQueue: (() => void)[] = []
let locked = false
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => {
      if (failReads) throw new Error('storage unavailable')
      return values.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error('storage unavailable')
      values.set(key, value)
    },
    removeItem: (key: string) => {
      if (failRemoves) throw new Error('storage unavailable')
      values.delete(key)
    },
  },
})
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    locks: {
      request: async (_name: string, _options: unknown, callback: () => unknown) => {
        if (locked) await new Promise<void>((resolve) => lockQueue.push(resolve))
        locked = true
        try {
          return await callback()
        } finally {
          locked = false
          lockQueue.shift()?.()
        }
      },
    },
  },
})

const expected = { activeDatasetId: 'old', revision: 4 }
const key = 'qr:restore-pending:alice'
afterEach(() => {
  values.clear()
  failReads = false
  failWrites = false
  failRemoves = false
  restoreState.pending = null
  restoreState.unavailableUid = null
  restoreState.unavailableByUid = {}
  locked = false
  lockQueue.length = 0
  vi.restoreAllMocks()
})

describe('restore uncertainty state', () => {
  it('persists one UID operation and re-reads it instead of trusting stale memory', async () => {
    await reserveRestore('alice', expected, 'target')
    restoreState.pending = null

    expect(restoreStatus('alice')).toEqual({
      kind: 'pending',
      operation: { uid: 'alice', expected, targetDatasetId: 'target' },
    })
    expect(restoreStatus('bob')).toEqual({ kind: 'clear' })
  })

  it('fails closed when storage cannot be read or contains a malformed descriptor', () => {
    values.set(key, JSON.stringify({ uid: 'alice', expected, targetDatasetId: 'target' }))
    failReads = true
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'read' })
    failReads = false
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'read' })
    restoreState.unavailableByUid = {}
    restoreState.unavailableUid = null
    values.set(key, '{broken')
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'corrupt' })
    restoreState.unavailableByUid = {}
    restoreState.unavailableUid = null
    values.set(key, '')
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'corrupt' })
  })

  it('does not start when durable state cannot be saved', async () => {
    failWrites = true
    await expect(reserveRestore('alice', expected, 'target')).rejects.toThrow('保存できません')
    expect(values.has(key)).toBe(false)
    expect(restoreState.unavailableUid).toBe('alice')
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'write' })
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'write' })
    failWrites = false
    expect(await recheckRestoreState('alice')).toEqual({ kind: 'clear' })
    expect(restoreStatus('alice')).toEqual({ kind: 'clear' })
  })

  it('does not clear a write failure or alter an existing pending record during explicit recovery', async () => {
    const descriptor = { uid: 'alice', expected, targetDatasetId: 'existing-target' }
    values.set(key, JSON.stringify(descriptor))
    failWrites = true
    restoreState.unavailableByUid.alice = 'write'
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'write' })
    expect(await recheckRestoreState('alice')).toEqual({ kind: 'unavailable', reason: 'write' })
    expect(values.get(key)).toBe(JSON.stringify(descriptor))
    failWrites = false
    expect(await recheckRestoreState('alice')).toEqual({ kind: 'pending', operation: descriptor })
    expect(values.get(key)).toBe(JSON.stringify(descriptor))
  })

  it('keeps read and corrupt failures latched until explicit recheck', async () => {
    failReads = true
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'read' })
    failReads = false
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'read' })
    expect(await recheckRestoreState('alice')).toEqual({ kind: 'clear' })
    values.set(key, '{broken')
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'corrupt' })
    values.delete(key)
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'corrupt' })
    expect(await recheckRestoreState('alice')).toEqual({ kind: 'clear' })
  })

  it('serializes same-UID starts across tabs and refuses the second operation', async () => {
    const results = await Promise.allSettled([
      reserveRestore('alice', expected, 'first'),
      reserveRestore('alice', expected, 'second'),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(JSON.parse(values.get(key)!).targetDatasetId).toBe('first')
  })

  it('only removes the operation whose target ID matches', async () => {
    await reserveRestore('alice', expected, 'old-target')
    values.set(key, JSON.stringify({ uid: 'alice', expected, targetDatasetId: 'new-target' }))
    expect(await finishRestore('alice', 'old-target')).toBe(false)
    expect(JSON.parse(values.get(key)!).targetDatasetId).toBe('new-target')
  })

  it('synchronizes another tab’s pending operation from the storage event', async () => {
    await reserveRestore('alice', expected, 'first')
    const other = { uid: 'alice', expected, targetDatasetId: 'second' }
    values.set(key, JSON.stringify(other))
    syncRestoreStorageEvent({ key, newValue: JSON.stringify(other) })
    expect(restoreState.pending).toEqual(other)
    expect(await finishRestore('alice', 'first')).toBe(false)
  })

  it('keeps the operation when its durable descriptor cannot be removed', async () => {
    await reserveRestore('alice', expected, 'target')
    failRemoves = true
    expect(await finishRestore('alice', 'target')).toBe(false)
    expect(restoreStatus('alice')).toEqual({ kind: 'unavailable', reason: 'write' })
    expect(await recheckRestoreState('alice')).toEqual({ kind: 'unavailable', reason: 'write' })
    failRemoves = false
    expect(await recheckRestoreState('alice')).toEqual({
      kind: 'pending',
      operation: { uid: 'alice', expected, targetDatasetId: 'target' },
    })
  })

  it('serializes two stale finishes around a newer reservation', async () => {
    await reserveRestore('alice', expected, 'first')
    let release!: () => void
    const held = withMutationLock(
      'alice',
      () => new Promise<void>((resolve) => (release = resolve)),
    )
    await Promise.resolve()
    const finishOne = finishRestore('alice', 'first')
    const nextReservation = reserveRestore('alice', expected, 'second')
    const finishTwo = finishRestore('alice', 'first')
    release()

    await held
    expect(await finishOne).toBe(true)
    await nextReservation
    expect(await finishTwo).toBe(false)
    expect(JSON.parse(values.get(key)!).targetDatasetId).toBe('second')
  })
})
