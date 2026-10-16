<script setup lang="ts">
// Aviso dentro de la página: borde fino, línea del color del estado a la izquierda e icono.
// El texto dice qué pasa; el slot `action` lleva al arreglo.
import {CircleAlert, CircleCheck, Info, TriangleAlert} from 'lucide-vue-next';
import type {Tone} from '../lib/ui-state';
const props = withDefaults(defineProps<{tone?: Tone; title?: string}>(), {tone: 'info'});
const icons = {success: CircleCheck, warning: TriangleAlert, danger: CircleAlert, info: Info, neutral: Info};
</script>

<template>
  <div class="notice" :class="props.tone" :role="props.tone === 'danger' ? 'alert' : 'status'">
    <component :is="icons[props.tone]" class="icon" :size="20" aria-hidden="true" />
    <div class="content">
      <p v-if="title" class="title">{{ title }}</p>
      <div class="text"><slot /></div>
    </div>
    <div v-if="$slots.action" class="action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.notice {
  display: flex; align-items: flex-start; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--state-info-dot);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.icon { flex-shrink: 0; margin-top: 1px; color: var(--color-info-text); }
.content { flex: 1; min-width: 0; }
.title { font-weight: 600; }
.text { color: var(--color-text-muted); }
.title + .text { margin-top: 2px; }
.action { flex-shrink: 0; align-self: center; }
.success { border-left-color: var(--state-success-dot); }
.success .icon { color: var(--color-success-text); }
.warning { border-left-color: var(--state-warning-dot); }
.warning .icon { color: var(--color-warning-text); }
.danger { border-left-color: var(--state-danger-dot); }
.danger .icon { color: var(--color-danger-text); }
.neutral { border-left-color: var(--color-border-strong); }
.neutral .icon { color: var(--color-text-muted); }
@media (max-width: 767px) { .notice { flex-wrap: wrap; } .action { width: 100%; padding-left: 32px; } }
</style>
