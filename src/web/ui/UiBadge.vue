<script setup lang="ts">
// Insignia de estado: punto de color y texto sobre un fondo muy suave del mismo estado.
import type {Tone} from '../lib/ui-state';
withDefaults(defineProps<{tone?: Tone}>(), {tone: 'neutral'});
</script>

<template>
  <span class="badge" :class="tone"><span class="dot" aria-hidden="true" /><slot /></span>
</template>

<style scoped>
.badge {
  display: inline-flex; align-items: center; gap: 6px;
  height: 24px; padding: 0 10px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs); font-weight: 600; white-space: nowrap;
  background: var(--color-surface-muted); color: var(--color-text-muted);
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.success { background: var(--color-success-soft); color: var(--color-success-text); }
.success .dot { background: var(--state-success-dot); }
.warning { background: var(--color-warning-soft); color: var(--color-warning-text); }
.warning .dot { background: var(--state-warning-dot); }
.info { background: var(--color-info-soft); color: var(--color-info-text); }
.info .dot { background: var(--state-info-dot); }
.danger { background: var(--color-danger-soft); color: var(--color-danger-text); }
.danger .dot { background: var(--state-danger-dot); }
.neutral .dot { background: var(--neutral-500); }
</style>
