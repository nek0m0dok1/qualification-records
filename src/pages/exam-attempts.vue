<script setup lang="ts">
import { computed, ref } from 'vue'
import { session, changeRecords } from '../state/session'
import { filters, ask } from '../state/ui'
import { resultLabel, type Result } from '../domain/model'
import { formatDate } from '../domain/validation'
import { filteredAttempts, editAttempt, deleteAttempt, linkedImpact } from '../domain/records'
import Modal from '../components/Modal.vue'
import QualificationDetail from '../components/QualificationDetail.vue'
import ExamDateInput from '../components/ExamDateInput.vue'
const filter = filters.attempts, selected = ref(''), editingId = ref(''), result = ref<Result>('pending'), date = ref(''), month = ref('')
const rows = computed(() => filteredAttempts(session.records, filter.search, filter.results, filter.direction))
const editing = computed(() => session.records.examAttempts.find(a => a.id === editingId.value))
const becomingPassed = computed(() => editing.value?.result !== 'passed' && result.value === 'passed')
const owned = computed(() => session.records.acquisitions.some(a => a.qualificationId === editing.value?.qualificationId))
function edit(id: string) { editingId.value = id; result.value = editing.value!.result; date.value = editing.value!.examDate; month.value = '' }
async function save() {
  if (!editing.value) return
  if (result.value !== editing.value.result) {
    const impact = becomingPassed.value ? `合格への訂正に合わせて、保有情報の${owned.value ? '更新年月' : '取得年月'}も登録します。変更しない場合は結果の訂正も取り消します。` : linkedImpact(session.records, editingId.value)
    if (!await ask(impact)) { editingId.value = ''; return }
  }
  if (await changeRecords(records => editAttempt(records, editingId.value, result.value, date.value, true, month.value))) editingId.value = ''
}
async function remove(id: string) { if (await ask(`この受験履歴を削除します。${linkedImpact(session.records, id)}`)) await changeRecords(records => deleteAttempt(records, id, true)) }
</script>
<template>
  <section><div class="page-heading"><div><p class="eyebrow">EXAM HISTORY</p><h1>受験履歴</h1><p>合否にかかわらず、挑戦の記録を残す。</p></div><span class="count">{{ session.records.examAttempts.length }}<small>件の記録</small></span></div><div class="filter-panel"><label class="search-label">資格名を検索<input v-model="filter.search" type="search" placeholder="資格名の一部を入力"></label><label>並び順<select v-model="filter.direction"><option value="desc">受験年月：新しい順</option><option value="asc">受験年月：古い順</option></select></label><fieldset><legend>受験結果</legend><div class="tag-options"><label v-for="(label, value) in resultLabel" :key="value" class="check"><input v-model="filter.results" type="checkbox" :value="value">{{ label }}</label></div></fieldset></div><p class="result-count">{{ rows.length }}件を表示</p><div class="attempt-list"><article v-for="exam in rows" :key="exam.id" class="attempt-row"><time>{{ formatDate(exam.examDate) }}</time><button class="text-button attempt-name" @click="selected = exam.qualificationId">{{ session.records.qualifications.find(q => q.id === exam.qualificationId)?.name }}<small>{{ session.records.qualifications.find(q => q.id === exam.qualificationId)?.gradeOrCategory }}</small></button><span class="result-badge" :class="exam.result">{{ resultLabel[exam.result] }}</span><div class="row-actions"><button class="secondary compact" :disabled="session.busy || !session.writable" @click="edit(exam.id)">訂正</button><button class="text-button danger compact" :disabled="session.busy || !session.writable" @click="remove(exam.id)">削除</button></div></article></div><div v-if="!rows.length" class="empty"><h2>{{ session.loaded ? '該当する受験履歴はありません' : '記録をまだ取得できていません' }}</h2><p>資格・受験の記録を追加するか、検索条件を変更してください。</p></div>
  <QualificationDetail v-if="selected" :id="selected" @close="selected = ''" /><Modal v-if="editingId" title="受験履歴の訂正" :busy="session.busy" @close="editingId = ''"><form @submit.prevent="save"><ExamDateInput v-model="date" label="受験年月（日は任意）" allow-day /><label>受験結果<span class="required-marker" aria-hidden="true">*</span><select v-model="result"><option v-for="(label, value) in resultLabel" :key="value" :value="value">{{ label }}</option></select></label><ExamDateInput v-if="becomingPassed" v-model="month" :label="owned ? '更新年月' : '取得年月'" /><p v-if="session.error" class="notice error" role="alert">{{ session.error }}</p><div class="actions"><button type="button" class="secondary" :disabled="session.busy" @click="editingId = ''">キャンセル</button><button :disabled="session.busy || !session.writable">訂正を保存</button></div></form></Modal></section>
</template>
