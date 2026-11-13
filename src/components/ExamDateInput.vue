<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { MAX_DATE_YEAR, MIN_DATE_YEAR, validDate, validInputDate } from '../domain/validation'

const props = withDefaults(
  defineProps<{ modelValue: string; label?: string; allowDay?: boolean; legacyValue?: string }>(),
  { label: '受験年月日', allowDay: false, legacyValue: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const id = useId()
const valueInput = ref<HTMLInputElement>()
const dayInput = ref<HTMLSelectElement>()
const draftValue = ref(props.modelValue)
const year = ref('')
const month = ref('')
const day = ref('')
const dayEnabled = ref(false)
const pendingLocalEcho = ref<{ from: string; to: string } | null>(null)

const legacyValueAllowed = computed(
  () => draftValue.value === props.legacyValue && validDate(props.legacyValue, props.allowDay),
)
const valuePattern = computed(() =>
  props.allowDay
    ? '^(?:19\\d{2}|20\\d{2}|2100)-\\d{2}(-\\d{2})?$'
    : '^(?:19\\d{2}|20\\d{2}|2100)-\\d{2}$',
)
const yearPattern = computed(() =>
  legacyValueAllowed.value ? '[0-9]{4}' : '^(?:19\\d{2}|20\\d{2}|2100)$',
)
const draftIsValid = computed(
  () =>
    validInputDate(draftValue.value, props.allowDay) ||
    (legacyValueAllowed.value && validDate(draftValue.value, props.allowDay)),
)
const yearOutOfRange = computed(() => {
  if (legacyValueAllowed.value) return false
  const match = /^(\d{4,})(?:-|$)/.exec(draftValue.value)
  if (!match) return false
  const value = Number(match[1])
  return value < MIN_DATE_YEAR || value > MAX_DATE_YEAR
})
const daysInMonth = computed(() => {
  const y = Number(year.value)
  const m = Number(month.value)
  if (!y || m < 1 || m > 12) return 0
  const date = new Date(0)
  date.setUTCFullYear(y, m, 0)
  return date.getUTCDate()
})
const selectedDayIsInvalid = computed(() => {
  if (!dayEnabled.value || !day.value || !year.value || !month.value) return false
  const selectedDate = `${year.value}-${month.value}-${day.value}`
  return !(
    validInputDate(selectedDate, true) ||
    (legacyValueAllowed.value &&
      selectedDate === props.legacyValue &&
      validDate(selectedDate, true))
  )
})
const months = Array.from({ length: 12 }, (_, index) => index + 1)

function syncParts(value: string, preserveDayMode = false) {
  if (!value) {
    year.value = ''
    month.value = ''
    day.value = ''
    if (!preserveDayMode) dayEnabled.value = false
    return
  }

  const match = /^(\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(value)
  if (!match) {
    year.value = ''
    month.value = ''
    day.value = ''
    if (!preserveDayMode) dayEnabled.value = false
    return
  }

  year.value = match[1]
  month.value =
    match[2] && Number(match[2]) >= 1 && Number(match[2]) <= 12
      ? String(Number(match[2])).padStart(2, '0')
      : ''
  day.value = match[3] ? String(Number(match[3])).padStart(2, '0') : ''
  dayEnabled.value = Boolean(match[3]) || (preserveDayMode && dayEnabled.value)
}

function emitLocalValue(value: string) {
  if (value === props.modelValue) {
    pendingLocalEcho.value = null
    return
  }
  pendingLocalEcho.value = { from: props.modelValue, to: value }
  emit('update:modelValue', value)
}

function setDraft(value: string) {
  draftValue.value = value
  if (draftIsValid.value) emitLocalValue(value)
}

function readRawValue(event: Event) {
  const value = (event.target as HTMLInputElement).value
  draftValue.value = value
  syncParts(value, true)
  if (draftIsValid.value) emitLocalValue(value)
}

function composeValue() {
  if (!year.value || !month.value) return year.value || ''
  const monthValue = `${year.value}-${month.value}`
  return dayEnabled.value && day.value ? `${monthValue}-${day.value}` : monthValue
}

function updateYearMonth() {
  const value = composeValue()
  setDraft(value)
}

function chooseDay(value: string) {
  day.value = value
  setDraft(composeValue())
}

function removeDay() {
  dayEnabled.value = false
  day.value = ''
  const value = year.value && month.value ? `${year.value}-${month.value}` : composeValue()
  setDraft(value)
}

function addDay() {
  dayEnabled.value = true
  day.value = ''
  setDraft(composeValue())
}

watch(
  () => props.modelValue,
  (value, oldValue) => {
    const localEcho = pendingLocalEcho.value
    if (localEcho && localEcho.from === oldValue && localEcho.to === value) {
      pendingLocalEcho.value = null
      draftValue.value = value
      return
    }
    pendingLocalEcho.value = null
    draftValue.value = value
    syncParts(value)
  },
  { immediate: true },
)

watch(
  [draftIsValid, selectedDayIsInvalid],
  async () => {
    await nextTick()
    valueInput.value?.setCustomValidity(
      draftIsValid.value
        ? ''
        : `日付は${MIN_DATE_YEAR}年から${MAX_DATE_YEAR}年の有効な形式で入力してください。`,
    )
    dayInput.value?.setCustomValidity(
      selectedDayIsInvalid.value ? 'この年月に存在する日を選び直してください。' : '',
    )
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <div class="date-picker-control">
    <label :for="`${id}-value`"
      >{{ label }}<span class="required-marker" aria-hidden="true"></span
    ></label>
    <input
      :id="`${id}-value`"
      ref="valueInput"
      :value="draftValue"
      required
      maxlength="64"
      :pattern="legacyValueAllowed ? undefined : valuePattern"
      :aria-invalid="!draftIsValid || undefined"
      :aria-describedby="yearOutOfRange ? `${id}-year-error` : undefined"
      :aria-label="label"
      :placeholder="allowDay ? 'YYYY-MM または YYYY-MM-DD' : 'YYYY-MM'"
      inputmode="numeric"
      @input="readRawValue"
    />
    <div class="date-picker-controls">
      <label :for="`${id}-year`"
        >年
        <input
          :id="`${id}-year`"
          v-model="year"
          type="text"
          inputmode="numeric"
          maxlength="4"
          :pattern="yearPattern"
          placeholder="YYYY"
          required
          :aria-label="`${label}の年`"
          @input="updateYearMonth"
          @change="updateYearMonth"
        />
      </label>
      <label :for="`${id}-month`"
        >月
        <select
          :id="`${id}-month`"
          v-model="month"
          required
          :aria-label="`${label}の月`"
          @change="updateYearMonth"
        >
          <option value="" disabled>月を選択</option>
          <option v-for="m in months" :key="m" :value="String(m).padStart(2, '0')">
            {{ m }}月
          </option>
        </select>
      </label>
      <label v-if="allowDay && dayEnabled" :for="`${id}-day`"
        >日
        <select
          :id="`${id}-day`"
          ref="dayInput"
          v-model="day"
          required
          :aria-label="`${label}の日`"
          :aria-invalid="selectedDayIsInvalid || undefined"
          @change="chooseDay(day)"
        >
          <option value="" disabled>日を選択</option>
          <option v-if="day && Number(day) > daysInMonth" :value="day" disabled>
            {{ Number(day) }}日（選び直してください）
          </option>
          <option v-for="d in daysInMonth" :key="d" :value="String(d).padStart(2, '0')">
            {{ d }}日
          </option>
        </select>
      </label>
    </div>
    <div v-if="allowDay" class="date-precision-actions">
      <button v-if="!dayEnabled" type="button" class="text-button add-day-button" @click="addDay">
        日も指定する
      </button>
      <button v-else type="button" class="text-button" @click="removeDay">年月のみにする</button>
    </div>
    <p v-if="yearOutOfRange" :id="`${id}-year-error`" class="notice error" role="alert">
      年は{{ MIN_DATE_YEAR }}年から{{ MAX_DATE_YEAR }}年の範囲で入力してください。
    </p>
  </div>
</template>
