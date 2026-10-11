<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { validDate } from '../domain/validation'

const props = withDefaults(
  defineProps<{ modelValue: string; label?: string; allowDay?: boolean }>(),
  { label: '受験年月・日', allowDay: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const id = useId(),
  open = ref(false),
  year = ref(2024),
  month = ref(1)
const yearOptions = computed(() => Array.from({ length: 9999 }, (_, i) => i + 1))
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
const valuePattern = computed(() =>
  props.allowDay ? '^\\d{4}-\\d{2}(-\\d{2})?$' : '^\\d{4}-\\d{2}$',
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
    if (match && validDate(`${match[1]}-${match[2]}`)) {
      year.value = Number(match[1])
      month.value = Number(match[2])
    }
  },
)
function chooseMonth() {
  emit('update:modelValue', calendarValue.value)
  open.value = false
}
function chooseDay(day: number) {
  const value = `${calendarValue.value}-${String(day).padStart(2, '0')}`
  if (validDate(value, true)) emit('update:modelValue', value)
  open.value = false
}
function clearDay() {
  emit('update:modelValue', calendarValue.value)
  open.value = false
}
function openCalendar() {
  const match = /^(\d{4})-(\d{2})/.exec(props.modelValue)
  if (match) {
    year.value = Number(match[1])
    month.value = Number(match[2])
  }
  open.value = !open.value
}
</script>
<template>
  <div class="date-picker-control">
    <label :for="id">{{ label }}<span class="required-marker" aria-hidden="true">*</span></label>
    <div class="date-input-row">
      <input
        :id="id"
        :value="modelValue"
        required
        :maxlength="allowDay ? 10 : 7"
        :pattern="valuePattern"
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
        ▦
      </button>
    </div>
    <div
      v-if="open"
      :id="`${id}-calendar`"
      class="date-picker-popover"
      role="group"
      :aria-label="`${label}カレンダー`"
    >
      <div class="date-picker-controls">
        <label
          >年<select v-model.number="year" aria-label="年">
            <option v-for="y in yearOptions" :key="y" :value="y">
              {{ String(y).padStart(4, '0') }}
            </option>
          </select></label
        ><label
          >月<select v-model.number="month" aria-label="月">
            <option v-for="m in monthOptions" :key="m" :value="m">{{ m }}月</option>
          </select></label
        >
      </div>
      <template v-if="allowDay"
        ><div class="calendar-weekdays" aria-hidden="true">
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
        </div>
        <button type="button" class="text-button date-month-only" @click="clearDay">
          年月のみで登録
        </button></template
      >
      <button v-else type="button" class="secondary date-month-submit" @click="chooseMonth">
        この年月を選択
      </button>
    </div>
  </div>
</template>
