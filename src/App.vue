<script setup lang="ts">
import { computed } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { session, refresh, logout, retryCacheDeletion } from './state/session'
import { configured, storageGet, rememberDevice } from './services/firebase'
import { ui, openWizard, closeDialog } from './state/ui'
import Modal from './components/Modal.vue'
import Wizard from './components/Wizard.vue'
import AuthForm from './components/AuthForm.vue'
const sw = useRegisterSW({ immediate: true })
const blocked = computed(() => storageGet('qr:cleanup-required') === 'true')
const updating = computed(() => session.busy || session.fetching)
</script>
<template>
  <div class="app-shell">
    <header class="app-header"><RouterLink to="/qualifications" class="brand"><span class="brand-mark">資格</span><span>資格ノート<small>取得の記録を、いつでも手元に。</small></span></RouterLink><span v-if="session.user" class="account">{{ session.user.email }}</span></header>
    <main v-if="!configured" class="setup"><p class="eyebrow">SETUP</p><h1>資格ノートへようこそ</h1><p>資格の取得年月と受験履歴を、必要なときにすぐ確認できます。</p><p>この環境はまだFirebaseに接続していません。READMEの手順に沿って設定すると利用を開始できます。</p></main>
    <main v-else-if="blocked" class="setup"><h1>端末データの削除が未完了です</h1><p>他のタブを閉じてから、もう一度削除してください。完了するまでは別のアカウントで利用できません。</p><p role="alert">{{ session.error }}</p><button @click="retryCacheDeletion">削除を再試行</button></main>
    <main v-else-if="!session.ready" class="setup" aria-busy="true">ログイン状態を確認しています。</main>
    <main v-else-if="!session.user || !session.user.emailVerified" class="auth-layout"><AuthForm /></main>
    <template v-else>
      <nav class="main-nav" aria-label="主要画面"><RouterLink to="/qualifications">保有資格</RouterLink><RouterLink to="/exam-attempts">受験履歴</RouterLink><RouterLink to="/settings">設定・バックアップ</RouterLink></nav>
      <div class="status-bar"><span>{{ session.cacheOnly ? '閲覧・検索のみ' : session.fetching ? '取得中' : session.writable ? 'オンライン' : '接続を確認中' }}<small v-if="session.lastFetched">最終取得：{{ new Date(session.lastFetched).toLocaleString('ja-JP') }}</small></span><button class="secondary compact" :disabled="updating" @click="refresh">更新</button></div>
      <p v-if="session.error" class="notice error" role="alert">{{ session.error }}</p><p v-if="session.message" class="notice success" role="status">{{ session.message }}</p><p v-if="session.cleanupWarning" class="notice">{{ session.cleanupWarning }}</p>
      <p v-if="rememberDevice && sw.offlineReady.value" class="offline-ready">画面のオフライン表示の準備が完了しました。記録は取得済みの範囲で表示します。</p>
      <main><RouterView /></main>
      <footer><button class="secondary" :disabled="updating || !session.writable" @click="openWizard()">＋ 記録を追加</button><button class="text-button" :disabled="updating || ui.wizardOpen" @click="logout">ログアウト</button></footer>
    </template>
    <div v-if="sw.needRefresh.value" class="update-banner" role="status"><span>新しいバージョンが利用できます。</span><button :disabled="ui.wizardOpen || session.busy" @click="sw.updateServiceWorker(true)">更新して再読み込み</button></div>
    <Wizard v-if="ui.wizardOpen" />
    <Modal v-if="ui.dialog" :title="ui.dialog.confirm ? '変更内容の確認' : '入力内容を破棄します'" @close="closeDialog(false)"><p class="dialog-message">{{ ui.dialog.message }}</p><div class="actions"><button v-if="ui.dialog.confirm" class="secondary" @click="closeDialog(false)">キャンセル</button><button @click="closeDialog(true)">{{ ui.dialog.confirm ? '同意して続ける' : '閉じて破棄する' }}</button></div></Modal>
  </div>
</template>
