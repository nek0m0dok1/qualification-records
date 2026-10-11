import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
  terminate,
  clearIndexedDbPersistence,
  type Firestore,
} from 'firebase/firestore'
export const emulatorMode = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true'
export const configured =
  emulatorMode ||
  Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID,
  )
const config = emulatorMode
  ? {
      apiKey: 'demo-api-key',
      authDomain: 'demo-qualification-records.firebaseapp.com',
      projectId: 'demo-qualification-records',
      appId: 'demo-app-id',
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }
export function storageGet(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
export function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Storage may be disabled. */
  }
}
export function storageRemove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* No metadata persisted. */
  }
}
const app = configured ? initializeApp(config) : null
export const auth = app ? getAuth(app) : null
if (auth && emulatorMode)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
export const rememberDevice = storageGet('qr:remember') === 'true'
let db: Firestore | null = null
export function database(): Firestore {
  if (!app) throw new Error('Firebase設定がありません。.envを設定して再起動してください。')
  if (!db) {
    db = initializeFirestore(app, {
      localCache: rememberDevice
        ? persistentLocalCache({
            tabManager: persistentSingleTabManager({ forceOwnership: false }),
          })
        : memoryLocalCache(),
    })
    if (emulatorMode) connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  return db
}
export async function eraseCache(): Promise<void> {
  if (!app) return
  const instance = database()
  await terminate(instance)
  await clearIndexedDbPersistence(instance)
}
