<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { session, refresh, logout, retryCacheDeletion } from './state/session'
import { configured, rememberDevice } from './services/firebase'
import { ui, closeDialog } from './state/ui'
import { filters } from './state/ui'
import { useRoute } from 'vue-router'
import { TAGS } from './domain/model'
import Modal from './components/Modal.vue'
import Wizard from './components/Wizard.vue'
import QualificationUpdateModal from './components/QualificationUpdateModal.vue'
import AuthForm from './components/AuthForm.vue'
const sw = useRegisterSW({ immediate: true })
const blocked = computed(() => session.cacheDeletionRequired)
const updating = computed(() => session.busy || session.fetching)
const accountOpen = ref(false)
const route = useRoute()
const filterOpen = ref(false)
const tagSearch = ref('')
const ownedFilter = filters.owned
const visibleTags = computed(() => TAGS.filter((tag) => tag.label.includes(tagSearch.value.trim())))
let messageTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => session.message,
  (message) => {
    clearTimeout(messageTimer)
    if (message)
      messageTimer = setTimeout(() => {
        session.message = ''
      }, 4000)
  },
  { immediate: true },
)
onUnmounted(() => clearTimeout(messageTimer))
function accountLogout() {
  accountOpen.value = false
  void logout()
}
</script>
<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/qualifications" class="brand"
        ><span class="brand-mark">資格</span
        ><span>Tsumica<small>取得の記録を、いつでも手元に。</small></span></RouterLink
      ><button
        v-if="session.user"
        type="button"
        class="secondary account"
        aria-haspopup="dialog"
        :aria-expanded="accountOpen"
        :disabled="blocked || updating || ui.wizardOpen || !!ui.dialog"
        @click="accountOpen = true"
      >
        <span>アカウント</span>
      </button>
    </header>
    <main v-if="!configured" class="setup">
      <p class="eyebrow">SETUP</p>
      <h1>Tsumicaへようこそ</h1>
      <p>資格の取得年月と受験履歴を、必要なときにすぐ確認できます。</p>
      <p>
        この環境はまだFirebaseに接続していません。READMEの手順に沿って設定すると利用を開始できます。
      </p>
    </main>
    <main v-else-if="blocked" class="setup">
      <h1>端末データの削除が未完了です</h1>
      <p>
        他のタブを閉じてから、もう一度削除してください。完了するまでは別のアカウントで利用できません。
      </p>
      <p role="alert">{{ session.error }}</p>
      <button @click="retryCacheDeletion">削除を再試行</button>
    </main>
    <main v-else-if="!session.ready" class="setup" aria-busy="true">
      ログイン状態を確認しています。
    </main>
    <main v-else-if="!session.user || !session.user.emailVerified" class="auth-layout">
      <AuthForm />
    </main>
    <div v-else class="workspace-layout">
      <aside class="workspace-sidebar">
        <nav class="main-nav" aria-label="主要画面">
          <div class="main-nav-links">
            <RouterLink to="/qualifications">資格一覧</RouterLink
            ><RouterLink to="/exam-attempts">受験履歴</RouterLink
            ><RouterLink to="/settings">設定・バックアップ</RouterLink>
          </div>
        </nav>
        <button
          v-if="route.path === '/qualifications'"
          type="button"
          class="secondary filter-open"
          :aria-expanded="filterOpen"
          @click="filterOpen = true"
        >
          検索・絞り込み<span v-if="filters.owned.tags.length" class="filter-count">{{
            filters.owned.tags.length
          }}</span>
        </button>
      </aside>
      <div class="workspace-content">
        <div class="status-bar">
          <span
            ><span
              class="connection-dot"
              :class="{ online: session.writable && !session.cacheOnly }"
              aria-hidden="true"
            ></span
            >{{
              session.cacheOnly
                ? 'オフライン（閲覧・検索のみ）'
                : session.fetching
                  ? '取得中'
                  : session.writable
                    ? 'オンライン'
                    : '接続を確認中'
            }}<small v-if="session.lastFetched"
              >最終取得：{{ new Date(session.lastFetched).toLocaleString('ja-JP') }}</small
            ></span
          >
          <div class="record-refresh">
            <button
              class="secondary compact"
              :disabled="updating"
              aria-describedby="record-refresh-help"
              @click="refresh"
            >
              {{ session.fetching ? '記録を取得中…' : '記録を再取得' }}</button
            ><small id="record-refresh-help">資格・受験履歴をサーバーから読み込みます</small>
          </div>
        </div>
        <p v-if="session.error" class="notice error" role="alert">{{ session.error }}</p>
        <p v-if="session.cleanupWarning" class="notice">{{ session.cleanupWarning }}</p>
        <p v-if="rememberDevice && sw.offlineReady.value" class="offline-ready">
          画面のオフライン表示の準備が完了しました。記録は取得済みの範囲で表示します。
        </p>
        <main><RouterView /></main>
      </div>
    </div>
    <div v-if="sw.needRefresh.value" class="update-banner" role="status">
      <span>新しいバージョンが利用できます。</span
      ><button :disabled="ui.wizardOpen || session.busy" @click="sw.updateServiceWorker(true)">
        更新して再読み込み
      </button>
    </div>
    <p v-if="session.message" class="notice success save-toast" role="status">
      {{ session.message }}
    </p>
    <QualificationUpdateModal v-if="ui.wizardOpen && ui.wizardQualificationId" />
    <Wizard v-else-if="ui.wizardOpen" />
    <Modal
      v-if="accountOpen && session.user && !blocked"
      title="アカウント"
      @close="accountOpen = false"
    >
      <dl>
        <dt>メールアドレス</dt>
        <dd>{{ session.user.email }}</dd>
        <dt>メール確認</dt>
        <dd>{{ session.user.emailVerified ? '確認済み' : '未確認' }}</dd>
      </dl>
      <p class="help">
        ログアウトすると、この端末に保存した記録を削除します。サーバーの記録は残ります。
      </p>
      <div class="actions">
        <button
          type="button"
          class="secondary"
          :disabled="updating || ui.wizardOpen"
          @click="accountLogout"
        >
          ログアウト
        </button>
      </div>
    </Modal>
    <Modal
      v-if="filterOpen && route.path === '/qualifications'"
      class="qualification-filter-dialog"
      title="資格の検索・絞り込み"
      @close="filterOpen = false"
    >
      <label
        >資格名を検索<input
          v-model="filters.owned.search"
          type="search"
          placeholder="資格名の一部を入力"
      /></label>
      <section class="selected-tags" aria-label="選択中のジャンル">
        <h3>選択中のジャンル</h3>
        <p v-if="!ownedFilter.tags.length" class="help">ジャンルは選択されていません</p>
        <div class="selected-tag-list">
          <span
            v-for="tag in TAGS.filter((item) => ownedFilter.tags.includes(item.id))"
            :key="tag.id"
            class="selected-tag"
          >
            {{ tag.label }}
            <button
              type="button"
              :aria-label="tag.label + 'を解除'"
              @click="ownedFilter.tags = ownedFilter.tags.filter((id) => id !== tag.id)"
            >
              ×
            </button>
          </span>
        </div>
      </section>
      <label
        >ジャンルを検索<input v-model="tagSearch" type="search" placeholder="ジャンル名を入力"
      /></label>
      <p class="help">選択したすべてのジャンルに一致</p>
      <div class="dialog-tag-options" role="group" aria-label="ジャンル候補">
        <button
          v-for="tag in visibleTags"
          :key="tag.id"
          type="button"
          class="filter-chip"
          :aria-pressed="filters.owned.tags.includes(tag.id)"
          @click="
            filters.owned.tags = filters.owned.tags.includes(tag.id)
              ? filters.owned.tags.filter((id) => id !== tag.id)
              : [...filters.owned.tags, tag.id]
          "
        >
          {{ tag.label }}
        </button>
      </div>
    </Modal>
    <Modal
      v-if="ui.dialog"
      :title="ui.dialog.confirm ? '変更内容の確認' : '入力内容を破棄します'"
      @close="closeDialog(false)"
      ><p class="dialog-message">{{ ui.dialog.message }}</p>
      <div class="actions">
        <button class="danger-button" @click="closeDialog(true)">
          {{ ui.dialog.confirm ? '同意して続ける' : '閉じて破棄する' }}
        </button>
      </div></Modal
    >
  </div>
</template>
