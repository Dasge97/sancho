<script setup lang="ts">
// Ajustes (solo administración): una subpestaña por área (Bitbucket, OpenAI, modelo y costes,
// publicación). Cada área guarda lo suyo; la publicación automática se guarda al cambiar el interruptor.
import {computed, reactive, ref, watch} from 'vue';
import {Bot, CircleDollarSign, GitBranch, MessageSquare} from 'lucide-vue-next';
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
  {id: 'openai', label: 'OpenAI', icon: Bot},
  {id: 'modelo', label: 'Modelo y costes', icon: CircleDollarSign},
  {id: 'publicacion', label: 'Publicación', icon: MessageSquare},
];
const tab = computed({get: () => tabs.some(t => t.id === route.tab) ? route.tab! : 'bitbucket', set: setTab});
// El área elegida aparece también en las migas de pan.
watch(tab, t => { crumbTail.value = tabs.find(x => x.id === t)!.label; }, {immediate: true});

const form = reactive({workspace: '', bbEmail: '', bbToken: '', apiKey: '', model: '', inputPrice: null as number | null, outputPrice: null as number | null, budget: null as number | null});
const autoPublish = ref(false);
const status = reactive({bitbucket: false, openai: false});
const busy = ref(''), errors = reactive<Record<string, string>>({});

const {loading, error, reload} = useLoad(async () => {
  const rows = await api<{key: string; value: any}[]>('/settings');
  const v = Object.fromEntries(rows.map(r => [r.key, r.value]));
  Object.assign(form, {workspace: v.bitbucket_connection?.workspace || '', bbEmail: v.bitbucket_connection?.email || '', model: v.model || '', inputPrice: v.input_price_per_million ?? null, outputPrice: v.output_price_per_million ?? null, budget: v.monthly_budget_usd ?? null});
  Object.assign(status, {bitbucket: !!v.bitbucket_connection?.configured, openai: !!v.openai_secret?.configured});
  autoPublish.value = v.auto_publish === true;
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

    <UiCard v-else title="Publicación en Bitbucket" description="Decide qué hace Sancho con las revisiones que lanza solo, por el webhook o al repasar las pull requests abiertas.">
      <div class="form">
        <UiSwitch :model-value="autoPublish" label="Comentar automáticamente en Bitbucket" help="Apagado, las revisiones automáticas solo se ven en este panel. Actívalo cuando hayas comprobado que los comentarios aportan. «Revisar y comentar» en Repositorios funciona siempre." @update:model-value="toggleAutoPublish" />
      </div>
    </UiCard>
  </template>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--space-4); max-width: 640px; }
.fields { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr); max-width: 760px; }
.gap { margin-top: var(--space-4); max-width: 760px; }
.gap-lg { margin-top: var(--space-6); }
@media (min-width: 768px) { .fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
