<script setup lang="ts">
// Cifra destacada: etiqueta, valor grande y una línea de contexto. El icono va en un círculo
// suave del tono indicado (el amarillo de apoyo se reserva para lo que pide atención).
import type {Component} from 'vue';
withDefaults(defineProps<{label: string; value: string | number; hint?: string; icon?: Component; tone?: 'primary' | 'accent' | 'danger'}>(), {tone: 'primary'});
</script>

<template>
  <article class="stat">
    <div class="top">
      <span class="label">{{ label }}</span>
      <span v-if="icon" class="icon" :class="tone" aria-hidden="true"><component :is="icon" :size="18" /></span>
    </div>
    <p class="value tabular">{{ value }}</p>
    <p v-if="hint" class="hint">{{ hint }}</p>
  </article>
</template>

<style scoped>
.stat { padding: var(--space-6); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-1); min-width: 0; }
.top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.label { font-size: var(--text-sm); color: var(--color-text-muted); font-weight: 500; }
.icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--radius-full); flex-shrink: 0; }
.icon.primary { background: var(--color-primary-soft); color: var(--color-primary-text); }
.icon.accent { background: var(--color-accent-soft); color: var(--color-warning-text); }
.icon.danger { background: var(--color-danger-soft); color: var(--color-danger-text); }
.value { margin-top: var(--space-3); font-size: var(--text-2xl); font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; overflow-wrap: anywhere; }
.hint { margin-top: var(--space-1); font-size: var(--text-xs); color: var(--color-text-muted); }
@media (max-width: 767px) { .stat { padding: var(--space-4); } .value { font-size: var(--text-xl); } }
</style>
