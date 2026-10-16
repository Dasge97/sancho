<script setup lang="ts">
// Campo de formulario: etiqueta visible encima, el control (slot) y debajo la ayuda o el error.
// El slot recibe `id` y `describedby` para enlazar etiqueta y mensajes con el control.
import {computed, useId} from 'vue';
const props = defineProps<{label: string; help?: string; error?: string; optional?: boolean}>();
const id = useId();
const describedby = computed(() => props.error ? id + '-error' : props.help ? id + '-help' : undefined);
</script>

<template>
  <div class="field">
    <label :for="id" class="label">{{ label }}<span v-if="optional" class="optional"> · opcional</span></label>
    <slot :id="id" :describedby="describedby" :invalid="!!error" />
    <p v-if="error" :id="id + '-error'" class="error" role="alert">{{ error }}</p>
    <p v-else-if="help" :id="id + '-help'" class="help">{{ help }}</p>
  </div>
</template>

<style scoped>
.field { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.label { font-size: var(--text-sm); font-weight: 600; }
.optional { font-weight: 400; color: var(--color-text-muted); }
.help, .error { font-size: var(--text-xs); line-height: 1.4; }
.help { color: var(--color-text-muted); }
.error { color: var(--color-danger-text); font-weight: 500; }
</style>
