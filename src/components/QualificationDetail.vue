<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Modal from './Modal.vue'
import { session, changeRecords } from '../state/session'
import { ask, openWizard } from '../state/ui'
import { TAGS, resultLabel } from '../domain/model'
import { formatDate } from '../domain/validation'
import { deleteQualification, editQualification, cancelLatestRenewal } from '../domain/records'
import ExamDateInput from './ExamDateInput.vue'
const props = defineProps<{ id: string; attemptActions?: boolean }>(),
  emit = defineEmits<{ close: []; editAttempt: [id: string]; deleteAttempt: [id: string] }>()
const q = computed(() => session.records.qualifications.find((x) => x.id === props.id))
watch(
  q,
  (value) => {
    if (!value) emit('close')
  },
  { flush: 'post' },
)
const a = computed(() => session.records.acquisitions.find((x) => x.qualificationId === props.id))
const attempts = computed(() =>
  session.records.examAttempts.filter((x) => x.qualificationId === props.id),
)
const editing = ref(false)
const draft = reactive({
  name: '',
  gradeOrCategory: '',
  fixedTagIds: [] as string[],
  memo: '',
  acquiredMonth: '',
  renewedMonth: '',
})
function beginEditing() {
  if (!q.value) return
  Object.assign(draft, {
    name: q.value.name,
    gradeOrCategory: q.value.gradeOrCategory,
    fixedTagIds: [...q.value.fixedTagIds],
    memo: q.value.memo,
    acquiredMonth: a.value?.acquiredMonth ?? '',
    renewedMonth: a.value?.renewal?.month ?? '',
  })
  editing.value = true
}
function addAttempt() {
  emit('close')
  openWizard(props.id)
}
async function save() {
  if (
    await changeRecords((records) =>
      editQualification(
        records,
        {
          id: props.id,
          name: draft.name.trim(),
          gradeOrCategory: draft.gradeOrCategory,
          fixedTagIds: [...draft.fixedTagIds],
          memo: draft.memo,
        },
        a.value ? draft.acquiredMonth : undefined,
        a.value?.renewal ? draft.renewedMonth : undefined,
      ),
    )
  )
    editing.value = false
}
async function remove() {
  if (!q.value) {
    emit('close')
    return
  }
  if (
    await ask(
      `「${q.value.name}」と、取得・更新情報、受験履歴${attempts.value.length}件をすべて削除します。よろしいですか？`,
    )
  )
    if (await changeRecords((records) => deleteQualification(records, props.id, true)))
      emit('close')
}
async function undo() {
  if (!a.value?.renewal) return
  if (
    await ask(
      a.value.previousRenewal
        ? `最新更新を取り消し、${a.value.previousRenewal.month}の情報へ戻します。合格履歴は残します。`
        : '最新更新情報を削除します。取得年月と合格履歴は残します。',
    )
  )
    await changeRecords((records) => cancelLatestRenewal(records, props.id, true))
}
async function close() {
  if (
    editing.value &&
    !(await ask('編集中の変更を破棄します。このダイアログを閉じると詳細画面を終了します。', false))
  )
    return
  emit('close')
}
</script>
<template>
  <Modal
    v-if="q"
    :class="{ 'qualification-detail': !editing }"
    :title="editing ? '資格情報の訂正' : q.name"
    :busy="session.busy"
    @close="close"
  >
    <form v-if="editing" @submit.prevent="save">
      <label
        >資格名<span class="required-marker" aria-hidden="true"></span
        ><input v-model="draft.name" required maxlength="200" /></label
      ><label>級・区分<input v-model="draft.gradeOrCategory" maxlength="100" /></label>
      <fieldset>
        <legend>固定タグ</legend>
        <div class="tag-options">
          <label v-for="tag in TAGS" :key="tag.id" class="check"
            ><input v-model="draft.fixedTagIds" type="checkbox" :value="tag.id" />{{
              tag.label
            }}</label
          >
        </div>
      </fieldset>
      <label>メモ<textarea v-model="draft.memo" maxlength="5000" rows="4" /></label
      ><ExamDateInput v-if="a" v-model="draft.acquiredMonth" label="取得年月" /><ExamDateInput
        v-if="a?.renewal"
        v-model="draft.renewedMonth"
        label="最新の更新年月"
      />
      <div class="actions">
        <button type="button" class="secondary" @click="editing = false">訂正を取り消す</button
        ><button :disabled="session.busy || !session.writable">訂正を保存</button>
      </div>
    </form>
    <template v-else
      ><p v-if="a" class="detail-result"><span class="result-badge passed">合格</span></p>
      <p class="qualification-grade">{{ q!.gradeOrCategory || '級・区分なし' }}</p>
      <div class="tags">
        <span v-for="tag in TAGS.filter((t) => q!.fixedTagIds.includes(t.id))" :key="tag.id">{{
          tag.label
        }}</span>
      </div>
      <dl>
        <dt>取得年月</dt>
        <dd>{{ a ? formatDate(a.acquiredMonth) : '未登録' }}</dd>
        <dt>最新の更新年月</dt>
        <dd>{{ a?.renewal ? formatDate(a.renewal.month) : '未更新' }}</dd>
      </dl>
      <h3>メモ</h3>
      <p class="memo">{{ q!.memo || 'メモはありません。' }}</p>
      <h3>受験履歴</h3>
      <p v-if="!attempts.length" class="help">受験履歴はありません。</p>
      <ul class="detail-attempts">
        <li v-for="exam in attempts" :key="exam.id">
          {{ formatDate(exam.examDate) }}
          <span v-if="exam.result !== 'passed'" class="result-badge" :class="exam.result">{{
            resultLabel[exam.result]
          }}</span>
          <div v-if="attemptActions" class="row-actions">
            <button
              type="button"
              class="secondary compact"
              :disabled="session.busy || !session.writable"
              @click="emit('editAttempt', exam.id)"
            >
              訂正</button
            ><button
              type="button"
              class="text-button danger compact"
              :disabled="session.busy || !session.writable"
              @click="emit('deleteAttempt', exam.id)"
            >
              削除
            </button>
          </div>
        </li>
      </ul>
      <div class="actions wrap detail-actions">
        <button
          type="button"
          class="delete-icon"
          aria-label="資格全体を削除"
          title="資格全体を削除"
          :disabled="!session.writable || session.busy"
          @click="remove"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
          </svg></button
        ><button :disabled="!session.writable || session.busy" @click="addAttempt">
          受験・更新を追加</button
        ><button
          class="secondary"
          :disabled="!session.writable || session.busy"
          @click="beginEditing"
        >
          情報を訂正</button
        ><button
          v-if="a?.renewal"
          class="secondary"
          :disabled="!session.writable || session.busy"
          @click="undo"
        >
          最新更新を取り消す
        </button>
      </div></template
    >
    <p v-if="session.error" class="notice error" role="alert">{{ session.error }}</p>
  </Modal>
</template>
