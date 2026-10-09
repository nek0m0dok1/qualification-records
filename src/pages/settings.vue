<script setup lang="ts">
import { ref, computed } from 'vue'
import { session, refresh, plain, errorMessage, logout } from '../state/session'
import { ask } from '../state/ui'
import { rememberDevice, storageSet } from '../services/firebase'
import { makeBackup, parseBackup, type Backup } from '../domain/backup'
import { Repository } from '../services/repository'
const candidate = ref<Backup | null>(null), progress = ref(''), uncertain = ref(false)
const disabled = computed(() => session.busy || session.fetching || !session.writable)
async function exportJson() {
  if (!session.user || disabled.value) return
  session.busy = true; session.error = ''
  try {
    const data = await new Repository(session.user.uid).load()
    const blob = new Blob([JSON.stringify(makeBackup(data.records), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `qualifications-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    session.message = 'バックアップファイルのダウンロードを開始しました。保存先を確認してください。'
  } catch (err) { session.error = errorMessage(err) } finally { session.busy = false }
}
async function selectFile(event: Event) {
  candidate.value = null; session.error = ''
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  try { if (file.size > 10 * 1024 * 1024) throw new Error('復元ファイルは10MB以内にしてください。'); candidate.value = parseBackup(await file.text()) }
  catch (err) { session.error = errorMessage(err) }
  input.value = ''
}
async function restore() {
  if (!session.user || !session.loaded || !candidate.value || disabled.value || uncertain.value) return
  if (!await ask(`現在の全記録を、資格${candidate.value.qualifications.length}件・受験履歴${candidate.value.examAttempts.length}件のバックアップへ置き換えます。既存記録は削除されます。必要なら先にJSONを書き出してください。`)) return
  session.busy = true; session.error = ''; session.message = ''
  try { await new Repository(session.user.uid).replace(plain(session.loaded.head), plain(candidate.value), text => { progress.value = text }); session.message = '復元の切り替えが完了しました。'; candidate.value = null }
  catch (err) { session.error = errorMessage(err); if (session.error.includes('切り替え結果を確認できません')) uncertain.value = true }
  finally { session.busy = false; progress.value = '' }
  await refresh()
}
async function toggleDevice() { if (await ask(rememberDevice ? '端末保存を無効にします。ログアウトして保存済みデータを削除します。' : 'この端末に記録を保存します。再読み込み後に有効になります。共用端末では有効にしないでください。')) { storageSet('qr:remember', String(!rememberDevice)); if (rememberDevice) await logout(); else location.reload() } }
</script>
<template><section><div class="page-heading"><div><p class="eyebrow">SETTINGS & BACKUP</p><h1>設定・バックアップ</h1><p>記録を守り、必要なときに戻せるように。</p></div></div><div class="settings-grid"><section class="settings-card"><h2>端末への保存</h2><p>{{ rememberDevice ? '有効です。取得済みの記録をオフラインでも確認できます。' : '無効です。再起動後のオフライン閲覧は保証されません。' }}</p><p class="help">キャッシュはバックアップではありません。ログアウト時に削除します。</p><button class="secondary" :disabled="session.busy" @click="toggleDevice">{{ rememberDevice ? '端末保存を無効にする' : 'この端末に記録を保存する' }}</button></section><section class="settings-card"><h2>JSONを書き出す</h2><p>全記録と関連付けを、ひとつのファイルに保存します。</p><p class="help">オンラインで全記録を取得できた場合のみ書き出します。ファイルは暗号化されません。</p><button :disabled="disabled" @click="exportJson">バックアップを書き出す</button></section><section class="settings-card restore-card"><h2>JSONから復元する</h2><p>ファイルを検証してから、現在の記録を全置換します。</p><label>バックアップファイル<input type="file" accept=".json,application/json" :disabled="session.busy" @change="selectFile"></label><div v-if="candidate" class="restore-summary"><p>資格 {{ candidate.qualifications.length }}件 ／ 取得 {{ candidate.acquisitions.length }}件 ／ 受験履歴 {{ candidate.examAttempts.length }}件</p><p class="help">書き出し日時：{{ new Date(candidate.exportedAt).toLocaleString('ja-JP') }}</p><button :disabled="disabled || uncertain" @click="restore">内容を確認して全置換</button></div><p v-if="progress" role="status">{{ progress }}</p><p v-if="uncertain" class="notice error">切り替え結果が未確認です。再実行せず、オンラインで更新して記録を確認してください。</p></section></div></section></template>
