<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { session, changeRecords, plain } from '../state/session'
import { ui, discardWizard } from '../state/ui'
import { resultLabel, type Result } from '../domain/model'
import { formatDate, validInputDate } from '../domain/validation'
import { register } from '../domain/records'
import Modal from './Modal.vue'
import ExamDateInput from './ExamDateInput.vue'

const step = ref(0)
const error = ref('')
const qualificationId = ui.wizardQualificationId
const draft = reactive({
  result: '' as Result | '',
  history: '' as '' | 'yes' | 'no',
  month: '',
  examDate: '',
})
const attemptId = crypto.randomUUID()
const qualification = computed(() =>
  session.records.qualifications.find((item) => item.id === qualificationId),
)
const acquisition = computed(() =>
  session.records.acquisitions.find((item) => item.qualificationId === qualificationId),
)
const resultText = computed(() => (draft.result ? resultLabel[draft.result] : ''))

function validateStep() {
  if (!qualification.value) throw new Error('対象資格が見つかりません。記録を再取得してください。')
  if (step.value === 0 && !draft.result) throw new Error('受験結果を選択してください。')
  if (step.value === 1) {
    if (!draft.result) throw new Error('受験結果を選択してください。')
    if (draft.result === 'passed' && !draft.history)
      throw new Error('受験履歴を登録するか選択してください。')
    if (
      draft.result === 'passed' &&
      (!validInputDate(draft.month) ||
        (acquisition.value && draft.month < acquisition.value.acquiredMonth))
    )
      throw new Error('更新年月を正しく入力してください。更新年月は取得年月以降です。')
    if (
      (draft.result !== 'passed' || draft.history === 'yes') &&
      !validInputDate(draft.examDate, true)
    )
      throw new Error('受験年月を入力してください。日は任意です。')
  }
}

function next() {
  try {
    validateStep()
    error.value = ''
    step.value++
    ui.wizardDirty = true
  } catch (err) {
    error.value = (err as Error).message
  }
}

function goBack() {
  step.value--
  error.value = ''
}

async function save() {
  const result = draft.result
  if (step.value !== 2 || !result || !qualification.value) {
    error.value = !qualification.value
      ? '対象資格が見つかりません。記録を再取得してください。'
      : '受験結果を選択してください。'
    return
  }
  const saved = await changeRecords((records) =>
    register(records, {
      qualification: plain(qualification.value!),
      existing: true,
      result,
      includeAttempt: draft.history === 'yes',
      examDate: draft.examDate,
      month: draft.month,
      attemptId,
    }),
  )
  if (saved) {
    ui.wizardDirty = false
    ui.wizardOpen = false
    ui.wizardQualificationId = ''
  }
}
</script>

<template>
  <Modal title="資格・受験の記録" :busy="session.busy" @close="discardWizard">
    <form
      @submit.prevent="step === 2 ? save() : next()"
      @input="ui.wizardDirty = true"
      @change="ui.wizardDirty = true"
    >
      <p class="eyebrow">STEP {{ step + 1 }} / 3</p>
      <ol class="steps" aria-label="更新の進捗">
        <li :class="{ current: step === 0 }">資格・結果</li>
        <li :class="{ current: step === 1 }">年月</li>
        <li :class="{ current: step === 2 }">確認</li>
      </ol>

      <template v-if="qualification">
        <div v-if="step === 0">
          <p class="target-summary">{{ qualification.name }} {{ qualification.gradeOrCategory }}</p>
          <label>
            受験結果<span class="required-marker" aria-hidden="true"></span>
            <select v-model="draft.result" required aria-required="true">
              <option value="">選択してください</option>
              <option v-for="(label, value) in resultLabel" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </label>
        </div>

        <div v-if="step === 1">
          <p class="target-summary">
            {{ qualification.name }} {{ qualification.gradeOrCategory }} · {{ resultText }}
          </p>
          <template v-if="draft.result === 'passed'">
            <fieldset>
              <legend>
                受験履歴も登録しますか？<span class="required-marker" aria-hidden="true"></span>
              </legend>
              <label class="check">
                <input v-model="draft.history" type="radio" value="yes" />履歴も登録する
              </label>
              <label class="check">
                <input v-model="draft.history" type="radio" value="no" />あなたの資格のみ登録する
              </label>
            </fieldset>
            <p v-if="acquisition" class="help">
              取得年月 {{ formatDate(acquisition.acquiredMonth) }} は保持します。
            </p>
            <ExamDateInput v-model="draft.month" :label="acquisition ? '更新年月' : '取得年月'" />
          </template>
          <template v-if="draft.result !== 'passed' || draft.history === 'yes'">
            <ExamDateInput v-model="draft.examDate" label="受験年月（日は任意）" allow-day />
            <span class="help">年月のみ、または年月日を入力できます。</span>
          </template>
        </div>

        <div v-if="step === 2" class="review">
          <h3>この内容で保存します</h3>
          <dl>
            <dt>資格</dt>
            <dd>{{ qualification.name }} {{ qualification.gradeOrCategory }}</dd>
            <dt>結果</dt>
            <dd>{{ resultText }}</dd>
            <template v-if="draft.result === 'passed'">
              <dt>{{ acquisition ? '更新年月' : '取得年月' }}</dt>
              <dd>{{ formatDate(draft.month) }}</dd>
            </template>
            <dt>受験履歴</dt>
            <dd>
              {{
                draft.result !== 'passed' || draft.history === 'yes'
                  ? formatDate(draft.examDate)
                  : '登録しない'
              }}
            </dd>
          </dl>
          <p class="help">保存するまでは正式な記録を変更しません。</p>
        </div>
      </template>
      <p v-else class="notice error" role="alert">
        対象資格が見つかりません。記録を再取得してから、もう一度お試しください。
      </p>
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <p v-if="session.error" class="notice error" role="alert">{{ session.error }}</p>
      <div class="actions">
        <button
          v-if="step > 0"
          type="button"
          class="secondary"
          :disabled="session.busy"
          @click="goBack"
        >
          戻る
        </button>
        <button
          :disabled="
            session.busy ||
            !session.writable ||
            session.fetching ||
            !qualification ||
            (step === 0 && !draft.result)
          "
        >
          {{ session.busy ? '保存中…' : step === 2 ? '記録を保存' : '次へ' }}
        </button>
      </div>
    </form>
  </Modal>
</template>
