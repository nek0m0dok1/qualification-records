<script setup lang="ts">
import { computed, ref, useId, watch, onMounted, onUnmounted } from 'vue'
import { MAX_DATE_YEAR, MIN_DATE_YEAR, validDate, validInputDate } from '../domain/validation'

const props = withDefaults(
  defineProps<{ modelValue: string; label?: string; allowDay?: boolean; legacyValue?: string }>(),
  { label: '受験年月・日', allowDay: false, legacyValue: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const id = useId(),
  open = ref(false),
  calendarChanged = ref(false),
  year = ref(2024),
  month = ref(1)
const root = ref<HTMLElement>()
const yearOptions = computed(() =>
  Array.from({ length: MAX_DATE_YEAR - MIN_DATE_YEAR + 1 }, (_, i) => i + MIN_DATE_YEAR),
)
const legacyValueAllowed = computed(
  () =>
    props.legacyValue !== undefined &&
    props.modelValue === props.legacyValue &&
    validDate(props.legacyValue, props.allowDay),
)
const invalidNonemptyValue = computed(
  () => props.modelValue !== '' && !validInputDate(props.modelValue, props.allowDay),
)
const yearOutOfRange = computed(() => {
  if (legacyValueAllowed.value) return false
  const match = /^(\d{4,})(?:-|$)/.exec(props.modelValue)
  if (!match) return false
  const value = Number(match[1])
  return value < MIN_DATE_YEAR || value > MAX_DATE_YEAR
})
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
const valuePattern = computed(() =>
  props.allowDay
    ? '^(?:19\\d{2}|20\\d{2}|2100)-\\d{2}(-\\d{2})?$'
    : '^(?:19\\d{2}|20\\d{2}|2100)-\\d{2}$',
)
const days = computed(() => {
  const date = new Date(0)
  date.setUTCFullYear(year.value, month.value, 0)
  return date.getUTCDate()
})
const offset = computed(() => {
  const date = new Date(0)
  date.setUTCFullYear(year.value, month.value - 1, 1)
  date.setUTCHours(0, 0, 0, 0)
  return date.getUTCDay()
})
const calendarValue = computed(
  () => `${String(year.value).padStart(4, '0')}-${String(month.value).padStart(2, '0')}`,
)
watch(
  () => props.modelValue,
  (value) => {
    const match = /^(\d{4})-(\d{2})/.exec(value)
    if (match && validInputDate(`${match[1]}-${match[2]}`)) {
      year.value = Number(match[1])
      month.value = Number(match[2])
    }
  },
)
function closeCalendar() {
  if (!open.value) return
  if (invalidNonemptyValue.value && !calendarChanged.value) {
    open.value = false
    return
  }
  if (!props.allowDay || props.modelValue.slice(0, 7) !== calendarValue.value)
    emit('update:modelValue', calendarValue.value)
  open.value = false
}
function outside(event: Event) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) closeCalendar()
}
function escape(event: KeyboardEvent) {
  if (open.value && event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeCalendar()
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('focusin', outside)
  document.addEventListener('keydown', escape, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('focusin', outside)
  document.removeEventListener('keydown', escape, true)
})
function chooseDay(day: number) {
  const value = `${calendarValue.value}-${String(day).padStart(2, '0')}`
  if (validInputDate(value, true)) emit('update:modelValue', value)
  open.value = false
}
function clearDay() {
  emit('update:modelValue', calendarValue.value)
  open.value = false
}
function openCalendar() {
  if (open.value) {
    closeCalendar()
    return
  }
  const match = /^(\d{4})-(\d{2})/.exec(props.modelValue)
  calendarChanged.value = false
  if (match && validInputDate(`${match[1]}-${match[2]}`)) {
    year.value = Number(match[1])
    month.value = Number(match[2])
  }
  open.value = !open.value
}
</script>
<template>
  <div ref="root" class="date-picker-control">
    <label :for="id">{{ label }}<span class="required-marker" aria-hidden="true"></span></label>
    <div class="date-input-row">
      <input
        :id="id"
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
      <button
        type="button"
        class="secondary calendar-trigger"
        :aria-expanded="open"
        :aria-controls="`${id}-calendar`"
        :aria-label="`${label}カレンダーを開く`"
        @click="openCalendar"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M17 14h1M7 18h2M12 18h2" />
        </svg>
      </button>
    </div>
    <p v-if="yearOutOfRange" :id="`${id}-year-error`" class="notice error" role="alert">
      年は{{ MIN_DATE_YEAR }}年から{{ MAX_DATE_YEAR }}年の範囲で入力してください。
    </p>
    <div
      v-if="open"
      :id="`${id}-calendar`"
      class="date-picker-popover"
      role="group"
      :aria-label="`${label}カレンダー`"
    >
      <div class="date-picker-controls">
        <label
          >年<select v-model.number="year" aria-label="年" @change="calendarChanged = true">
            <option v-for="y in yearOptions" :key="y" :value="y">
              {{ String(y).padStart(4, '0') }}
            </option>
          </select></label
        ><label
          >月<select v-model.number="month" aria-label="月" @change="calendarChanged = true">
            <option v-for="m in monthOptions" :key="m" :value="m">{{ m }}月</option>
          </select></label
        >
      </div>
      <template v-if="allowDay"
        ><button type="button" class="text-button date-month-only" @click="clearDay">
          年月のみで登録
        </button>
        <div class="calendar-weekdays" aria-hidden="true">
          <span v-for="d in ['日', '月', '火', '水', '木', '金', '土']" :key="d">{{ d }}</span>
        </div>
        <div class="calendar-days">
          <span v-for="n in offset" :key="`empty-${n}`" class="calendar-day-empty"></span
          ><button
            v-for="day in days"
            :key="day"
            type="button"
            class="secondary calendar-day"
            :aria-label="`${year}年${month}月${day}日`"
            @click="chooseDay(day)"
          >
            {{ day }}
          </button>
        </div></template
      >
    </div>
  </div>
</template>
