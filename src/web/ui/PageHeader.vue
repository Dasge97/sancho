<script setup lang="ts">
// Cabecera de cada pantalla: qué es (título), para qué sirve (una frase) y la acción principal.
defineProps<{title: string; description: string}>();
</script>

<template>
  <header class="page-header">
    <div class="titles">
      <slot name="before" />
      <h1>{{ title }}</h1>
      <p class="description">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="actions"><slot /></div>
  </header>
</template>

<style scoped>
.page-header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-6); }
.titles { flex: 1 1 420px; min-width: 0; }
h1 { font-size: var(--text-xl); }
.description { margin-top: var(--space-1); color: var(--color-text-muted); max-width: 75ch; }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
@media (max-width: 767px) {
  .description { font-size: var(--text-sm); }
  .actions { width: 100%; }
  .actions > :deep(*) { flex: 1; }
}
</style>
