<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { MAX_DATE_YEAR, MIN_DATE_YEAR, validDate, validInputDate } from '../domain/validation'

const props = withDefaults(
  defineProps<{ modelValue: string; label?: string; allowDay?: boolean; legacyValue?: string }>(),
  { label: '受験年月日', allowDay: false, legacyValue: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const id = useId()
const year = ref('')
const month = ref('')
const day = ref('')
const dayEnabled = ref(false)

const legacyValueAllowed = computed(
  () => props.modelValue === props.legacyValue && validDate(props.legacyValue, props.allowDay),
)
const valuePattern = computed(() =>
  props.allowDay
    ? '^(?:19\\d{2}|20\\d{2}|2100)-\\d{2}(-\\d{2})?$'
    : '^(?:19\\d{2}|20\\d{2}|2100)-\\d{2}$',
)
const yearOutOfRange = computed(() => {
  if (legacyValueAllowed.value) return false
  const match = /^(\d{4,})(?:-|$)/.exec(props.modelValue)
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
const hasDay = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(props.modelValue))
const months = Array.from({ length: 12 }, (_, index) => index + 1)

watch(
  () => props.modelValue,
  (value) => {
    const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value)
    if (match && validDate(`${match[1]}-${match[2]}`, true)) {
      year.value = match[1]
      month.value = match[2]
      day.value = match[3] ?? ''
      dayEnabled.value = Boolean(match[3])
    }
  },
  { immediate: true },
)

function updateYearMonth() {
  if (!/^\d{4}$/.test(year.value) || !/^\d{1,2}$/.test(month.value)) return
  const normalizedMonth = String(Number(month.value)).padStart(2, '0')
  const value = `${year.value}-${normalizedMonth}`
  const selectedDay = hasDay.value ? props.modelValue.slice(8) : ''
  const fullValue = selectedDay ? `${value}-${selectedDay}` : value
  if (
    validInputDate(fullValue, true) ||
    (legacyValueAllowed.value && fullValue === props.legacyValue && validDate(fullValue, true))
  )
    emit('update:modelValue', fullValue)
  else if (
    validInputDate(value) ||
    (legacyValueAllowed.value && value === props.legacyValue.slice(0, 7) && validDate(value))
  )
    emit('update:modelValue', value)
}

function chooseDay(value: string) {
  const fullValue = `${String(year.value).padStart(4, '0')}-${String(Number(month.value)).padStart(2, '0')}-${value}`
  if (
    validInputDate(fullValue, true) ||
    (legacyValueAllowed.value && fullValue === props.legacyValue && validDate(fullValue, true))
  )
    emit('update:modelValue', fullValue)
}

function removeDay() {
  dayEnabled.value = false
  day.value = ''
  const monthValue = props.modelValue.slice(0, 7)
  if (
    validInputDate(monthValue) ||
    (legacyValueAllowed.value &&
      monthValue === props.legacyValue.slice(0, 7) &&
      validDate(monthValue))
  )
    emit('update:modelValue', monthValue)
}

function addDay() {
  dayEnabled.value = true
  day.value = ''
}
</script>

<template>
  <div class="date-picker-control">
    <label :for="`${id}-value`"
      >{{ label }}<span class="required-marker" aria-hidden="true"></span
    ></label>
    <input
      :id="`${id}-value`"
      :value="modelValue"
      required
      maxlength="64"
      :pattern="legacyValueAllowed ? undefined : valuePattern"
      :aria-invalid="yearOutOfRange || undefined"
      :aria-describedby="yearOutOfRange ? `${id}-year-error` : undefined"
      :aria-label="label"
      :placeholder="allowDay ? 'YYYY-MM または YYYY-MM-DD' : 'YYYY-MM'"
      inputmode="numeric"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
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
          pattern="[0-9]{4}"
          placeholder="YYYY"
          required
          :aria-label="`${label}の年`"
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
          v-model="day"
          :required="dayEnabled"
          :aria-label="`${label}の日`"
          @change="chooseDay(day)"
        >
          <option value="" disabled>日を選択</option>
          <option v-for="d in daysInMonth" :key="d" :value="String(d).padStart(2, '0')">
            {{ d }}日
          </option>
        </select>
      </label>
    </div>
    <div v-if="allowDay" class="date-precision-actions">
      <button v-if="!dayEnabled" type="button" class="text-button" @click="addDay">
        日も指定する
      </button>
      <button v-else type="button" class="text-button" @click="removeDay">年月のみにする</button>
    </div>
    <p v-if="yearOutOfRange" :id="`${id}-year-error`" class="notice error" role="alert">
      年は{{ MIN_DATE_YEAR }}年から{{ MAX_DATE_YEAR }}年の範囲で入力してください。
    </p>
  </div>
</template>
