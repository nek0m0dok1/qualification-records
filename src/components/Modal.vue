<script setup lang="ts">
import { ref, onMounted, onUnmounted, useId } from 'vue'
defineProps<{ title: string; busy?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const element = ref<HTMLDialogElement>()
const titleId = useId()
const previous = document.activeElement as HTMLElement | null
onMounted(() => element.value?.showModal())
onUnmounted(() => previous?.focus())
</script>
<template>
  <dialog ref="element" :aria-labelledby="titleId" @cancel.prevent="!busy && emit('close')">
    <header class="modal-heading"><h2 :id="titleId">{{ title }}</h2><button type="button" class="icon-button" aria-label="閉じる" :disabled="busy" @click="emit('close')">×</button></header>
    <slot />
  </dialog>
</template>
