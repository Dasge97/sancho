<script setup lang="ts">
// Ventana de confirmación propia (en lugar de confirm() del navegador). Si trae `copyValue`,
// muestra el valor con un botón para copiarlo: así se entregan los enlaces de activación.
import {nextTick, ref, watch} from 'vue';
import {Check, Copy} from 'lucide-vue-next';
import UiButton from './UiButton.vue';
import {closeDialog, dialog} from '../lib/ui-state';

const panel = ref<HTMLElement | null>(null);
const copied = ref(false);
watch(() => dialog.open, async open => {
  copied.value = false;
  if (open) { await nextTick(); panel.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }
});
async function copy() {
  try { await navigator.clipboard.writeText(dialog.options?.copyValue || ''); copied.value = true; } catch { copied.value = false; }
}
</script>

<template>
  <Transition name="dialog">
    <div v-if="dialog.open && dialog.options" class="backdrop" @click.self="closeDialog(false)" @keydown.esc="closeDialog(false)">
      <div ref="panel" class="panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title" class="title">{{ dialog.options.title }}</h2>
        <p v-if="dialog.options.text" class="text">{{ dialog.options.text }}</p>
        <div v-if="dialog.options.copyValue" class="copy">
          <code class="value">{{ dialog.options.copyValue }}</code>
          <UiButton size="sm" @click="copy"><template #icon><Check v-if="copied" :size="14" /><Copy v-else :size="14" /></template>{{ copied ? 'Copiado' : 'Copiar' }}</UiButton>
        </div>
        <div class="actions">
          <UiButton v-if="dialog.options.cancelLabel !== null" variant="ghost" @click="closeDialog(false)">{{ dialog.options.cancelLabel || 'Cancelar' }}</UiButton>
          <UiButton :variant="dialog.options.danger ? 'danger' : 'primary'" data-autofocus @click="closeDialog(true)">{{ dialog.options.confirmLabel || 'Aceptar' }}</UiButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: var(--space-4); background: rgb(8 23 15 / 0.55); }
.panel { width: min(480px, 100%); padding: var(--space-6); background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-3); }
.title { font-size: var(--text-lg); }
.text { margin-top: var(--space-2); color: var(--color-text-muted); font-size: var(--text-sm); }
.copy { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3); background: var(--color-surface-muted); border-radius: var(--radius-md); }
.value { flex: 1; min-width: 0; font-size: var(--text-xs); overflow-wrap: anywhere; }
.actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-6); }
.dialog-enter-active, .dialog-leave-active { transition: opacity var(--duration) var(--ease); }
.dialog-enter-active .panel, .dialog-leave-active .panel { transition: transform var(--duration) var(--ease); }
.dialog-enter-from, .dialog-leave-to { opacity: 0; }
.dialog-enter-from .panel, .dialog-leave-to .panel { transform: translateY(8px) scale(0.98); }
</style>
