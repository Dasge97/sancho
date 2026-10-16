<script setup lang="ts">
// Calidad de las revisiones: qué parte de lo que publica Sancho le sirve al equipo. Se calcula con
// los votos del panel y con lo que pasa con cada comentario (arreglado o retirado tras una respuesta).
import {computed, ref, watch} from 'vue';
import {Gauge, MessageSquareX, ShieldCheck, Target, Wrench} from 'lucide-vue-next';
import {api} from '../lib/api';
import {category, dateTime, int, severity} from '../lib/format';
import {go} from '../lib/ui-state';
import {useLoad} from '../lib/use-load';
import InlineCode from '../ui/InlineCode.vue';
import PageHeader from '../ui/PageHeader.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiStat from '../ui/UiStat.vue';
import UiTabs from '../ui/UiTabs.vue';

interface Group { key: string; issues: number; useful: number; false_positive: number; no_signal: number; precision: number | null }
const days = ref('90');
const periods = [{id: '30', label: '30 días'}, {id: '90', label: '90 días'}, {id: '365', label: 'Un año'}];
const {data, loading, error, reload} = useLoad(() => api<any>(`/quality?days=${days.value}`));
watch(days, reload);
defineExpose({reload});

// Con menos de 5 señales, el porcentaje engaña más de lo que informa.
const MIN_SIGNALS = 5;
const pct = (g: Group) => g.precision === null || g.useful + g.false_positive < MIN_SIGNALS ? '—' : `${Math.round(g.precision * 100)} %`;
const totals = computed(() => data.value?.totals);
const signals = computed(() => totals.value ? totals.value.useful + totals.value.false_positive : 0);
const origins: Record<string, string> = {modelo: 'IA', gitleaks: 'Secretos (gitleaks)', php: 'Sintaxis de PHP'};
const sections = computed(() => data.value ? [
  {title: 'Por tipo de problema', label: 'Tipo', rows: data.value.by_category as Group[], name: category},
  {title: 'Por gravedad', label: 'Gravedad', rows: data.value.by_severity as Group[], name: (k: string) => severity(k)[0]},
  {title: 'Por origen', label: 'Origen', rows: data.value.by_origin as Group[], name: (k: string) => origins[k] || k},
  {title: 'Por repositorio', label: 'Repositorio', rows: data.value.by_repository as Group[], name: (k: string) => k},
] : []);
</script>

<template>
  <PageHeader title="Calidad" description="Cuánto de lo que señala Sancho le sirve a tu equipo. Sale de los votos en el panel y de lo que pasa con cada comentario en Bitbucket.">
    <UiTabs v-model="days" :tabs="periods" label="Periodo" />
  </PageHeader>

  <UiNotice v-if="error" tone="danger" title="No se pudo cargar la calidad">
    {{ error }}
    <template #action><UiButton size="sm" @click="reload">Reintentar</UiButton></template>
  </UiNotice>

  <div v-else class="stack">
    <UiSkeleton v-if="loading" kind="stats" />
    <template v-else-if="totals">
      <div class="grid-stats">
        <UiStat label="Acierto" :value="pct(totals)" :hint="signals < MIN_SIGNALS ? `Hacen falta ${MIN_SIGNALS} señales; hay ${signals}` : `${int(totals.useful)} útiles de ${int(signals)} con señal`" :icon="Target" tone="accent" />
        <UiStat label="Problemas publicados" :value="int(totals.issues)" :hint="`En ${int(data.reviews)} revisiones`" :icon="ShieldCheck" />
        <UiStat label="Arreglados con un commit" :value="int(totals.fixed_by_commit)" hint="Sancho vio el arreglo y cerró el comentario" :icon="Wrench" />
        <UiStat label="Falsos positivos" :value="int(totals.false_positive)" :hint="`${int(totals.withdrawn)} retirados tras una respuesta en la PR`" :icon="MessageSquareX" :tone="totals.false_positive ? 'danger' : 'primary'" />
      </div>
      <UiNotice v-if="totals.no_signal" tone="info" :title="`${int(totals.no_signal)} problemas sin señal`">
        Nadie los ha votado ni se han arreglado todavía. Para medir mejor, marca en cada revisión si un problema te ha servido o es un falso positivo.
      </UiNotice>
    </template>

    <UiCard v-if="!loading && totals && !totals.issues">
      <UiEmpty :icon="Gauge" title="Todavía no hay nada que medir" text="Cuando Sancho publique problemas y el equipo los vote o los arregle, verás aquí cuánto acierta." />
    </UiCard>

    <template v-else-if="!loading && data">
      <UiCard flush title="Por versión de las instrucciones" description="Cada vez que cambian las instrucciones o las reglas, cambia la versión. Compara el acierto antes y después de cada cambio.">
        <div class="table-wrap">
          <table class="table cards">
            <thead><tr><th>Versión</th><th>Desde</th><th>Motor</th><th class="num">Problemas</th><th class="num">Útiles</th><th class="num">Falsos positivos</th><th class="num">Acierto</th></tr></thead>
            <tbody>
              <tr v-for="g in data.by_prompt" :key="g.key">
                <td data-label="Versión"><code>{{ g.key }}</code></td>
                <td data-label="Desde" class="nowrap">{{ dateTime(g.first_seen) }}</td>
                <td data-label="Motor">{{ g.engine === 'agent' ? 'Agente de Claude' : g.engine === 'openai' ? 'OpenAI' : '—' }}</td>
                <td data-label="Problemas" class="num">{{ int(g.issues) }}</td>
                <td data-label="Útiles" class="num">{{ int(g.useful) }}</td>
                <td data-label="Falsos positivos" class="num">{{ int(g.false_positive) }}</td>
                <td data-label="Acierto" class="num strong">{{ pct(g) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>

      <div class="two">
        <UiCard v-for="s in sections" :key="s.title" flush :title="s.title">
          <div class="table-wrap">
            <table class="table cards">
              <thead><tr><th>{{ s.label }}</th><th class="num">Problemas</th><th class="num">Útiles</th><th class="num">Falsos</th><th class="num">Acierto</th></tr></thead>
              <tbody>
                <tr v-for="g in s.rows" :key="g.key">
                  <td :data-label="s.label">{{ s.name(g.key) }}</td>
                  <td data-label="Problemas" class="num">{{ int(g.issues) }}</td>
                  <td data-label="Útiles" class="num">{{ int(g.useful) }}</td>
                  <td data-label="Falsos positivos" class="num">{{ int(g.false_positive) }}</td>
                  <td data-label="Acierto" class="num strong">{{ pct(g) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiCard>
      </div>

      <UiCard title="Últimos falsos positivos" description="Lo que el equipo ha marcado como falso positivo, con su motivo. Es la mejor pista para ajustar las instrucciones o las reglas.">
        <UiEmpty v-if="!data.recent_false_positives.length" :icon="ShieldCheck" title="Ningún falso positivo en este periodo" text="Si Sancho se equivoca, márcalo en la revisión y explica por qué: lo aprenderá para ese repositorio." />
        <ul v-else class="misses">
          <li v-for="(m, i) in data.recent_false_positives" :key="i">
            <a href="#" class="title" @click.prevent="go('revision', m.run_id)"><InlineCode :text="m.short_title || m.title" /></a>
            <span class="muted small">{{ m.repository }} · <code>{{ m.path }}:{{ m.start_line }}</code> · {{ category(m.category) }} · {{ dateTime(m.created_at) }}</span>
            <p v-if="m.reason" class="reason">{{ m.reason }}</p>
            <p v-else class="muted small">Sin motivo.</p>
          </li>
        </ul>
      </UiCard>
    </template>
  </div>
</template>

<style scoped>
.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6); }
.strong { font-weight: 700; }
.misses { list-style: none; margin: 0; padding: 0; }
.misses li { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-4) 0; border-bottom: 1px solid var(--color-border); }
.misses li:last-child { border-bottom: 0; }
.title { font-weight: 600; }
.small { font-size: var(--text-xs); }
.reason { max-width: 85ch; padding-left: var(--space-3); border-left: 3px solid var(--color-active); font-size: var(--text-sm); }
@media (max-width: 1023px) { .two { grid-template-columns: 1fr; } }
</style>
