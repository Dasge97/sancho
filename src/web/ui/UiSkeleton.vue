<script setup lang="ts">
// Bloques grises con la forma del contenido mientras carga: filas de tabla o tarjetas de cifras.
withDefaults(defineProps<{kind?: 'rows' | 'stats' | 'text'; count?: number}>(), {kind: 'rows', count: 4});
</script>

<template>
  <div class="skeleton" :class="kind" aria-hidden="true">
    <template v-if="kind === 'stats'"><div v-for="i in count" :key="i" class="stat"><span class="b w40" /><span class="b big w60" /></div></template>
    <template v-else-if="kind === 'text'"><span v-for="i in count" :key="i" class="b" :class="i === count ? 'w60' : 'w100'" /></template>
    <template v-else><div v-for="i in count" :key="i" class="row"><span class="b w30" /><span class="b w20" /><span class="b w15" /></div></template>
  </div>
  <span class="sr-only" role="status">Cargando…</span>
</template>

<style scoped>
.b { display: block; height: 12px; border-radius: var(--radius-sm); background: var(--color-skeleton); animation: pulse 1.4s ease-in-out infinite; }
.big { height: 28px; margin-top: var(--space-3); }
.w100 { width: 100%; } .w60 { width: 60%; } .w40 { width: 40%; } .w30 { width: 30%; } .w20 { width: 20%; } .w15 { width: 15%; }
.rows .row { display: flex; gap: var(--space-6); padding: var(--space-4) 0; border-bottom: 1px solid var(--color-border); }
.rows .row:last-child { border-bottom: 0; }
.stats { display: grid; gap: var(--space-4); grid-template-columns: repeat(2, minmax(0, 1fr)); }
.stat { padding: var(--space-6); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.text { display: flex; flex-direction: column; gap: var(--space-3); }
@media (min-width: 768px) { .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@keyframes pulse { 50% { opacity: 0.5; } }
</style>
