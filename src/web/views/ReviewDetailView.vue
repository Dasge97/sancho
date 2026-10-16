<script setup lang="ts">
// Detalle de una revisión: estado, hallazgos con su explicación completa, qué se revisó
// (cobertura) y su consumo. Mientras está en cola o analizándose, se actualiza sola.
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue';
import {ExternalLink, Loader2, ThumbsDown, ThumbsUp} from 'lucide-vue-next';
import {api, errorMessage, post} from '../lib/api';
import {category, dateTime, int, publicationState, reviewState, severity, usd} from '../lib/format';
import {askText, crumbTail, notify, pendingVote, route, setTab} from '../lib/ui-state';
import PageHeader from '../ui/PageHeader.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiTabs from '../ui/UiTabs.vue';
import InlineCode from '../ui/InlineCode.vue';

const props = defineProps<{id: string}>();
const data = ref<any>(null), error = ref(''), voted = ref<Record<string, string>>({});
let timer: ReturnType<typeof setTimeout> | undefined;

const running = computed(() => ['queued', 'analyzing'].includes(data.value?.run.status) || data.value?.run.publication_status === 'pending');
const coverage = computed(() => data.value?.run.coverage || {});
// Comprobaciones antes de fusionar: cómo se ve cada resultado.
const checkWord: Record<string, string> = {cumple: 'Cumple', no_cumple: 'No cumple', no_aplica: 'No aplica', sin_evaluar: 'Sin evaluar'};
const checkTone: Record<string, 'success' | 'danger' | 'neutral' | 'warning'> = {cumple: 'success', no_cumple: 'danger', no_aplica: 'neutral', sin_evaluar: 'warning'};
// Herramientas de análisis estático: cuántos ficheros miraron y qué encontraron.
const toolNames: Record<string, string> = {gitleaks: 'Secretos (gitleaks)', php: 'Sintaxis de PHP (php -l)'};
function toolStatus(t: {status: string; files: number; findings: number; note?: string}) {
  const base = t.status === 'ok' ? `${t.files} ${t.files === 1 ? 'fichero' : 'ficheros'} · ${t.findings ? `${t.findings} ${t.findings === 1 ? 'problema' : 'problemas'}` : 'sin problemas'}`
    : t.status === 'skipped' ? 'No aplica' : t.status === 'unavailable' ? 'No instalado' : 'No se pudo ejecutar';
  return t.note && t.status !== 'skipped' ? `${base}. ${t.note}` : base;
}
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
  applyPendingVote();
}
// Voto que llega desde un enlace de Bitbucket: se aplica una vez, al hallazgo con esa huella.
async function applyPendingVote() {
  const pending = pendingVote.value;
  if (!pending || !data.value) return;
  pendingVote.value = null;
  const f = data.value.findings.find((x: any) => x.fingerprint === pending.fingerprint);
  if (!f) { notify('warning', 'No encuentro ese problema', 'Puede que la PR haya cambiado. Vota desde la lista de problemas.'); return; }
  setTab('problemas');
  await nextTick();
  document.getElementById('hallazgo-' + f.id)?.scrollIntoView({block: 'center'});
  await vote(f.id, pending.vote);
}
watch(() => props.id, () => { data.value = null; load(); }, {immediate: true});
onBeforeUnmount(() => clearTimeout(timer));
defineExpose({reload: load});

function openInBitbucket() { window.open(data.value.run.url, '_blank', 'noopener'); }

async function vote(findingId: string, value: 'useful' | 'false_positive') {
  // Para un falso positivo se pide el motivo: con él, Sancho aprende a no repetirlo en este repositorio.
  let reason: string | null = null;
  if (value === 'false_positive') {
    reason = await askText({title: 'Marcar como falso positivo', text: 'Si nos dices por qué no es un problema, Sancho lo aprenderá y no volverá a señalarlo en este repositorio.', inputLabel: '¿Por qué no es un problema? (opcional)', inputPlaceholder: 'Por ejemplo: esta ruta solo la usan administradores, que pueden ver todas las facturas.', confirmLabel: 'Marcar como falso positivo'});
    if (reason === null) return;
  }
  try {
    const r = await post<{learned: boolean}>(`/findings/${findingId}/feedback`, {vote: value, ...(reason ? {reason} : {})});
    voted.value[findingId] = value;
    notify('success', 'Gracias por tu opinión', value === 'useful' ? 'Marcado como útil.' : r.learned ? 'Sancho lo tendrá en cuenta en las próximas revisiones de este repositorio.' : 'Marcado como falso positivo.');
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

      <UiCard v-if="(data.run.summary || data.run.walkthrough) && !running" :title="data.run.walkthrough ? 'Qué hace esta PR' : 'Conclusión de Sancho'">
        <p v-if="data.run.walkthrough" class="summary"><InlineCode :text="data.run.walkthrough" /></p>
        <p v-if="data.run.effort" class="effort muted"><strong>Esfuerzo de revisión:</strong> {{ data.run.effort.level }} de 5 · unos {{ data.run.effort.minutes }} min<template v-if="data.run.effort.reason"> · {{ data.run.effort.reason }}</template></p>
        <ul v-if="data.run.checks?.length" class="checks" aria-label="Comprobaciones antes de fusionar">
          <li v-for="c in data.run.checks" :key="c.name">
            <UiBadge :tone="checkTone[c.status] || 'neutral'">{{ checkWord[c.status] || c.status }}</UiBadge>
            <span><strong>{{ c.name }}</strong><template v-if="c.reason">. <InlineCode :text="c.reason" /></template></span>
          </li>
        </ul>
        <p v-if="data.run.summary" class="summary" :class="{conclusion: data.run.walkthrough}"><strong v-if="data.run.walkthrough">Conclusión de Sancho: </strong><InlineCode :text="data.run.summary" /></p>
        <div v-if="data.run.changes?.length" class="table-wrap changes">
          <table class="table cards">
            <thead><tr><th>Fichero</th><th>Qué cambia</th></tr></thead>
            <tbody><tr v-for="c in data.run.changes" :key="c.path"><td><code class="where">{{ c.path }}</code></td><td data-label="Qué cambia"><InlineCode :text="c.summary" /></td></tr></tbody>
          </table>
        </div>
      </UiCard>

      <div>
      <UiTabs v-model="tab" :tabs="tabs" label="Detalle de la revisión" />
      <UiCard v-if="tab === 'problemas'" title="Problemas encontrados" description="Cada problema está verificado contra el código que añade la pull request, en la línea exacta.">
        <UiEmpty v-if="!data.findings.length" :title="running ? 'Analizando el código…' : 'Ningún problema a la vista'" :text="running ? 'Los problemas aparecerán aquí en cuanto termine.' : 'Sancho no ha encontrado problemas en lo que ha revisado. En «Qué se ha revisado» tienes el alcance exacto.'" />
        <ol v-else class="findings">
          <li v-for="f in data.findings" :id="'hallazgo-' + f.id" :key="f.id" class="finding" :class="f.severity">
            <div class="finding-head">
              <UiBadge :tone="severity(f.severity)[1]">{{ severity(f.severity)[0] }}</UiBadge>
              <span class="cat">{{ category(f.category) }}</span>
            </div>
            <h3 class="finding-title"><InlineCode :text="f.short_title || f.title" /></h3>
            <code class="where">{{ f.path }}:{{ f.start_line }}</code>
            <p v-if="f.short_impact" class="impact"><InlineCode :text="f.short_impact" /></p>
            <p v-if="f.short_fix" class="fix"><strong>Arreglo:</strong> <InlineCode :text="f.short_fix" /></p>
            <div v-if="f.suggestion" class="suggestion">
              <span class="suggestion-label">Cambio propuesto para la línea {{ f.start_line }}</span>
              <pre><code>{{ f.suggestion }}</code></pre>
            </div>
            <details class="more">
              <summary>Ver el detalle completo</summary>
              <dl>
                <dt>Qué puede pasar</dt><dd><InlineCode :text="f.scenario" /></dd>
                <dt>Impacto</dt><dd><InlineCode :text="f.impact" /></dd>
                <dt>Evidencia en el código</dt><dd><InlineCode :text="f.evidence" /></dd>
                <dt>Propuesta</dt><dd><InlineCode :text="f.recommendation" /></dd>
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
            <div v-if="coverage.follow_up?.previous_commit"><dt>Ficheros cambiados desde la revisión anterior (<code>{{ coverage.follow_up.previous_commit.slice(0, 7) }}</code>)</dt><dd class="tabular">{{ coverage.follow_up.changed_files ?? '—' }}</dd></div>
            <div v-if="coverage.follow_up?.open_before"><dt>Comentarios anteriores: arreglados / siguen abiertos</dt><dd class="tabular">{{ coverage.follow_up.fixed }} / {{ coverage.follow_up.still_present }}</dd></div>
            <div v-for="t in coverage.static_analysis || []" :key="t.tool"><dt>{{ toolNames[t.tool] || t.tool }}</dt><dd>{{ toolStatus(t) }}</dd></div>
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
.conclusion { margin-top: var(--space-3); color: var(--color-text-muted); }
.changes { margin-top: var(--space-4); }
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
.suggestion { margin-top: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
.suggestion-label { display: block; padding: var(--space-2) var(--space-3); font-size: var(--text-xs); font-weight: 600; color: var(--color-text-muted); background: var(--color-surface-muted); border-bottom: 1px solid var(--color-border); }
.suggestion pre { margin: 0; padding: var(--space-3); font-family: var(--font-mono); font-size: 13px; line-height: 1.6; overflow-x: auto; white-space: pre; }
.effort { margin-top: var(--space-3); font-size: var(--text-sm); }
.checks { list-style: none; margin: var(--space-4) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.checks li { display: flex; align-items: baseline; gap: var(--space-3); font-size: var(--text-sm); }
</style>
