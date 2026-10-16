<script setup lang="ts">
// Tarjeta de contenido con cabecera opcional: título, una frase y acciones a la derecha.
// `flush` quita el relleno del cuerpo para que una tabla llegue a los bordes.
defineProps<{title?: string; description?: string; flush?: boolean}>();
</script>

<template>
  <section class="card" :class="{flush}">
    <header v-if="title || $slots.actions" class="head">
      <div class="titles">
        <h2 v-if="title" class="title">{{ title }}</h2>
        <p v-if="description" class="description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-1);
  padding: var(--space-6);
  min-width: 0;
}
.card.flush { padding: 0; overflow: hidden; }
.head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-6); }
.flush .head { margin: 0; padding: var(--space-6) var(--space-6) var(--space-4); }
.titles { min-width: 0; }
.title { font-size: var(--text-md); font-weight: 600; }
.description { margin-top: var(--space-1); color: var(--color-text-muted); font-size: var(--text-sm); max-width: 75ch; }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.flush :deep(.table-wrap) { margin: 0; }
@media (max-width: 767px) {
  .card { padding: var(--space-4); border-radius: var(--radius-md); }
  .flush .head { padding: var(--space-4) var(--space-4) var(--space-3); }
}
</style>
