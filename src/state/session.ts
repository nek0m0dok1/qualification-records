import { reactive } from 'vue'
import { onAuthStateChanged, signOut, reload, getIdToken, type User } from 'firebase/auth'
import { auth, eraseCache, storageGet, storageSet, storageRemove } from '../services/firebase'
import { Repository, type Loaded } from '../services/repository'
import { emptyRecords, type Records } from '../domain/model'
import { restoreStatus, withMutationLock } from './restore'
export const session = reactive({
  user: null as User | null,
  ready: false,
  cacheDeletionRequired: storageGet('qr:cleanup-required') === 'true',
  records: emptyRecords(),
  loaded: null as Loaded | null,
  busy: false,
  fetching: false,
  writable: false,
  cacheOnly: false,
  message: '',
  error: '',
  lastFetched: '',
  cleanupWarning: '',
  initialized: false,
})
export const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value))
let epoch = 0
const fetches = new Map<string, Promise<void>>()
export function errorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code?.startsWith('auth/'))
    return (
      (
        {
          'auth/invalid-credential': 'メールアドレスまたはパスワードを確認してください。',
          'auth/email-already-in-use': 'このメールアドレスは登録済みです。',
          'auth/weak-password': 'パスワードは6文字以上にしてください。',
          'auth/too-many-requests': 'しばらく待ってお試しください。',
          'auth/network-request-failed': '接続を確認してください。',
        } as Record<string, string>
      )[code] ?? '認証に失敗しました。入力内容と通信状態を確認してください。'
    )
  if (code === 'permission-denied')
    return 'アクセスできません。メール確認とログイン状態を確認してください。'
  if (code === 'failed-precondition')
    return '端末保存を利用できません。他のタブを閉じて再試行してください。'
  if (code === 'unavailable') return 'サーバーに接続できません。'
  return error instanceof Error ? error.message : '操作に失敗しました。'
}
function resetView() {
  session.records = emptyRecords()
  session.loaded = null
  session.writable = false
  session.initialized = false
  session.lastFetched = ''
  session.message = ''
  session.error = ''
  session.cleanupWarning = ''
  session.cacheOnly = false
}
export function refresh(): Promise<void> {
  const user = session.user
  if (!user?.emailVerified || session.busy) return Promise.resolve()
  const token = epoch,
    key = `${epoch}:${user.uid}`,
    repo = new Repository(user.uid)
  const pending = fetches.get(key)
  if (pending) return pending
  session.fetching = true
  const current = (async () => {
    try {
      if (!navigator.onLine) throw new Error('offline')
      if (!session.initialized) {
        await repo.initialize()
        if (token !== epoch) return
        session.initialized = true
      }
      const loaded = await repo.load()
      if (token !== epoch) return
      const restore = restoreStatus(user.uid)
      session.loaded = loaded
      session.records = loaded.records
      session.writable = restore.kind === 'clear'
      session.cacheOnly = false
      session.error =
        restore.kind === 'unavailable'
          ? '端末の復元状態を確認できないため、通常変更と復元を停止しています。ブラウザーの保存領域を利用可能にして再読み込みしてください。'
          : ''
      session.lastFetched = new Date().toISOString()
      storageSet(`qr:fetched:${user.uid}`, session.lastFetched)
      void repo.cleanup().catch(() => {
        if (token === epoch)
          session.cleanupWarning = '不要な保存領域の削除は次回オンライン時に再試行します。'
      })
    } catch {
      if (token !== epoch) return
      session.writable = false
      session.cacheOnly = true
      try {
        const loaded = await repo.load(true)
        if (token !== epoch) return
        session.loaded = loaded
        session.records = loaded.records
        session.lastFetched = storageGet(`qr:fetched:${user.uid}`) ?? ''
        session.error = '通信できないため、保存済みの記録の閲覧・検索のみ利用できます。'
      } catch (cacheError) {
        if (token !== epoch) return
        session.error = session.loaded
          ? '通信できないため、表示中の記録の閲覧・検索のみ利用できます。'
          : `${errorMessage(cacheError)} 接続状態と端末保存の設定を確認してください。`
      }
    } finally {
      if (token === epoch) session.fetching = false
    }
  })().finally(() => {
    fetches.delete(key)
  })
  fetches.set(key, current)
  return current
}
export async function changeRecords(transform: (records: Records) => Records): Promise<boolean> {
  const uid = session.user?.uid
  if (!uid) {
    session.error = '今は変更できません。オンラインで更新してください。'
    return false
  }
  try {
    return await withMutationLock(uid, async () => {
      if (
        session.user?.uid !== uid ||
        restoreStatus(uid).kind !== 'clear' ||
        !session.loaded ||
        !session.writable ||
        !navigator.onLine ||
        session.busy ||
        session.fetching
      ) {
        session.error = '今は変更できません。オンラインで更新してください。'
        return false
      }
      const token = epoch
      const loaded = plain(session.loaded)
      const next = transform(plain(session.records))
      session.busy = true
      session.error = ''
      session.message = ''
      let saved = false
      try {
        await new Repository(uid).save(loaded, next)
        if (token !== epoch) return false
        session.message = 'サーバーへの保存が完了しました。'
        saved = true
      } catch (error) {
        if (token === epoch) session.error = errorMessage(error)
      } finally {
        if (token === epoch) session.busy = false
      }
      if (saved) await refresh()
      return saved
    })
  } catch (error) {
    session.error = errorMessage(error)
    return false
  }
}
export async function logout(): Promise<void> {
  if (session.busy) return
  const uid = session.user?.uid
  epoch++
  resetView()
  session.busy = true
  try {
    await signOut(auth!)
    await eraseCache()
    if (uid) storageRemove(`qr:fetched:${uid}`)
    storageRemove('qr:cleanup-required')
    location.assign('/login')
  } catch (error) {
    session.cacheDeletionRequired = true
    storageSet('qr:cleanup-required', 'true')
    session.error = `端末データの削除が未完了です。他のタブを閉じて削除を再試行してください。${errorMessage(error)}`
    session.busy = false
  }
}
export async function retryCacheDeletion() {
  try {
    await eraseCache()
    storageRemove('qr:cleanup-required')
    session.cacheDeletionRequired = false
    location.assign('/login')
  } catch {
    session.error = '他のタブを閉じてください。端末データの削除はまだ完了していません。'
  }
}
export async function checkVerification() {
  if (!auth?.currentUser) return
  await reload(auth.currentUser)
  await getIdToken(auth.currentUser, true)
  session.user = auth.currentUser
  if (session.user.emailVerified) await refresh()
}
export function startSession() {
  if (!auth) {
    session.ready = true
    return
  }
  onAuthStateChanged(auth, async (user) => {
    if (user?.uid !== session.user?.uid) {
      epoch++
      resetView()
    }
    session.user = user
    session.ready = true
    if (user?.emailVerified && !session.cacheDeletionRequired) await refresh()
  })
  window.addEventListener('offline', () => {
    session.writable = false
    session.cacheOnly = true
  })
  window.addEventListener('online', () => void refresh())
  window.addEventListener('storage', (event) => {
    const uid = session.user?.uid
    if (!uid || (event.key !== null && event.key !== `qr:restore-pending:${uid}`)) return
    const state = restoreStatus(uid)
    if (state.kind !== 'clear') {
      session.writable = false
      session.error =
        state.kind === 'unavailable'
          ? '端末の復元状態を確認できないため、通常変更と復元を停止しています。保存領域を確認してください。'
          : '別のタブで復元を開始しました。先にサーバー状態を確認してください。'
    } else {
      void refresh()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh()
  })
}
