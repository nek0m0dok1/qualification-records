import { reactive } from 'vue'
import type { Head } from '../services/repository'

export interface PendingRestore {
  uid: string
  expected: Head
  targetDatasetId: string
}

const key = (uid: string) => `qr:restore-pending:${uid}`
export const restoreState = reactive({ pending: null as PendingRestore | null })

export function restorePending(uid: string): PendingRestore | null {
  if (restoreState.pending?.uid === uid) return restoreState.pending
  try {
    const value = localStorage.getItem(key(uid))
    if (!value) return null
    const pending = JSON.parse(value) as PendingRestore
    if (
      pending.uid !== uid ||
      typeof pending.targetDatasetId !== 'string' ||
      typeof pending.expected?.activeDatasetId !== 'string' ||
      typeof pending.expected?.revision !== 'number'
    ) return null
    restoreState.pending = pending
    return pending
  } catch {
    return null
  }
}

export function beginRestore(uid: string, expected: Head, targetDatasetId: string) {
  const pending = { uid, expected, targetDatasetId }
  localStorage.setItem(key(uid), JSON.stringify(pending))
  restoreState.pending = pending
}

export function finishRestore(uid: string) {
  localStorage.removeItem(key(uid))
  if (restoreState.pending?.uid === uid) restoreState.pending = null
}
