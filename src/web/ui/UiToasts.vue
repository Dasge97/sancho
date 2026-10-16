<script setup lang="ts">
// Avisos emergentes abajo a la derecha (arriba en móvil). Se cierran solos o con la X.
import {CircleAlert, CircleCheck, Info, TriangleAlert, X} from 'lucide-vue-next';
import {dismissToast, toasts} from '../lib/ui-state';
const icons = {success: CircleCheck, warning: TriangleAlert, danger: CircleAlert, info: Info, neutral: Info};
</script>

<template>
  <div class="toasts" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.tone" :role="t.tone === 'danger' ? 'alert' : 'status'">
        <component :is="icons[t.tone]" class="icon" :size="20" aria-hidden="true" />
        <div class="content"><p class="title">{{ t.title }}</p><p v-if="t.text" class="text">{{ t.text }}</p></div>
        <button class="close" type="button" aria-label="Cerrar aviso" @click="dismissToast(t.id)"><X :size="16" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts { position: fixed; z-index: 60; right: var(--space-6); bottom: var(--space-6); display: flex; flex-direction: column; gap: var(--space-2); width: min(380px, calc(100vw - 32px)); }
.toast { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) var(--space-4); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-3); }
.icon { flex-shrink: 0; margin-top: 1px; color: var(--color-info-text); }
.success .icon { color: var(--color-success-text); }
.warning .icon { color: var(--color-warning-text); }
.danger .icon { color: var(--color-danger-text); }
.content { flex: 1; min-width: 0; font-size: var(--text-sm); }
.title { font-weight: 600; }
.text { color: var(--color-text-muted); overflow-wrap: anywhere; }
.close { display: grid; place-items: center; width: 28px; height: 28px; margin: -4px -8px 0 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); }
.close:hover { background: var(--color-surface-hover); }
.toast-enter-active, .toast-leave-active { transition: opacity var(--duration) var(--ease), transform var(--duration) var(--ease); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
@media (max-width: 767px) { .toasts { top: var(--space-4); bottom: auto; right: var(--space-4); } }
</style>
