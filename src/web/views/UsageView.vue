<script setup lang="ts">
// Consumo del mes: coste estimado, presupuesto (solo avisa, nunca para las revisiones) y
// llamadas a la IA por día y modelo. Las llamadas sin tarifa no cuentan como coste cero.
import {computed} from 'vue';
import {CircleDollarSign, PiggyBank, Sparkles, TriangleAlert} from 'lucide-vue-next';
import {api} from '../lib/api';
import {date, int, usd} from '../lib/format';
import {isAdmin} from '../lib/session';
import {go} from '../lib/ui-state';
import {useLoad} from '../lib/use-load';
import PageHeader from '../ui/PageHeader.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiStat from '../ui/UiStat.vue';

const {data, loading, error, reload} = useLoad(() => api('/usage'));
defineExpose({reload});
const calls = computed(() => (data.value?.days || []).reduce((s: number, d: any) => s + Number(d.calls), 0));
const budgetUsed = computed(() => data.value?.monthly_budget_usd ? Math.min(100, Math.round(100 * data.value.monthly_known_cost / Number(data.value.monthly_budget_usd))) : null);
</script>

<template>
  <PageHeader title="Consumo" description="Controla lo que inviertes en IA. El presupuesto te avisa a tiempo, pero nunca frena las revisiones de tu equipo." />

  <UiNotice v-if="error" tone="danger" title="No se pudo cargar el consumo">
    {{ error }}
    <template #action><UiButton size="sm" @click="reload">Reintentar</UiButton></template>
  </UiNotice>

  <div v-else class="stack">
    <UiSkeleton v-if="loading" kind="stats" />
    <template v-else>
      <UiNotice v-if="data.over_budget" tone="warning" title="Presupuesto superado">Las revisiones continúan. Si quieres gastar menos, pausa algún repositorio.</UiNotice>
      <UiNotice v-else-if="data.budget_warning" tone="warning" title="Has gastado más del 80 % del presupuesto">Las revisiones continúan con normalidad.</UiNotice>
      <UiNotice v-if="data.unknown_cost_calls" tone="info" :title="`${data.unknown_cost_calls} llamadas sin tarifa`">
        No se sabe su coste porque faltan las tarifas del modelo.
        <template v-if="isAdmin" #action><UiButton size="sm" @click="go('ajustes')">Poner tarifas</UiButton></template>
      </UiNotice>

      <div class="grid-stats">
        <UiStat label="Inversión del mes" :value="usd(data.monthly_known_cost)" hint="Estimación; la factura llega de OpenAI" :icon="CircleDollarSign" tone="accent" />
        <UiStat label="Presupuesto" :value="data.monthly_budget_usd ? usd(data.monthly_budget_usd) : 'Sin límite'" :hint="budgetUsed !== null ? `Usado el ${budgetUsed} %` : 'Fíjalo en Ajustes para recibir avisos'" :icon="PiggyBank" />
        <UiStat label="Análisis de IA" :value="int(calls)" hint="Llamadas al modelo este mes" :icon="Sparkles" />
        <UiStat label="Sin tarifa" :value="int(data.unknown_cost_calls)" hint="Llamadas sin coste conocido" :icon="TriangleAlert" :tone="data.unknown_cost_calls ? 'danger' : 'primary'" />
      </div>
      <div v-if="budgetUsed !== null" class="bar" role="progressbar" :aria-valuenow="budgetUsed" aria-valuemin="0" aria-valuemax="100" aria-label="Presupuesto usado">
        <span :style="{width: budgetUsed + '%'}" :class="{warn: data.budget_warning}" />
      </div>
    </template>

    <UiCard flush title="Detalle por día" description="Tokens procesados y coste estimado de cada día, por modelo.">
      <div v-if="loading" class="pad"><UiSkeleton /></div>
      <UiEmpty v-else-if="!data.days.length" :icon="Sparkles" title="Todavía sin consumo este mes" text="En cuanto Sancho revise una pull request, verás aquí lo que ha costado." />
      <div v-else class="table-wrap">
        <table class="table cards">
          <thead><tr><th>Día</th><th>Modelo</th><th class="num">Llamadas</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Coste</th></tr></thead>
          <tbody>
            <tr v-for="(d, i) in data.days" :key="i">
              <td data-label="Día" class="nowrap">{{ date(d.usage_day) }}</td>
              <td data-label="Modelo">{{ d.model }}</td>
              <td data-label="Llamadas" class="num">{{ int(d.calls) }}</td>
              <td data-label="Tokens de entrada" class="num">{{ int(d.input_tokens) }}</td>
              <td data-label="Tokens de salida" class="num">{{ int(d.output_tokens) }}</td>
              <td data-label="Coste" class="num">{{ d.cost_usd === null ? 'Sin tarifa' : usd(d.cost_usd, 4) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>
  </div>
</template>

<style scoped>
.pad { padding: 0 var(--space-6) var(--space-6); }
.bar { height: 8px; border-radius: var(--radius-full); background: var(--color-surface-muted); overflow: hidden; margin-top: calc(-1 * var(--space-2)); }
.bar span { display: block; height: 100%; border-radius: inherit; background: var(--green-400); transition: width 400ms var(--ease); }
.bar span.warn { background: var(--gold-500); }
</style>
