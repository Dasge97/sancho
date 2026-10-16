<script setup lang="ts">
// Ajustes (solo administración): una subpestaña por área (Bitbucket, OpenAI, modelo y costes,
// publicación). Cada área guarda lo suyo; la publicación automática se guarda al cambiar el interruptor.
import {computed, reactive, ref, watch} from 'vue';
import {Bot, CircleDollarSign, Cpu, FileText, GitBranch, ListChecks, MessageSquare} from 'lucide-vue-next';
import PromptsEditor from './PromptsEditor.vue';
import {api, errorMessage, post, put} from '../lib/api';
import {crumbTail, notify, route, setTab} from '../lib/ui-state';
import {useLoad} from '../lib/use-load';
import PageHeader from '../ui/PageHeader.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiField from '../ui/UiField.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import UiTabs from '../ui/UiTabs.vue';

const tabs = [
  {id: 'bitbucket', label: 'Bitbucket', icon: GitBranch},
  {id: 'motor', label: 'Motor de revisión', icon: Cpu},
  {id: 'openai', label: 'OpenAI', icon: Bot},
  {id: 'modelo', label: 'Modelo y costes', icon: CircleDollarSign},
  {id: 'reglas', label: 'Reglas de revisión', icon: ListChecks},
  {id: 'instrucciones', label: 'Instrucciones de la IA', icon: FileText},
  {id: 'publicacion', label: 'Publicación', icon: MessageSquare},
];
const tab = computed({get: () => tabs.some(t => t.id === route.tab) ? route.tab! : 'bitbucket', set: setTab});
// El área elegida aparece también en las migas de pan.
watch(tab, t => { crumbTail.value = tabs.find(x => x.id === t)!.label; }, {immediate: true});

const form = reactive({workspace: '', bbEmail: '', bbToken: '', apiKey: '', model: '', inputPrice: null as number | null, outputPrice: null as number | null, budget: null as number | null});
const autoPublish = ref(false), profilePr = ref(true), strictProfile = ref(false);
// Perfil exigente: además de los problemas, Sancho comenta detalles menores. Un .sancho.yml puede cambiarlo por repositorio.
async function toggleStrict(value: boolean) {
  strictProfile.value = value;
  try { await put('/settings', {review_profile: value ? 'exigente' : 'estandar'}); notify('success', value ? 'Revisión exigente activada' : 'Revisión estándar', value ? 'Sancho comentará también detalles menores, como mucho cinco por PR.' : 'Sancho solo comentará problemas de gravedad media o mayor.'); }
  catch (e) { strictProfile.value = !value; notify('danger', 'No se pudo guardar', errorMessage(e)); }
}
async function toggleProfilePr(value: boolean) {
  profilePr.value = value;
  try { await put('/settings', {profile_publish_pr: value}); notify('success', value ? 'Sancho propondrá la ficha como PR' : 'La ficha solo se guardará en Sancho'); }
  catch (e) { profilePr.value = !value; notify('danger', 'No se pudo guardar', errorMessage(e)); }
}
// Motor: el agente de Claude (servicio cerebro) o una llamada directa a OpenAI.
const engine = reactive({engine: 'agent' as 'agent' | 'openai', agentModel: 'claude-opus-5-5', agent: {configured: false, reachable: false, mode: null as string | null}});
// Reglas: generales (ajustes) y por repositorio (repositories.config). Las rutas, una por línea.
interface Repo { id: string; name: string; workspace: string; slug: string; config: {context?: string; rules?: string; exclusions?: string[]} }
const repos = ref<Repo[]>([]);
const globalRules = reactive({rules: '', exclusions: ''});
const repoRules = reactive({id: '', context: '', rules: '', exclusions: ''});
const NL = String.fromCharCode(10);
const lines = (text: string) => text.split(NL).map(l => l.trim()).filter(Boolean);
function pickRepo(id: string) {
  const r = repos.value.find(x => x.id === id);
  Object.assign(repoRules, {id, context: r?.config?.context || '', rules: r?.config?.rules || '', exclusions: (r?.config?.exclusions || []).join(NL)});
}
const status = reactive({bitbucket: false, openai: false});
const busy = ref(''), errors = reactive<Record<string, string>>({});

const {loading, error, reload} = useLoad(async () => {
  const rows = await api<{key: string; value: any}[]>('/settings');
  const v = Object.fromEntries(rows.map(r => [r.key, r.value]));
  Object.assign(form, {workspace: v.bitbucket_connection?.workspace || '', bbEmail: v.bitbucket_connection?.email || '', model: v.model || '', inputPrice: v.input_price_per_million ?? null, outputPrice: v.output_price_per_million ?? null, budget: v.monthly_budget_usd ?? null});
  Object.assign(status, {bitbucket: !!v.bitbucket_connection?.configured, openai: !!v.openai_secret?.configured});
  autoPublish.value = v.auto_publish === true;
  profilePr.value = v.profile_publish_pr !== false;
  strictProfile.value = v.review_profile === 'exigente';
  Object.assign(globalRules, {rules: v.review_rules || '', exclusions: (v.review_exclusions || []).join(NL)});
  const e = await api<{engine: 'agent' | 'openai'; agent: typeof engine.agent; agent_model: string}>('/engine');
  Object.assign(engine, {engine: e.engine, agentModel: e.agent_model, agent: e.agent});
  repos.value = await api<Repo[]>('/repositories');
  if (repos.value.length) pickRepo(repoRules.id || repos.value[0].id);
  return true;
});
defineExpose({reload});

const priceMissing = computed(() => !!form.model && (form.inputPrice === null || form.outputPrice === null));

async function run(name: string, fn: () => Promise<void>) {
  busy.value = name;
  try { await fn(); } catch (e) { notify('danger', 'No se pudo completar', errorMessage(e)); } finally { busy.value = ''; }
}

const saveBitbucket = () => {
  errors.workspace = form.workspace ? '' : 'Escribe el workspace tal como aparece en la URL de Bitbucket.';
  errors.bbEmail = /^\S+@\S+\.\S+$/.test(form.bbEmail) ? '' : 'Escribe el correo de la cuenta de Atlassian.';
  errors.bbToken = form.bbToken ? '' : status.bitbucket ? 'Para cambiar la conexión, escribe otra vez el token.' : 'Pega el API token de Atlassian.';
  if (errors.workspace || errors.bbEmail || errors.bbToken) return;
  return run('bitbucket', async () => {
    await post('/connections', {workspace: form.workspace, email: form.bbEmail, api_token: form.bbToken});
    form.bbToken = ''; status.bitbucket = true;
    notify('success', 'Conexión guardada', 'Pruébala para confirmar que Bitbucket la acepta.');
  });
};
const testBitbucket = () => run('bitbucket-test', async () => {
  const r = await post<{workspace: string; repository_count: number | null}>('/connections/test');
  notify('success', 'Bitbucket responde', `Workspace ${r.workspace} · ${r.repository_count ?? 0} repositorios disponibles.`);
});

const saveKey = () => {
  errors.apiKey = form.apiKey.length >= 20 ? '' : 'La clave de OpenAI empieza por «sk-» y es más larga.';
  if (errors.apiKey) return;
  return run('openai', async () => {
    await put('/settings/openai-secret', {api_key: form.apiKey});
    form.apiKey = ''; status.openai = true;
    notify('success', 'Clave guardada y cifrada', 'Compruébala con el modelo elegido.');
  });
};
const testOpenAI = () => run('openai-test', async () => {
  const r = await post<{model: string}>('/settings/test-openai');
  notify('success', 'OpenAI responde', `El modelo ${r.model} devuelve las respuestas en el formato que necesita Sancho.`);
});

const saveModel = () => {
  errors.model = form.model ? '' : 'Escribe el nombre del modelo, por ejemplo gpt-6.1-sol.';
  if (errors.model) return;
  return run('model', async () => {
    await put('/settings', {model: form.model, input_price_per_million: form.inputPrice, output_price_per_million: form.outputPrice, monthly_budget_usd: form.budget});
    notify('success', 'Modelo y costes guardados');
  });
};

const saveGlobalRules = () => run('rules-global', async () => {
  await put('/settings', {review_rules: globalRules.rules, review_exclusions: lines(globalRules.exclusions)});
  notify('success', 'Reglas guardadas', 'Se aplicarán desde la próxima revisión de cualquier repositorio.');
});
const saveRepoRules = () => run('rules-repo', async () => {
  const saved = await put<{config: Repo['config']}>(`/repositories/${repoRules.id}/rules`, {context: repoRules.context, rules: repoRules.rules, exclusions: lines(repoRules.exclusions)});
  const r = repos.value.find(x => x.id === repoRules.id); if (r) r.config = saved.config;
  notify('success', `Reglas de ${r?.name || 'el repositorio'} guardadas`, 'Se aplicarán desde su próxima revisión.');
});

const saveEngine = () => run('engine', async () => {
  await put('/settings', {review_engine: engine.engine, agent_model: engine.agentModel.trim() || 'claude-opus-5-5'});
  notify('success', 'Motor guardado', engine.engine === 'agent' ? 'Las próximas revisiones las hará el agente de Claude.' : 'Las próximas revisiones irán directamente a OpenAI.');
});

async function toggleAutoPublish(value: boolean) {
  autoPublish.value = value;
  try {
    await put('/settings', {auto_publish: value});
    notify('success', value ? 'Comentarios automáticos activados' : 'Comentarios automáticos desactivados', value ? 'Las revisiones del webhook comentarán en Bitbucket.' : 'Las revisiones automáticas solo se verán en el panel.');
  } catch (e) { autoPublish.value = !value; notify('danger', 'No se pudo guardar', errorMessage(e)); }
}
</script>

<template>
  <PageHeader title="Ajustes" description="Conecta Sancho con tu código y con la IA, y decide cuándo comenta en tus pull requests. Las credenciales se guardan cifradas." />

  <UiNotice v-if="error" tone="danger" title="No se pudieron cargar los ajustes">
    {{ error }}
    <template #action><UiButton size="sm" @click="reload">Reintentar</UiButton></template>
  </UiNotice>

  <template v-else>
    <UiTabs v-model="tab" :tabs="tabs" label="Áreas de ajustes" />
    <UiCard v-if="loading"><UiSkeleton kind="text" :count="5" /></UiCard>

    <UiCard v-else-if="tab === 'bitbucket'" title="Conexión con Bitbucket" description="La cuenta con la que Sancho lee tus pull requests y publica sus comentarios. Los comentarios salen con su nombre.">
      <template #actions><UiBadge :tone="status.bitbucket ? 'success' : 'warning'">{{ status.bitbucket ? `Conectado a ${form.workspace}` : 'Sin conectar' }}</UiBadge></template>
      <form class="form" novalidate @submit.prevent="saveBitbucket">
        <UiField v-slot="f" label="Workspace" help="El nombre que aparece en bitbucket.org/<workspace>/…" :error="errors.workspace">
          <input :id="f.id" v-model.trim="form.workspace" class="control" autocomplete="off" :aria-invalid="f.invalid" :aria-describedby="f.describedby">
        </UiField>
        <UiField v-slot="f" label="Correo de la cuenta de Atlassian" :error="errors.bbEmail">
          <input :id="f.id" v-model.trim="form.bbEmail" class="control" type="email" autocomplete="off" :aria-invalid="f.invalid" :aria-describedby="f.describedby">
        </UiField>
        <UiField v-slot="f" label="API token" :help="status.bitbucket ? 'Ya hay uno guardado. Escríbelo solo si quieres cambiarlo.' : 'Créalo en id.atlassian.com con permisos de repositorios, pull requests y webhooks.'" :error="errors.bbToken">
          <input :id="f.id" v-model="form.bbToken" class="control" type="password" autocomplete="new-password" :aria-invalid="f.invalid" :aria-describedby="f.describedby">
        </UiField>
        <div class="row-actions">
          <UiButton type="submit" variant="primary" :loading="busy === 'bitbucket'">Guardar conexión</UiButton>
          <UiButton :disabled="!status.bitbucket" :loading="busy === 'bitbucket-test'" @click="testBitbucket">Probar conexión</UiButton>
        </div>
      </form>
    </UiCard>

    <UiCard v-else-if="tab === 'motor'" title="Motor de revisión" description="Quién revisa el código. El agente de Claude explora el repositorio por su cuenta y lee lo que necesita; OpenAI recibe el diff y una selección fija de ficheros.">
      <form class="form" novalidate @submit.prevent="saveEngine">
        <div class="engines" role="radiogroup" aria-label="Motor de revisión">
          <label class="engine" :class="{on: engine.engine === 'agent'}">
            <input v-model="engine.engine" type="radio" value="agent" name="engine">
            <span class="engine-title">Agente de Claude <span class="muted">· recomendado</span></span>
            <span class="engine-text">Lee el repositorio completo en el commit de la PR y decide qué abrir. Solo puede leer: no ejecuta nada.</span>
            <UiBadge :tone="engine.agent.reachable ? 'success' : engine.agent.configured ? 'danger' : 'warning'">{{ engine.agent.reachable ? (engine.agent.mode === 'api' ? 'Conectado · clave de API' : 'Conectado · suscripción') : engine.agent.configured ? 'No responde' : 'No instalado' }}</UiBadge>
          </label>
          <label class="engine" :class="{on: engine.engine === 'openai'}">
            <input v-model="engine.engine" type="radio" value="openai" name="engine">
            <span class="engine-title">OpenAI</span>
            <span class="engine-text">Recibe el diff y hasta 16 ficheros relacionados. Usa la clave y el modelo de las pestañas OpenAI y Modelo y costes.</span>
            <UiBadge :tone="status.openai && form.model ? 'success' : 'warning'">{{ status.openai && form.model ? 'Configurado' : 'Sin clave o sin modelo' }}</UiBadge>
          </label>
        </div>
        <UiField v-if="engine.engine === 'agent'" v-slot="f" label="Modelo del agente" help="El nombre del modelo de Claude. Por defecto, claude-opus-5-5.">
          <input :id="f.id" v-model="engine.agentModel" class="control" autocomplete="off" :aria-describedby="f.describedby">
        </UiField>
        <UiNotice v-if="engine.engine === 'agent' && !engine.agent.reachable" tone="warning">El servicio del agente no responde. Mientras tanto, las revisiones fallarán: revisa el contenedor cerebro o elige OpenAI.</UiNotice>
        <div class="row-actions"><UiButton type="submit" variant="primary" :loading="busy === 'engine'">Guardar motor</UiButton></div>
      </form>
    </UiCard>

    <UiCard v-else-if="tab === 'openai'" title="Clave de OpenAI" description="Sancho usa tu propia cuenta de OpenAI: pagas solo lo que consumes y controlas tus datos.">
      <template #actions><UiBadge :tone="status.openai ? 'success' : 'warning'">{{ status.openai ? 'Clave guardada' : 'Sin clave' }}</UiBadge></template>
      <form class="form" novalidate @submit.prevent="saveKey">
        <UiField v-slot="f" label="Clave de la API" :help="status.openai ? 'Ya hay una guardada. Escríbela solo si quieres cambiarla.' : 'Créala en platform.openai.com. Te recomendamos una clave solo para Sancho.'" :error="errors.apiKey">
          <input :id="f.id" v-model="form.apiKey" class="control" type="password" autocomplete="new-password" placeholder="sk-…" :aria-invalid="f.invalid" :aria-describedby="f.describedby">
        </UiField>
        <div class="row-actions">
          <UiButton type="submit" variant="primary" :loading="busy === 'openai'">Guardar clave</UiButton>
          <UiButton :disabled="!status.openai || !form.model" :loading="busy === 'openai-test'" @click="testOpenAI">Comprobar con el modelo</UiButton>
        </div>
      </form>
    </UiCard>

    <UiCard v-else-if="tab === 'modelo'" title="Modelo y costes" description="Elige el modelo que revisa tu código. Con sus tarifas, Sancho calcula lo que cuesta cada revisión y te avisa antes de pasarte del presupuesto.">
      <form novalidate @submit.prevent="saveModel">
        <div class="fields">
          <UiField v-slot="f" label="Modelo" help="El nombre exacto en OpenAI." :error="errors.model">
            <input :id="f.id" v-model.trim="form.model" class="control" autocomplete="off" placeholder="gpt-6.1-sol" :aria-invalid="f.invalid" :aria-describedby="f.describedby">
          </UiField>
          <UiField v-slot="f" label="Presupuesto mensual" help="En USD. Solo avisa; nunca detiene revisiones." optional>
            <input :id="f.id" v-model.number="form.budget" class="control tabular" type="number" min="0" step="1" placeholder="Sin límite" :aria-describedby="f.describedby">
          </UiField>
          <UiField v-slot="f" label="Tarifa de entrada" help="USD por millón de tokens.">
            <input :id="f.id" v-model.number="form.inputPrice" class="control tabular" type="number" min="0" step="0.01" :aria-describedby="f.describedby">
          </UiField>
          <UiField v-slot="f" label="Tarifa de salida" help="USD por millón de tokens.">
            <input :id="f.id" v-model.number="form.outputPrice" class="control tabular" type="number" min="0" step="0.01" :aria-describedby="f.describedby">
          </UiField>
        </div>
        <UiNotice v-if="priceMissing" tone="info" class="gap">Sin las dos tarifas, el coste de cada revisión aparecerá como desconocido.</UiNotice>
        <div class="row-actions gap-lg"><UiButton type="submit" variant="primary" :loading="busy === 'model'">Guardar modelo y costes</UiButton></div>
      </form>
    </UiCard>

    <div v-else-if="tab === 'reglas'" class="stack">
      <UiCard title="Perfil de revisión" description="Cuánto comenta Sancho. Un repositorio puede elegir otro perfil en su .sancho.yml con «perfil: exigente» o «perfil: estandar».">
        <UiSwitch :model-value="strictProfile" label="Revisión exigente" help="Además de los problemas, comenta detalles menores que un buen revisor pediría cambiar: errores que se ignoran, código muerto, casos límite. Como mucho cinco por PR. Nunca estilo." @update:model-value="toggleStrict" />
      </UiCard>
      <UiCard title="Reglas para todos los repositorios" description="Dile a Sancho en qué fijarse y qué ignorar. Sancho las lee antes de cada revisión, junto a sus propias instrucciones.">
        <form class="form" novalidate @submit.prevent="saveGlobalRules">
          <UiField v-slot="f" label="Reglas del equipo" help="Una regla por línea, en lenguaje normal. Ejemplo: «Toda acción que cambia datos usa un FormRequest con authorize()». «No comentes el uso de DB::raw en database/seeders»." optional>
            <textarea :id="f.id" v-model="globalRules.rules" class="control" rows="6" maxlength="8000" :aria-describedby="f.describedby" />
          </UiField>
          <UiField v-slot="f" label="Rutas que nunca se revisan" help="Una por línea. Admite * y carpetas terminadas en /**, por ejemplo legacy/** o *.min.js." optional>
            <textarea :id="f.id" v-model="globalRules.exclusions" class="control mono" rows="4" :aria-describedby="f.describedby" />
          </UiField>
          <div class="row-actions"><UiButton type="submit" variant="primary" :loading="busy === 'rules-global'">Guardar reglas generales</UiButton></div>
        </form>
      </UiCard>

      <UiCard title="Reglas de un repositorio" description="Cuéntale a Sancho de qué va cada proyecto y qué es importante en él. Se suman a las reglas generales.">
        <UiNotice v-if="!repos.length" tone="info">Sincroniza tus repositorios en Repositorios para poder darles reglas propias.</UiNotice>
        <form v-else class="form" novalidate @submit.prevent="saveRepoRules">
          <UiField v-slot="f" label="Repositorio">
            <select :id="f.id" :value="repoRules.id" class="control" @change="pickRepo(($event.target as HTMLSelectElement).value)">
              <option v-for="r in repos" :key="r.id" :value="r.id">{{ r.name }} · {{ r.workspace }}/{{ r.slug }}</option>
            </select>
          </UiField>
          <UiField v-slot="f" label="De qué va el proyecto" help="Qué hace, para quién, versión de PHP y del framework, y cómo se organiza. Ejemplo: «API de facturación en Laravel 11 para clientes B2B; cada factura pertenece a un usuario»." optional>
            <textarea :id="f.id" v-model="repoRules.context" class="control" rows="4" maxlength="4000" :aria-describedby="f.describedby" />
          </UiField>
          <UiField v-slot="f" label="Reglas de este repositorio" help="Lo que solo vale aquí. Ejemplo: «Los administradores pueden ver todas las facturas: no es un fallo de autorización»." optional>
            <textarea :id="f.id" v-model="repoRules.rules" class="control" rows="5" maxlength="8000" :aria-describedby="f.describedby" />
          </UiField>
          <UiField v-slot="f" label="Rutas que no se revisan en este repositorio" help="Una por línea." optional>
            <textarea :id="f.id" v-model="repoRules.exclusions" class="control mono" rows="3" :aria-describedby="f.describedby" />
          </UiField>
          <div class="row-actions"><UiButton type="submit" variant="primary" :loading="busy === 'rules-repo'">Guardar reglas del repositorio</UiButton></div>
        </form>
      </UiCard>
    </div>

    <PromptsEditor v-else-if="tab === 'instrucciones'" />

    <UiCard v-else title="Publicación en Bitbucket" description="Decide qué hace Sancho con las revisiones que lanza solo, por el webhook o al repasar las pull requests abiertas.">
      <div class="form">
        <UiSwitch :model-value="autoPublish" label="Comentar automáticamente en Bitbucket" help="Apagado, las revisiones automáticas solo se ven en este panel. Actívalo cuando hayas comprobado que los comentarios aportan. «Revisar y comentar» en Repositorios funciona siempre." @update:model-value="toggleAutoPublish" />
        <UiSwitch :model-value="profilePr" label="Proponer la ficha del proyecto como PR" help="Cuando Sancho escribe o actualiza la ficha de un repositorio, abre una PR que añade .sancho/proyecto.md para que el equipo la revise y la guarde junto al código. Sancho nunca la fusiona." @update:model-value="toggleProfilePr" />
      </div>
    </UiCard>
  </template>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--space-4); max-width: 760px; }
.mono { font-family: var(--font-mono); font-size: var(--text-sm); }
.engines { display: grid; gap: var(--space-3); grid-template-columns: minmax(0, 1fr); }
.engine { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-4) var(--space-4) var(--space-4) 44px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); cursor: pointer; transition: border-color var(--duration) var(--ease), background var(--duration) var(--ease); }
.engine:hover { background: var(--color-surface-hover); }
.engine.on { border-color: var(--color-primary); background: var(--color-primary-soft); }
.engine input { position: absolute; left: var(--space-4); top: 19px; width: 16px; height: 16px; accent-color: var(--color-primary); }
.engine-title { font-weight: 600; }
.engine-text { color: var(--color-text-muted); font-size: var(--text-sm); }
@media (min-width: 768px) { .engines { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.fields { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr); max-width: 760px; }
.gap { margin-top: var(--space-4); max-width: 760px; }
.gap-lg { margin-top: var(--space-6); }
@media (min-width: 768px) { .fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
