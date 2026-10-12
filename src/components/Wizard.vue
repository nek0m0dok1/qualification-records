<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { session, changeRecords, plain } from '../state/session'
import { ui, discardWizard } from '../state/ui'
import { TAGS, resultLabel, type Result, type Qualification } from '../domain/model'
import { formatDate, validDate, validateRecords } from '../domain/validation'
import { register } from '../domain/records'
import Modal from './Modal.vue'
import ExamDateInput from './ExamDateInput.vue'
const step = ref(ui.wizardQualificationId ? 1 : 0), error = ref('')
const method = ref<'new' | 'existing' | ''>(ui.wizardQualificationId ? 'existing' : ''), existingId = ref(ui.wizardQualificationId)
const draft = reactive({ name: '', gradeOrCategory: '', fixedTagIds: [] as string[], memo: '', result: 'passed' as Result, history: '' as '' | 'yes' | 'no', month: '', examDate: '' })
const newId = crypto.randomUUID(), attemptId = crypto.randomUUID()
const existing = computed(() => session.records.qualifications.find(q => q.id === existingId.value))
const acquisition = computed(() => method.value === 'existing' ? session.records.acquisitions.find(a => a.qualificationId === existingId.value) : undefined)
const qualification = (): Qualification => method.value === 'existing' ? plain(existing.value!) : { id: newId, name: draft.name.trim(), gradeOrCategory: draft.gradeOrCategory, fixedTagIds: [...draft.fixedTagIds], memo: draft.memo }
function resetTarget() { draft.month = ''; draft.examDate = ''; draft.history = ''; error.value = ''; ui.wizardDirty = true }
function validateStep() {
  if (step.value === 0 && (!method.value || method.value === 'existing' && !existing.value)) throw new Error('新資格または対象の既存資格を選択してください。')
  if (step.value === 1) validateRecords({ qualifications: [qualification()], acquisitions: [], examAttempts: [] })
  if (step.value === 2) {
    if (draft.result === 'passed' && !draft.history) throw new Error('受験履歴を登録するか選択してください。')
    if (draft.result === 'passed' && (!validDate(draft.month) || acquisition.value && draft.month < acquisition.value.acquiredMonth)) throw new Error('取得・更新年月を正しく入力してください。更新年月は取得年月以降です。')
    if ((draft.result !== 'passed' || draft.history === 'yes') && !validDate(draft.examDate, true)) throw new Error('受験年月を入力してください。日付はYYYY-MMまたはYYYY-MM-DDです。')
  }
}
function goBack() { step.value--; error.value = '' }
function next() { try { validateStep(); error.value = ''; step.value++; ui.wizardDirty = true } catch (err) { error.value = (err as Error).message } }
async function save() {
  const saved = await changeRecords(records => register(records, { qualification: qualification(), existing: method.value === 'existing', result: draft.result, includeAttempt: draft.history === 'yes', examDate: draft.examDate, month: draft.month, attemptId }))
  if (saved) { ui.wizardDirty = false; ui.wizardOpen = false }
}
</script>
<template>
  <Modal title="資格・受験の記録" :busy="session.busy" @close="discardWizard"><form @submit.prevent="step === 3 ? save() : next()" @input="ui.wizardDirty = true" @change="ui.wizardDirty = true">
    <p class="eyebrow">STEP {{ step + 1 }} / 4</p><ol class="steps" aria-label="登録の進捗"><li :class="{ current: step === 0 }">対象</li><li :class="{ current: step === 1 }">資格・結果</li><li :class="{ current: step === 2 }">年月</li><li :class="{ current: step === 3 }">確認</li></ol>
    <fieldset v-if="step === 0"><legend>記録する資格を選ぶ<span class="required-marker" aria-hidden="true"></span></legend><label class="check"><input v-model="method" type="radio" value="new" @change="resetTarget">新資格の登録</label><label class="check"><input v-model="method" type="radio" value="existing" @change="resetTarget">既存資格の更新・受験履歴の追加</label><label v-if="method === 'existing'">対象資格<span class="required-marker" aria-hidden="true"></span><select v-model="existingId" @change="resetTarget"><option value="">選択してください</option><option v-for="q in session.records.qualifications" :key="q.id" :value="q.id">{{ q.name }} {{ q.gradeOrCategory }}</option></select></label></fieldset>
    <div v-if="step === 1"><template v-if="method === 'new'"><label>資格名<span class="required-marker" aria-hidden="true"></span><input v-model="draft.name" maxlength="200" required></label><label>級・区分（任意）<input v-model="draft.gradeOrCategory" maxlength="100"></label><fieldset><legend>ジャンル（任意・複数選択可）</legend><div class="tag-options"><label v-for="tag in TAGS" :key="tag.id" class="check"><input v-model="draft.fixedTagIds" type="checkbox" :value="tag.id">{{ tag.label }}</label></div></fieldset><label>メモ（任意）<textarea v-model="draft.memo" maxlength="5000" rows="3" /></label></template><p v-else class="target-summary">{{ existing?.name }} {{ existing?.gradeOrCategory }}</p><label>受験結果<span class="required-marker" aria-hidden="true"></span><select v-model="draft.result"><option v-for="(label, value) in resultLabel" :key="value" :value="value">{{ label }}</option></select></label></div>
    <div v-if="step === 2"><p class="target-summary">{{ qualification().name }} {{ qualification().gradeOrCategory }} · {{ resultLabel[draft.result] }}</p><template v-if="draft.result === 'passed'"><fieldset><legend>受験履歴も登録しますか？<span class="required-marker" aria-hidden="true"></span></legend><label class="check"><input v-model="draft.history" type="radio" value="yes">履歴も登録する</label><label class="check"><input v-model="draft.history" type="radio" value="no">あなたの資格のみ登録する</label></fieldset><p v-if="acquisition" class="help">取得年月 {{ formatDate(acquisition.acquiredMonth) }} は保持します。</p><ExamDateInput v-model="draft.month" :label="acquisition ? '更新年月' : '取得年月'" /></template><template v-if="draft.result !== 'passed' || draft.history === 'yes'"><ExamDateInput v-model="draft.examDate" label="受験年月（日は任意）" allow-day /><span class="help">年月のみ、または年月日を入力できます。</span></template></div>
    <div v-if="step === 3" class="review"><h3>この内容で保存します</h3><dl><dt>資格</dt><dd>{{ qualification().name }} {{ qualification().gradeOrCategory }}</dd><dt>結果</dt><dd>{{ resultLabel[draft.result] }}</dd><template v-if="draft.result === 'passed'"><dt>{{ acquisition ? '更新年月' : '取得年月' }}</dt><dd>{{ formatDate(draft.month) }}</dd></template><dt>受験履歴</dt><dd>{{ draft.result !== 'passed' || draft.history === 'yes' ? formatDate(draft.examDate) : '登録しない' }}</dd></dl><p class="help">保存するまでは正式な記録を変更しません。</p></div>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p><p v-if="session.error" class="notice error" role="alert">{{ session.error }}</p><div class="actions"><button v-if="step > 0" type="button" class="secondary" :disabled="session.busy" @click="goBack">戻る</button><button :disabled="session.busy || !session.writable || session.fetching">{{ session.busy ? '保存中…' : step === 3 ? '記録を保存' : '次へ' }}</button></div>
  </form></Modal>
</template>
