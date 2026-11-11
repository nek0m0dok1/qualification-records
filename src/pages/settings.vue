<script setup lang="ts">
import { ref, computed } from 'vue'
import { session, refresh, plain, errorMessage, logout } from '../state/session'
import { ask } from '../state/ui'
import { rememberDevice, storageSet } from '../services/firebase'
import { makeBackup, parseBackup, type Backup } from '../domain/backup'
import { Repository } from '../services/repository'
import {
  finishRestore,
  recheckRestoreState,
  reserveRestore,
  restoreState,
  restoreStatus,
} from '../state/restore'
const candidate = ref<Backup | null>(null),
  progress = ref('')
const restoreStateForUser = computed(() => {
  void restoreState.pending
  void restoreState.unavailableUid
  return session.user ? restoreStatus(session.user.uid) : { kind: 'clear' as const }
})
const pending = computed(() =>
  restoreStateForUser.value.kind === 'pending' ? restoreStateForUser.value.operation : null,
)
const restoreUnavailable = computed(() => restoreStateForUser.value.kind === 'unavailable')
const disabled = computed(
  () =>
    session.busy ||
    session.fetching ||
    !session.writable ||
    !!pending.value ||
    restoreUnavailable.value,
)
function restoreStartIssue(
  uid: string,
  expected: { activeDatasetId: string; revision: number },
  backup: Backup,
  targetDatasetId?: string,
) {
  if (session.user?.uid !== uid) return 'ログイン状態が変わりました。内容を再確認してください。'
  if (
    !session.loaded ||
    session.loaded.head.activeDatasetId !== expected.activeDatasetId ||
    session.loaded.head.revision !== expected.revision
  )
    return '保存状態が変わりました。最新の記録を読み込んでから再確認してください。'
  if (candidate.value !== backup)
    return '選択中のバックアップが変わりました。内容を再確認してください。'
  if (session.busy || session.fetching || !session.writable || !navigator.onLine)
    return '現在の状態では復元を開始できません。オンラインで更新してください。'
  const state = restoreStatus(uid)
  if (targetDatasetId) {
    if (state.kind !== 'pending' || state.operation.targetDatasetId !== targetDatasetId)
      return '復元の保留状態が変わりました。サーバー状態を確認してください。'
  } else if (state.kind !== 'clear') {
    return state.kind === 'pending'
      ? '未確認の復元があります。先にサーバー状態を確認してください。'
      : '端末の復元状態を確認できません。通常変更と復元を停止しています。'
  }
  return ''
}
async function exportJson() {
  if (!session.user || disabled.value) return
  session.busy = true
  session.error = ''
  try {
    const data = await new Repository(session.user.uid).load()
    const blob = new Blob([JSON.stringify(makeBackup(data.records), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob),
      link = document.createElement('a')
    link.href = url
    link.download = `qualifications-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    session.message = 'バックアップファイルのダウンロードを開始しました。保存先を確認してください。'
  } catch (err) {
    session.error = errorMessage(err)
  } finally {
    session.busy = false
  }
}
async function selectFile(event: Event) {
  candidate.value = null
  session.error = ''
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('復元ファイルは10MB以内にしてください。')
    candidate.value = parseBackup(await file.text())
  } catch (err) {
    session.error = errorMessage(err)
  }
  input.value = ''
}
async function restore() {
  const user = session.user
  const loaded = session.loaded
  const backup = candidate.value
  if (!user || !loaded || !backup || disabled.value) return
  const uid = user.uid
  const expected = plain(loaded.head)
  const initialIssue = restoreStartIssue(uid, expected, backup)
  if (initialIssue) {
    session.error = initialIssue
    return
  }
  if (
    !(await ask(
      `現在の全記録を、資格${backup.qualifications.length}件・受験履歴${backup.examAttempts.length}件のバックアップへ置き換えます。既存記録は削除されます。必要なら先にJSONを書き出してください。`,
    ))
  )
    return
  const afterConsentIssue = restoreStartIssue(uid, expected, backup)
  if (afterConsentIssue) {
    session.error = afterConsentIssue
    return
  }
  session.error = ''
  session.message = ''
  const targetDatasetId = crypto.randomUUID()
  let reserved = false
  let ownsBusy = false
  try {
    await reserveRestore(uid, expected, targetDatasetId, () => {
      const issue = restoreStartIssue(uid, expected, backup)
      if (issue) throw new Error(issue)
    })
    reserved = true
    const executionIssue = restoreStartIssue(uid, expected, backup, targetDatasetId)
    if (executionIssue) throw new Error(executionIssue)
    session.busy = true
    ownsBusy = true
    await new Repository(uid).replaceBackup(
      expected,
      backup,
      (text) => {
        progress.value = text
      },
      targetDatasetId,
    )
    if (!(await finishRestore(uid, targetDatasetId))) {
      session.error =
        '復元結果はサーバーで確認できましたが、該当する端末の保留状態を解除できません。状態確認まで操作を停止しています。'
      return
    }
    session.message = '復元の切り替えが完了しました。'
    candidate.value = null
  } catch (err) {
    session.error = errorMessage(err)
    if (reserved && !session.error.includes('切り替え結果を確認できません'))
      if (!(await finishRestore(uid, targetDatasetId)))
        session.error += ' 復元保留を解除できないため、状態確認まで操作を停止しています。'
  } finally {
    if (ownsBusy) session.busy = false
    progress.value = ''
  }
  if (!pending.value) await refresh()
}
async function confirmRestore() {
  const operation = pending.value
  if (!operation || !session.user || session.user.uid !== operation.uid || session.busy) return
  session.busy = true
  session.error = ''
  session.message = ''
  try {
    const status = await new Repository(operation.uid).confirmReplace(
      operation.expected,
      operation.targetDatasetId,
    )
    if (!(await finishRestore(operation.uid, operation.targetDatasetId))) {
      session.error =
        'サーバー状態は確認できましたが、該当する端末の保留状態を解除できません。操作を継続保留しています。'
      return
    }
    session.message =
      status === 'switched'
        ? 'サーバーで復元の切り替えを確認しました。'
        : status === 'not-switched'
          ? 'サーバーでは切り替わっていません。既存記録は維持されています。ファイルを選び直して復元できます。'
          : '別の操作で保存領域が変わっています。現在の記録を読み込み直しました。'
  } catch (error) {
    session.error = `サーバーで確認できませんでした。再実行は保留中です。${errorMessage(error)}`
  } finally {
    session.busy = false
  }
  if (!pending.value) await refresh()
}
async function toggleDevice() {
  if (
    await ask(
      rememberDevice
        ? '端末保存を無効にします。ログアウトして保存済みデータを削除します。'
        : 'この端末に記録を保存します。再読み込み後に有効になります。共用端末では有効にしないでください。',
    )
  ) {
    storageSet('qr:remember', String(!rememberDevice))
    if (rememberDevice) await logout()
    else location.reload()
  }
}
async function retryRestoreStateRead() {
  if (!session.user) return
  const state = await recheckRestoreState(session.user.uid)
  if (state.kind === 'clear') await refresh()
}
</script>
<template>
  <section>
    <div class="page-heading">
      <div>
        <p class="eyebrow">SETTINGS & BACKUP</p>
        <h1>設定・バックアップ</h1>
        <p>記録を守り、必要なときに戻せるように。</p>
      </div>
    </div>
    <div class="settings-grid">
      <section class="settings-card">
        <h2>ネットなしで見る</h2>
        <p>
          {{
            rememberDevice
              ? '保存した記録をネットなしで見られます。'
              : 'ネットなしで見るには、端末保存を有効にします。'
          }}
        </p>
        <p class="help">ログアウトすると端末の記録は消えます。</p>
        <button class="secondary" :disabled="session.busy" @click="toggleDevice">
          {{ rememberDevice ? '端末保存を無効にする' : 'この端末に記録を保存する' }}
        </button>
      </section>
      <section class="settings-card">
        <h2>バックアップを保存</h2>
        <p>全記録をファイルに保存します。</p>
        <p class="help">ネット接続が必要です。保存したファイルは大切に保管してください。</p>
        <button :disabled="disabled" @click="exportJson">バックアップを書き出す</button>
      </section>
      <section class="settings-card restore-card">
        <h2>JSONから復元する</h2>
        <p>ファイルを検証してから、現在の記録を全置換します。</p>
        <label
          >バックアップファイル<input
            type="file"
            accept=".json,application/json"
            :disabled="session.busy"
            @change="selectFile"
        /></label>
        <div v-if="candidate" class="restore-summary">
          <p>
            資格 {{ candidate.qualifications.length }}件 ／ 取得
            {{ candidate.acquisitions.length }}件 ／ 受験履歴 {{ candidate.examAttempts.length }}件
          </p>
          <p class="help">
            書き出し日時：{{ new Date(candidate.exportedAt).toLocaleString('ja-JP') }}
          </p>
          <button :disabled="disabled" @click="restore">内容を確認して全置換</button>
        </div>
        <p v-if="progress" role="status">{{ progress }}</p>
        <p v-if="pending" class="notice error" role="status">
          復元の切り替え結果が未確認です。二重復元と記録の変更を止めています。オンラインでサーバー状態を確認してください。
          <button :disabled="session.busy" @click="confirmRestore">サーバー状態を確認</button>
        </p>
        <p v-if="restoreUnavailable" class="notice error" role="alert">
          端末の復元状態を読み取れないか、保存内容が壊れています。通常変更と復元を停止しています。ブラウザーの保存領域を利用可能にして再確認してください。
          <button :disabled="session.busy" @click="retryRestoreStateRead">端末状態を再確認</button>
        </p>
      </section>
    </div>
  </section>
</template>
