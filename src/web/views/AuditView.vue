<script setup lang="ts">
// Auditoría (solo administración): quién cambió qué ajuste o cuenta, y cuándo. Últimos 200 cambios.
import {History} from 'lucide-vue-next';
import {api} from '../lib/api';
import {auditAction, dateTime} from '../lib/format';
import {useLoad} from '../lib/use-load';
import PageHeader from '../ui/PageHeader.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';

const {data: events, loading, error, reload} = useLoad(() => api<any[]>('/audit'));
defineExpose({reload});
</script>

<template>
  <PageHeader title="Auditoría" description="Quién ha cambiado qué y cuándo: conexiones, ajustes y cuentas. Se guardan los últimos 200 cambios." />

  <UiNotice v-if="error" tone="danger" title="No se pudo cargar la auditoría">
    {{ error }}
    <template #action><UiButton size="sm" @click="reload">Reintentar</UiButton></template>
  </UiNotice>

  <UiCard v-else flush>
    <div v-if="loading" class="pad"><UiSkeleton :count="6" /></div>
    <UiEmpty v-else-if="!events?.length" :icon="History" title="Sin cambios registrados" text="Cada cambio de conexiones, ajustes o cuentas quedará anotado aquí con su autor." />
    <div v-else class="table-wrap">
      <table class="table cards">
        <thead><tr><th>Fecha</th><th>Quién</th><th>Qué hizo</th></tr></thead>
        <tbody>
          <tr v-for="e in events" :key="e.id">
            <td data-label="Fecha" class="nowrap muted tabular">{{ dateTime(e.created_at) }}</td>
            <td data-label="Quién">{{ e.actor || 'Sistema' }}</td>
            <td data-label="Qué hizo">{{ auditAction(e.action) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </UiCard>
</template>

<style scoped>
.pad { padding: var(--space-6); }
</style>
