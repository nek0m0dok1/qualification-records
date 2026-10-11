<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()
onMounted(() => router.replace('/qualifications'))
</script>
<template><p>保有資格一覧を開いています。</p></template>
