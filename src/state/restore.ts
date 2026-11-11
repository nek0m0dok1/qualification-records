import { reactive } from 'vue'
import type { Head } from '../services/repository'

export interface PendingRestore {
  uid: string
  expected: Head
  targetDatasetId: string
}

export type RestoreState =
  { kind: 'clear' } | { kind: 'pending'; operation: PendingRestore } | { kind: 'unavailable' }

const key = (uid: string) => `qr:restore-pending:${uid}`
export const restoreState = reactive({
  pending: null as PendingRestore | null,
  unavailableUid: null as string | null,
})
let observedUid: string | null = null

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
  try {
    const value = localStorage.getItem(key(uid))
    if (value === null) {
      if (restoreState.pending?.uid === uid) {
        restoreState.unavailableUid = uid
        return { kind: 'unavailable' }
      }
      restoreState.pending = null
      restoreState.unavailableUid = null
      return { kind: 'clear' }
    }
    const pending = parse(uid, value)
    restoreState.pending = pending
    restoreState.unavailableUid = null
    return { kind: 'pending', operation: pending }
  } catch {
    restoreState.unavailableUid = uid
    return { kind: 'unavailable' }
  }
}

export async function reserveRestore(uid: string, expected: Head, targetDatasetId: string) {
  if (!navigator.locks) throw new Error('このブラウザーでは復元操作を安全に開始できません。')
  return navigator.locks.request(key(uid), { mode: 'exclusive' }, () => {
    const current = restoreStatus(uid)
    if (current.kind === 'unavailable')
      throw new Error('端末の復元状態を確認できません。通常変更と復元を停止しています。')
    if (current.kind === 'pending')
      throw new Error('未確認の復元があります。先にサーバー状態を確認してください。')
    const pending = { uid, expected, targetDatasetId }
    try {
      localStorage.setItem(key(uid), JSON.stringify(pending))
    } catch {
      restoreState.unavailableUid = uid
      throw new Error('端末に復元状態を保存できません。復元を開始していません。')
    }
    restoreState.pending = pending
    restoreState.unavailableUid = null
    return pending
  })
}

export function finishRestore(uid: string, targetDatasetId: string) {
  const current = restoreStatus(uid)
  if (current.kind !== 'pending' || current.operation.targetDatasetId !== targetDatasetId)
    return false
  try {
    localStorage.removeItem(key(uid))
  } catch {
    restoreState.unavailableUid = uid
    return false
  }
  if (restoreState.pending?.uid === uid && restoreState.pending.targetDatasetId === targetDatasetId)
    restoreState.pending = null
  restoreState.unavailableUid = null
  return true
}

export function syncRestoreStorageEvent(event: Pick<StorageEvent, 'key' | 'newValue'>) {
  if (!observedUid) return
  if (event.key === null) {
    restoreState.unavailableUid = observedUid
    return
  }
  if (event.key !== key(observedUid)) return
  if (event.newValue === null) {
    restoreState.pending = null
    restoreState.unavailableUid = null
    return
  }
  try {
    restoreState.pending = parse(observedUid, event.newValue)
    restoreState.unavailableUid = null
  } catch {
    restoreState.unavailableUid = observedUid
  }
}

if (typeof window !== 'undefined') window.addEventListener('storage', syncRestoreStorageEvent)
