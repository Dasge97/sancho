<script setup lang="ts">
// Muestra un texto en Markdown (la ficha del proyecto). Lo escribe el modelo o el equipo, así que se
// limpia con DOMPurify antes de pintarlo: nada de scripts ni atributos peligrosos.
import {computed} from 'vue';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
const props = defineProps<{text: string}>();
const html = computed(() => DOMPurify.sanitize(marked.parse(props.text || '', {async: false}) as string));
</script>

<template>
  <div class="markdown" v-html="html" />
</template>

<style scoped>
.markdown { max-width: 80ch; line-height: 1.65; overflow-wrap: anywhere; }
.markdown :deep(h1) { font-size: var(--text-xl); margin: var(--space-6) 0 var(--space-3); }
.markdown :deep(h2) { font-size: var(--text-lg); margin: var(--space-8) 0 var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border); }
.markdown :deep(h3) { font-size: var(--text-md); margin: var(--space-6) 0 var(--space-2); }
.markdown :deep(> :first-child) { margin-top: 0; }
.markdown :deep(p), .markdown :deep(ul), .markdown :deep(ol) { margin: 0 0 var(--space-3); }
.markdown :deep(ul), .markdown :deep(ol) { padding-left: var(--space-6); }
.markdown :deep(li) { margin-bottom: var(--space-1); }
.markdown :deep(code) { padding: 1px 5px; border-radius: var(--radius-sm); background: var(--color-surface-muted); font-size: 0.88em; }
.markdown :deep(pre) { padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--color-surface-muted); overflow-x: auto; }
.markdown :deep(pre code) { padding: 0; background: none; }
.markdown :deep(a) { color: var(--color-primary-text); }
.markdown :deep(table) { border-collapse: collapse; margin: 0 0 var(--space-3); font-size: var(--text-sm); }
.markdown :deep(th), .markdown :deep(td) { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); text-align: left; }
.markdown :deep(blockquote) { margin: 0 0 var(--space-3); padding-left: var(--space-4); border-left: 3px solid var(--color-border-strong); color: var(--color-text-muted); }
</style>
