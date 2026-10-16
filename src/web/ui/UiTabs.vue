<script setup lang="ts">
// Subpestañas de una pantalla. La activa lleva una línea de 2 px abajo en degradado del color de
// estado activo, que se desvanece hacia los lados (el estilo de Hangar). Flechas izquierda y
// derecha para moverse con el teclado.
import type {Component} from 'vue';
export interface Tab { id: string; label: string; count?: number | string | null; icon?: Component }
const props = defineProps<{tabs: Tab[]; modelValue: string; label: string}>();
const emit = defineEmits<{'update:modelValue': [id: string]}>();

function move(e: KeyboardEvent, i: number) {
  const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -2;
  if (next === -2) return;
  e.preventDefault();
  const tab = props.tabs[(next + props.tabs.length) % props.tabs.length];
  emit('update:modelValue', tab.id);
  (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`[data-tab="${tab.id}"]`)?.focus();
}
</script>

<template>
  <div class="tabs" role="tablist" :aria-label="label">
    <button v-for="(t, i) in tabs" :key="t.id" :data-tab="t.id" type="button" role="tab" class="tab" :class="{on: t.id === modelValue}"
      :aria-selected="t.id === modelValue" :tabindex="t.id === modelValue ? 0 : -1" @click="emit('update:modelValue', t.id)" @keydown="move($event, i)">
      <component :is="t.icon" v-if="t.icon" :size="16" aria-hidden="true" />
      {{ t.label }}
      <span v-if="t.count !== undefined && t.count !== null" class="count tabular">{{ t.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: var(--space-1); margin-bottom: var(--space-6); border-bottom: 1px solid var(--color-border); overflow-x: auto; scrollbar-width: none; }
.tab {
  display: inline-flex; align-items: center; gap: var(--space-2);
  min-height: 44px; padding: 0 var(--space-4);
  border: 0; background: transparent;
  color: var(--color-text-muted); font-size: var(--text-sm); font-weight: 500; white-space: nowrap;
  transition: color var(--duration) var(--ease);
}
.tab:hover { color: var(--color-text); }
.tab.on { color: var(--color-text); font-weight: 600; background: var(--active-line) bottom / 100% 2px no-repeat; }
.tab.on svg { color: var(--color-active); }
.count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: var(--radius-full); background: var(--color-surface-muted); color: var(--color-text-muted); font-size: var(--text-xs); font-weight: 600; line-height: 20px; text-align: center; }
.tab.on .count { background: var(--color-primary-soft); color: var(--color-primary-text); }
</style>
