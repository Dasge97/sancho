<script setup lang="ts">
// Estado vacío: dice por qué no hay nada y ofrece la acción para empezar (slot).
import {Inbox} from 'lucide-vue-next';
import type {Component} from 'vue';
defineProps<{title: string; text?: string; icon?: Component}>();
</script>

<template>
  <div class="empty">
    <div class="icon" aria-hidden="true"><component :is="icon || Inbox" :size="24" /></div>
    <p class="title">{{ title }}</p>
    <p v-if="text" class="text">{{ text }}</p>
    <div v-if="$slots.default" class="action"><slot /></div>
  </div>
</template>

<style scoped>
.empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: var(--space-12) var(--space-4); }
.icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: var(--radius-full); background: var(--color-primary-soft); color: var(--color-primary-text); margin-bottom: var(--space-4); }
.title { font-weight: 600; }
.text { margin-top: var(--space-2); color: var(--color-text-muted); font-size: var(--text-sm); max-width: 48ch; }
.action { margin-top: var(--space-6); }
</style>
