<script setup lang="ts">
// Botón con jerarquía: primary (uno por zona), accent (la acción destacada de la pantalla),
// secondary, ghost (acciones menores) y danger. Con `loading` se bloquea y muestra que trabaja.
import {Loader2} from 'lucide-vue-next';
withDefaults(defineProps<{variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; loading?: boolean; disabled?: boolean; type?: 'button' | 'submit'; block?: boolean}>(), {variant: 'secondary', size: 'md', type: 'button'});
</script>

<template>
  <button :type="type" class="btn" :class="[variant, size, {block}]" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <Loader2 v-if="loading" class="spin" :size="16" aria-hidden="true" />
    <slot name="icon" v-else />
    <span><slot /></span>
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  height: var(--control-height); padding: 0 var(--space-4);
  border: 1px solid transparent; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600; white-space: nowrap;
  transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease), transform var(--duration) var(--ease);
}
.btn:active:not(:disabled) { transform: translateY(1px); }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn.sm { height: 32px; padding: 0 var(--space-3); font-size: var(--text-xs); }
.btn.block { width: 100%; }
.btn :deep(svg) { flex-shrink: 0; }

.primary { background: var(--color-primary); color: var(--color-on-primary); }
.primary:hover:not(:disabled) { background: var(--color-primary-hover); }
.accent { background: var(--color-accent); color: var(--color-on-accent); }
.accent:hover:not(:disabled) { background: var(--color-accent-hover); }
.secondary { background: var(--color-surface); border-color: var(--color-border-strong); color: var(--color-text); }
.secondary:hover:not(:disabled) { background: var(--color-surface-hover); }
.ghost { background: transparent; color: var(--color-primary-text); }
.ghost:hover:not(:disabled) { background: var(--color-primary-soft); }
.danger { background: transparent; border-color: var(--color-border-strong); color: var(--color-danger-text); }
.danger:hover:not(:disabled) { background: var(--color-danger-soft); }

.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 767px) {
  .btn { min-height: 44px; }
  .btn.sm { min-height: 40px; }
}
</style>
