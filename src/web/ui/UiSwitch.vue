<script setup lang="ts">
// Interruptor para un ajuste de sí o no, con su etiqueta y una línea de explicación.
import {useId} from 'vue';
const model = defineModel<boolean>({required: true});
defineProps<{label: string; help?: string; disabled?: boolean}>();
const id = useId();
</script>

<template>
  <div class="switch-row">
    <button :id="id" type="button" role="switch" class="switch" :aria-checked="model" :disabled="disabled" :aria-describedby="help ? id + '-help' : undefined" @click="model = !model">
      <span class="thumb" />
    </button>
    <div>
      <label :for="id" class="label">{{ label }}</label>
      <p v-if="help" :id="id + '-help'" class="help">{{ help }}</p>
    </div>
  </div>
</template>

<style scoped>
.switch-row { display: flex; align-items: flex-start; gap: var(--space-3); }
.switch { position: relative; flex-shrink: 0; width: 40px; height: 24px; margin-top: 1px; border: 0; border-radius: var(--radius-full); background: var(--color-border-strong); transition: background var(--duration) var(--ease); }
.switch[aria-checked="true"] { background: var(--color-primary); }
.thumb { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-1); transition: transform var(--duration) var(--ease); }
.switch[aria-checked="true"] .thumb { transform: translateX(16px); }
.switch:disabled { opacity: 0.55; cursor: not-allowed; }
.label { font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
.help { margin-top: 2px; font-size: var(--text-xs); color: var(--color-text-muted); max-width: 60ch; }
</style>
