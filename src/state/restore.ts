import { reactive } from 'vue'
import type { Head } from '../services/repository'

export interface PendingRestore {
  uid: string
  expected: Head
  targetDatasetId: string
}

export type RestoreState =
  | { kind: 'clear' }
  | { kind: 'pending'; operation: PendingRestore }
  | { kind: 'unavailable'; reason: 'read' | 'corrupt' | 'write' }

const key = (uid: string) => `qr:restore-pending:${uid}`
const mutationLock = (uid: string) => `qr:mutation:${uid}`
const probeKey = (uid: string) => `qr:restore-probe:${uid}`
const probeValue = 'qualification-records:restore-probe:v1'
export const restoreState = reactive({
  pending: null as PendingRestore | null,
  unavailableUid: null as string | null,
  unavailableByUid: {} as Record<string, 'read' | 'corrupt' | 'write'>,
})
let observedUid: string | null = null

function markUnavailable(uid: string, reason: 'read' | 'corrupt' | 'write') {
  restoreState.unavailableByUid[uid] = reason
  restoreState.unavailableUid = uid
}

function parse(uid: string, value: string): PendingRestore {
  const pending = JSON.parse(value) as PendingRestore
  if (
    pending.uid !== uid ||
    typeof pending.targetDatasetId !== 'string' ||
    pending.targetDatasetId.length === 0 ||
    typeof pending.expected?.activeDatasetId !== 'string' ||
    pending.expected.activeDatasetId.length === 0 ||
    !Number.isSafeInteger(pending.expected?.revision) ||
    pending.expected.revision < 0
  )
    throw new Error('復元状態の形式が正しくありません。')
  return pending
}

export function restoreStatus(uid: string): RestoreState {
  observedUid = uid
  const unavailable = restoreState.unavailableByUid[uid]
  if (unavailable) return { kind: 'unavailable', reason: unavailable }
  let value: string | null
  try {
    value = localStorage.getItem(key(uid))
  } catch {
    markUnavailable(uid, 'read')
    return { kind: 'unavailable', reason: 'read' }
  }
  if (value === null) {
    if (restoreState.pending?.uid === uid) {
      markUnavailable(uid, 'corrupt')
      return { kind: 'unavailable', reason: 'corrupt' }
    }
    restoreState.pending = null
    if (restoreState.unavailableUid === uid) restoreState.unavailableUid = null
    return { kind: 'clear' }
  }
  try {
    const pending = parse(uid, value)
    restoreState.pending = pending
    return { kind: 'pending', operation: pending }
  } catch {
    markUnavailable(uid, 'corrupt')
    return { kind: 'unavailable', reason: 'corrupt' }
  }
}

/** Explicitly rechecks storage and, after a write failure, verifies a separate probe key. */
export async function recheckRestoreState(uid: string): Promise<RestoreState> {
  try {
    return await withMutationLock(uid, () => {
      let value: string | null
      try {
        value = localStorage.getItem(key(uid))
      } catch {
        markUnavailable(uid, 'read')
        return { kind: 'unavailable', reason: 'read' }
      }

      let pending: PendingRestore | null = null
      if (value !== null) {
        try {
          pending = parse(uid, value)
        } catch {
          markUnavailable(uid, 'corrupt')
          return { kind: 'unavailable', reason: 'corrupt' }
        }
      } else if (restoreState.pending?.uid === uid) {
        markUnavailable(uid, 'read')
        return { kind: 'unavailable', reason: 'read' }
      }

      if (restoreState.unavailableByUid[uid] === 'write') {
        const probe = probeKey(uid)
        try {
          const existing = localStorage.getItem(probe)
          if (existing === null) localStorage.setItem(probe, probeValue)
          else if (existing !== probeValue) {
            markUnavailable(uid, 'write')
            return { kind: 'unavailable', reason: 'write' }
          }
          if (localStorage.getItem(probe) !== probeValue) throw new Error('probe write failed')
          localStorage.removeItem(probe)
          if (localStorage.getItem(probe) !== null) throw new Error('probe removal failed')
        } catch {
          markUnavailable(uid, 'write')
          return { kind: 'unavailable', reason: 'write' }
        }
      }

      delete restoreState.unavailableByUid[uid]
      if (restoreState.unavailableUid === uid) restoreState.unavailableUid = null
      restoreState.pending = pending
      return pending ? { kind: 'pending', operation: pending } : { kind: 'clear' }
    })
  } catch {
    markUnavailable(uid, 'read')
    return { kind: 'unavailable', reason: 'read' }
  }
}

export async function withMutationLock<T>(
  uid: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  if (!navigator.locks) throw new Error('このブラウザーでは変更操作を安全に開始できません。')
  return navigator.locks.request(mutationLock(uid), { mode: 'exclusive' }, operation)
}

export async function reserveRestore(
  uid: string,
  expected: Head,
  targetDatasetId: string,
  validate?: () => void,
) {
  return withMutationLock(uid, () => {
    validate?.()
    const current = restoreStatus(uid)
    if (current.kind === 'unavailable')
      throw new Error('端末の復元状態を確認できません。通常変更と復元を停止しています。')
    if (current.kind === 'pending')
      throw new Error('未確認の復元があります。先にサーバー状態を確認してください。')
    const pending = { uid, expected, targetDatasetId }
    try {
      localStorage.setItem(key(uid), JSON.stringify(pending))
    } catch {
      markUnavailable(uid, 'write')
      throw new Error('端末に復元状態を保存できません。復元を開始していません。')
    }
    restoreState.pending = pending
    return pending
  })
}

export async function finishRestore(uid: string, targetDatasetId: string): Promise<boolean> {
  try {
    return await withMutationLock(uid, () => {
      const current = restoreStatus(uid)
      if (current.kind !== 'pending' || current.operation.targetDatasetId !== targetDatasetId)
        return false
      try {
        localStorage.removeItem(key(uid))
      } catch {
        markUnavailable(uid, 'write')
        return false
      }
      if (
        restoreState.pending?.uid === uid &&
        restoreState.pending.targetDatasetId === targetDatasetId
      )
        restoreState.pending = null
      return true
    })
  } catch {
    markUnavailable(uid, 'write')
    return false
  }
}

export function syncRestoreStorageEvent(event: Pick<StorageEvent, 'key' | 'newValue'>) {
  if (!observedUid) return
  if (event.key === null) {
    markUnavailable(observedUid, 'read')
    return
  }
  if (event.key !== key(observedUid)) return
  if (event.newValue === null) {
    restoreState.pending = null
    return
  }
  try {
    restoreState.pending = parse(observedUid, event.newValue)
  } catch {
    markUnavailable(observedUid, 'corrupt')
  }
}

if (typeof window !== 'undefined') window.addEventListener('storage', syncRestoreStorageEvent)
