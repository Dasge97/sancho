<script setup lang="ts">
// Inicio: cómo va el trabajo (cola, revisiones en curso, consumo del mes) y las últimas revisiones.
import {Activity, CircleDollarSign, Clock, Sparkles} from 'lucide-vue-next';
import {api} from '../lib/api';
import {dateTime, int, relative, reviewState, usd} from '../lib/format';
import {go} from '../lib/ui-state';
import {useLoad} from '../lib/use-load';
import PageHeader from '../ui/PageHeader.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiStat from '../ui/UiStat.vue';

const {data, loading, error, reload} = useLoad(() => api('/dashboard'));
defineExpose({reload});
</script>

<template>
  <PageHeader title="Panel de revisiones" description="Lo que Sancho ha revisado, lo que tiene entre manos y lo que llevas invertido este mes." />

  <UiNotice v-if="error" tone="danger" title="No se pudo cargar el inicio">
    {{ error }}
    <template #action><UiButton size="sm" @click="reload">Reintentar</UiButton></template>
  </UiNotice>

  <div v-else class="stack">
    <UiSkeleton v-if="loading" kind="stats" />
    <div v-else class="grid-stats">
      <UiStat label="En cola" :value="int(data.jobs?.queued)" hint="Pull requests esperando turno" :icon="Clock" />
      <UiStat label="En curso" :value="int(data.jobs?.running)" hint="Analizándose en este momento" :icon="Activity" />
      <UiStat label="Análisis de IA" :value="int(data.usage?.calls)" hint="Llamadas al modelo este mes" :icon="Sparkles" />
      <UiStat label="Inversión del mes" :value="usd(data.usage?.cost)" hint="Calculada con tus tarifas" :icon="CircleDollarSign" tone="accent" />
    </div>

    <UiCard flush title="Actividad reciente" description="Las últimas ocho revisiones. Abre cualquiera para ver qué ha encontrado Sancho.">
      <template #actions><UiButton variant="ghost" size="sm" @click="go('revisiones')">Ver todas</UiButton></template>
      <div v-if="loading" class="pad"><UiSkeleton /></div>
      <UiEmpty v-else-if="!data.reviews.length" title="Tu primera revisión está a un clic" text="Activa un repositorio y Sancho analizará cada pull request en cuanto se abra o reciba cambios.">
        <UiButton variant="primary" @click="go('repositorios')">Elegir repositorios</UiButton>
      </UiEmpty>
      <div v-else class="table-wrap">
        <table class="table cards">
          <thead><tr><th>Pull request</th><th>Repositorio</th><th>Estado</th><th>Fecha</th></tr></thead>
          <tbody>
            <tr v-for="r in data.reviews" :key="r.id" class="clickable" tabindex="0" @click="go('revision', r.id)" @keydown.enter="go('revision', r.id)">
              <td data-label="Pull request"><span class="pr">#{{ r.number }}</span> {{ r.title }}</td>
              <td data-label="Repositorio" class="muted">{{ r.repository }}</td>
              <td data-label="Estado"><UiBadge :tone="reviewState(r.status)[1]">{{ reviewState(r.status)[0] }}</UiBadge></td>
              <td data-label="Fecha" class="nowrap muted" :title="dateTime(r.created_at)">{{ relative(r.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>
  </div>
</template>

<style scoped>
.pad { padding: 0 var(--space-6) var(--space-6); }
.pr { color: var(--color-text-muted); font-variant-numeric: tabular-nums; margin-right: var(--space-1); }
td:first-child { font-weight: 500; }
</style>
