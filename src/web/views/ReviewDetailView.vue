<script setup lang="ts">
// Detalle de una revisión: estado, hallazgos con su explicación completa, qué se revisó
// (cobertura) y su consumo. Mientras está en cola o analizándose, se actualiza sola.
import {computed, onBeforeUnmount, ref, watch} from 'vue';
import {ExternalLink, Loader2, ThumbsDown, ThumbsUp} from 'lucide-vue-next';
import {api, errorMessage, post} from '../lib/api';
import {category, dateTime, int, publicationState, reviewState, severity, usd} from '../lib/format';
import {crumbTail, notify, route, setTab} from '../lib/ui-state';
import PageHeader from '../ui/PageHeader.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiTabs from '../ui/UiTabs.vue';

const props = defineProps<{id: string}>();
const data = ref<any>(null), error = ref(''), voted = ref<Record<string, string>>({});
let timer: ReturnType<typeof setTimeout> | undefined;

const running = computed(() => ['queued', 'analyzing'].includes(data.value?.run.status) || data.value?.run.publication_status === 'pending');
const coverage = computed(() => data.value?.run.coverage || {});
const tab = computed({get: () => ['problemas', 'cobertura', 'consumo'].includes(route.tab || '') ? route.tab! : 'problemas', set: setTab});
const tabs = computed(() => [
  {id: 'problemas', label: 'Problemas', count: data.value?.findings.length ?? 0},
  {id: 'cobertura', label: 'Qué se ha revisado'},
  {id: 'consumo', label: 'Consumo', count: data.value?.usage.length ?? 0},
]);
const totalCost = computed(() => (data.value?.usage || []).reduce((s: number, u: any) => s + Number(u.cost_usd || 0), 0));

async function load() {
  clearTimeout(timer);
  try { data.value = await api(`/reviews/${props.id}`); error.value = ''; crumbTail.value = `#${data.value.run.number} · ${data.value.run.title}`; }
  catch (e) { error.value = errorMessage(e); }
  if (running.value) timer = setTimeout(load, 3000);
}
watch(() => props.id, () => { data.value = null; load(); }, {immediate: true});
onBeforeUnmount(() => clearTimeout(timer));
defineExpose({reload: load});

function openInBitbucket() { window.open(data.value.run.url, '_blank', 'noopener'); }

async function vote(findingId: string, value: 'useful' | 'false_positive') {
  try {
    await post(`/findings/${findingId}/feedback`, {vote: value});
    voted.value[findingId] = value;
    notify('success', 'Gracias por tu opinión', value === 'useful' ? 'Marcado como útil.' : 'Marcado como falso positivo; ayuda a afinar las revisiones.');
  } catch (e) { notify('danger', 'No se pudo guardar tu opinión', errorMessage(e)); }
}
</script>

<template>
  <UiNotice v-if="error && !data" tone="danger" title="No se pudo cargar la revisión">
    {{ error }}
    <template #action><UiButton size="sm" @click="load">Reintentar</UiButton></template>
  </UiNotice>

  <template v-else-if="!data">
    <UiSkeleton kind="text" :count="2" />
    <div style="height: 32px" />
    <UiCard><UiSkeleton :count="3" /></UiCard>
  </template>

  <template v-else>
    <PageHeader :title="`#${data.run.number} · ${data.run.title}`" :description="`${data.run.repository} · ${dateTime(data.run.created_at)}`">
      <UiButton v-if="data.run.url && data.run.url !== '#'" variant="secondary" @click="openInBitbucket"><template #icon><ExternalLink :size="16" /></template>Abrir en Bitbucket</UiButton>
    </PageHeader>

    <div class="stack">
      <div class="status-row">
        <UiBadge :tone="reviewState(data.run.status)[1]">{{ reviewState(data.run.status)[0] }}</UiBadge>
        <UiBadge :tone="publicationState(data.run.publication_status)[1]">{{ publicationState(data.run.publication_status)[0] }}</UiBadge>
        <span v-if="data.run.model" class="muted small">Modelo {{ data.run.model }}</span>
      </div>

      <UiNotice v-if="running" tone="info" title="Sancho está revisando esta pull request">
        <span class="inline-spin"><Loader2 :size="14" class="spin" aria-hidden="true" />Los resultados aparecerán aquí solos, normalmente en menos de un minuto.</span>
      </UiNotice>
      <UiNotice v-else-if="data.run.status === 'failed'" tone="danger" title="La revisión no se pudo completar">
        Que falle no significa que el código esté limpio. Vuelve a pedirla desde Repositorios; si se repite, comprueba la conexión con OpenAI en Ajustes.
      </UiNotice>
      <UiNotice v-else-if="coverage.limitations?.length" tone="warning" title="Revisión parcial">
        {{ coverage.limitations.join(' ') }}
      </UiNotice>

      <UiCard v-if="data.run.summary && !running" title="Conclusión de Sancho">
        <p class="summary">{{ data.run.summary }}</p>
      </UiCard>

      <div>
      <UiTabs v-model="tab" :tabs="tabs" label="Detalle de la revisión" />
      <UiCard v-if="tab === 'problemas'" title="Problemas encontrados" description="Cada problema está verificado contra el código que añade la pull request, en la línea exacta.">
        <UiEmpty v-if="!data.findings.length" :title="running ? 'Analizando el código…' : 'Ningún problema a la vista'" :text="running ? 'Los problemas aparecerán aquí en cuanto termine.' : 'Sancho no ha encontrado problemas en lo que ha revisado. En «Qué se ha revisado» tienes el alcance exacto.'" />
        <ol v-else class="findings">
          <li v-for="f in data.findings" :key="f.id" class="finding" :class="f.severity">
            <div class="finding-head">
              <UiBadge :tone="severity(f.severity)[1]">{{ severity(f.severity)[0] }}</UiBadge>
              <span class="cat">{{ category(f.category) }}</span>
            </div>
            <h3 class="finding-title">{{ f.short_title || f.title }}</h3>
            <code class="where">{{ f.path }}:{{ f.start_line }}</code>
            <p v-if="f.short_impact" class="impact">{{ f.short_impact }}</p>
            <p v-if="f.short_fix" class="fix"><strong>Arreglo:</strong> {{ f.short_fix }}</p>
            <details class="more">
              <summary>Ver el detalle completo</summary>
              <dl>
                <dt>Qué puede pasar</dt><dd>{{ f.scenario }}</dd>
                <dt>Impacto</dt><dd>{{ f.impact }}</dd>
                <dt>Evidencia en el código</dt><dd>{{ f.evidence }}</dd>
                <dt>Propuesta</dt><dd>{{ f.recommendation }}</dd>
              </dl>
            </details>
            <div class="feedback">
              <span class="muted small">¿Te ha servido?</span>
              <UiButton size="sm" :variant="voted[f.id] === 'useful' ? 'primary' : 'ghost'" @click="vote(f.id, 'useful')"><template #icon><ThumbsUp :size="14" /></template>Útil</UiButton>
              <UiButton size="sm" :variant="voted[f.id] === 'false_positive' ? 'primary' : 'ghost'" @click="vote(f.id, 'false_positive')"><template #icon><ThumbsDown :size="14" /></template>Falso positivo</UiButton>
            </div>
          </li>
        </ol>
      </UiCard>

      <UiCard v-else-if="tab === 'cobertura'" title="Qué se ha revisado" description="Lo que Sancho ha leído, lo que ha dejado fuera y por qué.">
          <dl class="kv">
            <div><dt>Ficheros revisados</dt><dd class="tabular">{{ int(coverage.files_considered ?? 0) }}</dd></div>
            <div><dt>Ficheros leídos como contexto</dt><dd class="tabular">{{ int(coverage.context_files ?? 0) }}</dd></div>
            <div><dt>Ficheros excluidos</dt><dd class="tabular">{{ int(coverage.excluded_files?.length ?? 0) }}</dd></div>
            <div><dt>Líneas con secretos ocultadas a la IA</dt><dd class="tabular">{{ int(coverage.redacted_lines ?? 0) }}</dd></div>
            <div><dt>Problemas propuestos / confirmados</dt><dd class="tabular">{{ int(coverage.findings_received ?? 0) }} / {{ int(coverage.findings_accepted ?? 0) }}</dd></div>
            <div><dt>Se ejecutó código del proyecto</dt><dd>No, nunca</dd></div>
            <div v-if="coverage.prompt_version"><dt>Versión de las instrucciones y reglas</dt><dd><code>{{ coverage.prompt_version }}</code></dd></div>
          </dl>
          <details v-if="coverage.context_list?.length" class="more" open>
            <summary>Ver qué ficheros se leyeron como contexto</summary>
            <ul class="files">
              <li v-for="file in coverage.context_list" :key="file.path"><code>{{ file.path }}</code> <span class="muted">· {{ file.reason }}{{ file.truncated ? ' · recortado' : '' }}</span></li>
            </ul>
          </details>
          <details v-if="coverage.excluded_files?.length" class="more">
            <summary>Ver ficheros excluidos</summary>
            <ul class="files"><li v-for="file in coverage.excluded_files" :key="file"><code>{{ file }}</code></li></ul>
          </details>
        </UiCard>

      <UiCard v-else title="Consumo de esta revisión" description="Cada llamada al modelo de IA y lo que ha costado.">
          <p v-if="!data.usage.length" class="muted small">Esta revisión no ha hecho llamadas a la IA.</p>
          <div v-else class="table-wrap">
            <table class="table">
              <thead><tr><th>Modelo</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Coste</th></tr></thead>
              <tbody>
                <tr v-for="(u, i) in data.usage" :key="i">
                  <td>{{ u.model }}</td><td class="num">{{ int(u.input_tokens) }}</td><td class="num">{{ int(u.output_tokens) }}</td><td class="num">{{ usd(u.cost_usd, 4) }}</td>
                </tr>
              </tbody>
              <tfoot><tr><td colspan="3"><strong>Total</strong></td><td class="num"><strong>{{ usd(totalCost, 4) }}</strong></td></tr></tfoot>
            </table>
          </div>
        </UiCard>
      </div>
    </div>
  </template>
</template>

<style scoped>
.back { display: inline-flex; align-items: center; gap: var(--space-1); margin-bottom: var(--space-3); padding: 0; border: 0; background: none; color: var(--color-primary-text); font-size: var(--text-sm); font-weight: 600; }
.back:hover { text-decoration: underline; text-underline-offset: 3px; }
.status-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: calc(-1 * var(--space-4)); }
.small { font-size: var(--text-sm); }
.summary { max-width: 75ch; }
.inline-spin { display: inline-flex; align-items: center; gap: var(--space-2); }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-4); }
.finding { padding: var(--space-4) var(--space-6); border: 1px solid var(--color-border); border-left: 3px solid var(--state-warning-dot); border-radius: var(--radius-md); }
.finding.high, .finding.critical { border-left-color: var(--state-danger-dot); }
.finding-head { display: flex; align-items: center; gap: var(--space-3); }
.cat { font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.finding-title { margin-top: var(--space-3); font-size: var(--text-md); }
.where { display: inline-block; margin-top: var(--space-1); padding: 2px 6px; border-radius: var(--radius-sm); background: var(--color-surface-muted); font-size: var(--text-xs); overflow-wrap: anywhere; }
.impact { margin-top: var(--space-3); max-width: 75ch; }
.fix { margin-top: var(--space-2); max-width: 75ch; color: var(--color-text-muted); }
.fix strong { color: var(--color-text); }
.more { margin-top: var(--space-3); font-size: var(--text-sm); }
.more summary { cursor: pointer; color: var(--color-primary-text); font-weight: 600; width: fit-content; }
.more dl { margin: var(--space-3) 0 0; display: grid; gap: var(--space-2); max-width: 75ch; }
.more dt { font-weight: 600; margin-top: var(--space-2); }
.more dd { margin: 0; color: var(--color-text-muted); }
.feedback { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }

.kv { margin: 0; display: flex; flex-direction: column; }
.kv div { display: flex; justify-content: space-between; gap: var(--space-4); padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); font-size: var(--text-sm); }
.kv div:last-child { border-bottom: 0; }
.kv dt { color: var(--color-text-muted); }
.kv dd { margin: 0; font-weight: 600; text-align: right; }
.files { margin: var(--space-2) 0 0; padding-left: var(--space-4); display: flex; flex-direction: column; gap: var(--space-1); overflow-wrap: anywhere; }
tfoot td { padding: var(--space-3) var(--space-4); border-top: 1px solid var(--color-border-strong); }
tfoot td:first-child { padding-left: var(--space-6); }
tfoot td:last-child { padding-right: var(--space-6); }
@media (max-width: 767px) { .finding { padding: var(--space-4); } }
</style>
