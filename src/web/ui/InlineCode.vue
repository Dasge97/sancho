<script setup lang="ts">
// Texto que puede llevar nombres de código entre comillas invertidas (`así`), como los que escribe
// el modelo en los hallazgos. Lo de dentro se muestra como código; nunca se interpreta como HTML.
import {computed} from 'vue';
const props = defineProps<{text: string}>();
const parts = computed(() => String(props.text || '').split('`').map((value, i) => ({value, code: i % 2 === 1})));
</script>

<template><template v-for="(p, i) in parts" :key="i"><code v-if="p.code" class="inline-code">{{ p.value }}</code><template v-else>{{ p.value }}</template></template></template>

<style scoped>
.inline-code { padding: 1px 5px; border-radius: var(--radius-sm); background: var(--color-surface-muted); font-size: 0.88em; }
</style>
