<script setup lang="ts">
// Detalle de un repositorio: la ficha del proyecto (lo que Sancho sabe de él y lee antes de cada
// revisión), lo que ha aprendido del equipo, sus conversaciones en las PR y la configuración que el
// propio repositorio da en su .sancho.yml.
import {computed, onBeforeUnmount, ref, watch} from 'vue';
import {BookOpen, ExternalLink, FileCode2, GraduationCap, Loader2, MessagesSquare, Pencil, RefreshCw, Sparkles} from 'lucide-vue-next';
import {api, errorMessage, post, put} from '../lib/api';
import {dateTime} from '../lib/format';
import {isAdmin} from '../lib/session';
import {ask, crumbTail, notify, route, setTab} from '../lib/ui-state';
import PageHeader from '../ui/PageHeader.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiMarkdown from '../ui/UiMarkdown.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiTabs from '../ui/UiTabs.vue';
import ConversationsList from './ConversationsList.vue';
import LearnedRules from './LearnedRules.vue';

interface Version { id: string; content: string; summary: string | null; source: 'agent' | 'edited'; commit_sha: string | null; pr_url: string | null; created_at: string; actor: string | null }
interface Profile { active: Version | null; history: Version[]; generating: boolean; failed: boolean; publish_pr: boolean; agent_available: boolean }

const props = defineProps<{id: string}>();
const repo = ref<any>(null), profile = ref<Profile | null>(null), config = ref<any>(null);
const error = ref(''), configError = ref(''), editing = ref(false), draft = ref(''), busy = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;

const tabs = [{id: 'ficha', label: 'Ficha del proyecto', icon: BookOpen}, {id: 'aprendido', label: 'Lo aprendido', icon: GraduationCap}, {id: 'conversaciones', label: 'Conversaciones', icon: MessagesSquare}, {id: 'configuracion', label: 'Configuración (.sancho.yml)', icon: FileCode2}];
const tab = computed({get: () => tabs.some(t => t.id === route.tab) ? route.tab! : 'ficha', set: setTab});
const sourceLabel = (v: Version) => v.source === 'agent' ? 'Escrita por Sancho' : v.summary?.startsWith('Importada') ? 'Editada en el repositorio' : `Editada por ${v.actor || 'el equipo'}`;

async function load() {
  clearTimeout(timer);
  try {
    const repos = await api<any[]>('/repositories');
    repo.value = repos.find(r => r.id === props.id) || null;
    if (!repo.value) { error.value = 'Este repositorio ya no existe o no está sincronizado.'; return; }
    crumbTail.value = repo.value.name;
    profile.value = await api<Profile>(`/repositories/${props.id}/profile`);
    error.value = '';
  } catch (e) { error.value = errorMessage(e); }
  if (profile.value?.generating) timer = setTimeout(load, 5000);
}
async function loadConfig() {
  if (config.value || repo.value?.remote_uuid?.startsWith('sim:')) return;
  try { config.value = await api(`/repositories/${props.id}/repo-config`); configError.value = ''; }
  catch (e) { configError.value = errorMessage(e); }
}
watch(() => props.id, load, {immediate: true});
watch(tab, t => { if (t === 'configuracion') loadConfig(); }, {immediate: true});
onBeforeUnmount(() => clearTimeout(timer));
defineExpose({reload: load});

async function regenerate() {
  if (profile.value?.active && !await ask({title: '¿Volver a estudiar el repositorio?', text: 'Sancho leerá el proyecto de nuevo y escribirá una ficha nueva. La actual quedará en el historial, incluidos tus cambios.', confirmLabel: 'Generar ficha nueva'})) return;
  busy.value = 'regenerate';
  try { await post(`/repositories/${props.id}/profile/regenerate`); notify('success', 'Sancho está estudiando el repositorio', 'Suele tardar unos minutos. Esta página se actualiza sola.'); await load(); }
  catch (e) { notify('danger', 'No se pudo pedir la ficha', errorMessage(e)); }
  finally { busy.value = ''; }
}
function startEdit() { draft.value = profile.value?.active?.content || ''; editing.value = true; }
async function saveEdit() {
  busy.value = 'save';
  try {
    const r = await put<{pr_url: string | null; pr_error: string | null}>(`/repositories/${props.id}/profile`, {content: draft.value});
    editing.value = false; await load();
    if (r.pr_error) notify('warning', 'Ficha guardada', r.pr_error);
    else notify('success', 'Ficha guardada', r.pr_url ? 'También se ha actualizado la PR de la ficha en Bitbucket.' : 'Sancho la usará desde la próxima revisión.');
  } catch (e) { notify('danger', 'No se pudo guardar la ficha', errorMessage(e)); }
  finally { busy.value = ''; }
}
async function cancelEdit() {
  if (draft.value !== profile.value?.active?.content && !await ask({title: '¿Descartar los cambios?', confirmLabel: 'Descartar', danger: true})) return;
  editing.value = false;
}
const example = `contexto: |
  API de facturación en Laravel 11 para clientes B2B.
  Cada factura pertenece a un usuario; los administradores ven todas.
reglas: |
  Toda acción que cambia datos usa un FormRequest con authorize().
rutas:
  - ruta: "app/Http/Controllers/Admin/**"
    reglas: "Solo accesible con el middleware can:admin."
excluir:
  - "database/seeders/**"
gravedad_minima: medium`;
</script>

<template>
  <UiNotice v-if="error" tone="danger" title="No se pudo cargar el repositorio">
    {{ error }}
    <template #action><UiButton size="sm" @click="load">Reintentar</UiButton></template>
  </UiNotice>

  <template v-else-if="!repo || !profile">
    <UiSkeleton kind="text" :count="2" />
    <div style="height: 32px" />
    <UiCard><UiSkeleton kind="text" :count="6" /></UiCard>
  </template>

  <template v-else>
    <PageHeader :title="repo.name" :description="`${repo.workspace} / ${repo.slug} · Lo que Sancho sabe de este proyecto y cómo se configura desde el propio repositorio.`">
      <UiBadge :tone="repo.active ? 'success' : 'neutral'">{{ repo.active ? 'Activo' : 'Pausado' }}</UiBadge>
    </PageHeader>
    <UiTabs v-model="tab" :tabs="tabs" label="Detalle del repositorio" />

    <!-- Ficha del proyecto -->
    <div v-if="tab === 'ficha'" class="stack">
      <UiNotice v-if="profile.generating" tone="info" title="Sancho está estudiando el repositorio">
        <span class="inline-spin"><Loader2 :size="14" class="spin" aria-hidden="true" />Lee el proyecto entero y escribe su ficha. Suele tardar unos minutos; esta página se actualiza sola.</span>
      </UiNotice>
      <UiNotice v-else-if="profile.failed" tone="danger" title="No se pudo generar la ficha">
        El último intento falló. Comprueba que el motor de agente responde en Ajustes → Motor de revisión y vuelve a intentarlo.
      </UiNotice>

      <UiCard v-if="!profile.active && !profile.generating">
        <UiEmpty :icon="Sparkles" title="Sancho todavía no conoce este proyecto" :text="profile.agent_available ? 'La ficha se escribe sola en la primera revisión, o ahora mismo: Sancho estudia el repositorio entero y apunta cómo funciona, cómo se protege y qué vigilar.' : 'La ficha la escribe el agente de Claude, y el motor de agente no está instalado.'">
          <UiButton v-if="isAdmin && profile.agent_available" variant="primary" :loading="busy === 'regenerate'" @click="regenerate"><template #icon><Sparkles :size="16" /></template>Generar la ficha</UiButton>
        </UiEmpty>
      </UiCard>

      <UiCard v-else-if="profile.active" title="Ficha del proyecto" description="Sancho la lee antes de cada revisión para no empezar de cero. Si algo no es cierto, corrígelo: es lo que más mejora las revisiones.">
        <template #actions>
          <template v-if="isAdmin && !editing">
            <UiButton size="sm" @click="startEdit"><template #icon><Pencil :size="14" /></template>Editar</UiButton>
            <UiButton v-if="profile.agent_available" size="sm" variant="ghost" :loading="busy === 'regenerate'" :disabled="profile.generating" @click="regenerate"><template #icon><RefreshCw :size="14" /></template>Volver a estudiar</UiButton>
          </template>
        </template>
        <div class="meta">
          <UiBadge :tone="profile.active.source === 'agent' ? 'info' : 'success'">{{ sourceLabel(profile.active) }}</UiBadge>
          <span class="muted small">{{ dateTime(profile.active.created_at) }}<template v-if="profile.active.commit_sha"> · commit <code>{{ profile.active.commit_sha.slice(0, 7) }}</code></template></span>
          <a v-if="profile.active.pr_url" :href="profile.active.pr_url" target="_blank" rel="noopener" class="pr-link"><ExternalLink :size="14" />Ver la PR de la ficha en Bitbucket</a>
        </div>
        <div v-if="editing" class="editor">
          <label class="sr-only" for="profile-text">Texto de la ficha en Markdown</label>
          <textarea id="profile-text" v-model="draft" class="control prompt" spellcheck="false" maxlength="40000" />
          <div class="bar">
            <span class="muted small tabular">{{ draft.length.toLocaleString('es-ES') }} caracteres · Markdown</span>
            <div class="row-actions">
              <UiButton variant="ghost" :disabled="busy === 'save'" @click="cancelEdit">Cancelar</UiButton>
              <UiButton variant="primary" :loading="busy === 'save'" :disabled="draft.trim().length < 200" @click="saveEdit">Guardar ficha</UiButton>
            </div>
          </div>
          <p v-if="profile.publish_pr" class="muted small">Al guardar, Sancho actualiza también la PR de <code>.sancho/proyecto.md</code> en Bitbucket.</p>
        </div>
        <UiMarkdown v-else :text="profile.active.content" />
      </UiCard>

      <UiCard v-if="profile.history.length > 1" title="Versiones anteriores" description="Cada vez que Sancho estudia el repositorio o alguien edita la ficha, se guarda una versión.">
        <ol class="history">
          <li v-for="(v, i) in profile.history" :key="v.id">
            <span class="when tabular">{{ dateTime(v.created_at) }}</span>
            <UiBadge :tone="v.source === 'agent' ? 'info' : 'success'">{{ sourceLabel(v) }}</UiBadge>
            <span v-if="i === 0" class="muted small">· en uso</span>
            <UiButton v-else-if="isAdmin" size="sm" variant="ghost" class="load" @click="draft = v.content; editing = true">Cargar en el editor</UiButton>
          </li>
        </ol>
      </UiCard>
    </div>

    <LearnedRules v-else-if="tab === 'aprendido'" :repo-id="repo.id" />
    <ConversationsList v-else-if="tab === 'conversaciones'" :repo-id="repo.id" />

    <!-- Configuración del repositorio -->
    <div v-else class="stack">
      <UiNotice v-if="configError" tone="danger" title="No se pudo leer el repositorio">{{ configError }}</UiNotice>
      <UiCard v-else title=".sancho.yml" description="El equipo puede configurar a Sancho desde el propio repositorio, junto al código. Se lee de la rama de destino de cada PR, para que una PR no pueda relajar sus propias reglas.">
        <template #actions>
          <UiBadge v-if="config" :tone="config.error ? 'danger' : config.found ? 'success' : 'neutral'">{{ config.error ? 'Con errores' : config.found ? `Encontrado en ${config.branch}` : 'No hay .sancho.yml' }}</UiBadge>
        </template>
        <UiSkeleton v-if="!config && !repo.remote_uuid.startsWith('sim:')" kind="text" :count="4" />
        <template v-else-if="config?.found">
          <UiNotice v-if="config.error" tone="danger" class="gap">{{ config.error }} Mientras tanto, Sancho revisa sin él.</UiNotice>
          <pre class="yaml">{{ config.text }}</pre>
        </template>
        <p v-else class="muted">Este repositorio no tiene <code>.sancho.yml</code>. Es opcional: si lo añades en la raíz, Sancho lo leerá desde la siguiente revisión.</p>
      </UiCard>
      <UiCard title="Ejemplo" description="Copia este fichero en la raíz del repositorio como .sancho.yml y adáptalo. Todos los campos son opcionales.">
        <pre class="yaml">{{ example }}</pre>
      </UiCard>
    </div>
  </template>
</template>

<style scoped>
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-6); }
.small { font-size: var(--text-xs); }
.pr-link { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--text-sm); font-weight: 600; }
.inline-spin { display: inline-flex; align-items: center; gap: var(--space-2); }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.editor { display: flex; flex-direction: column; gap: var(--space-3); }
.prompt { min-height: 520px; font-family: var(--font-mono); font-size: 13px; line-height: 1.6; }
.bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.history { list-style: none; margin: 0; padding: 0; }
.history li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border); font-size: var(--text-sm); }
.history li:last-child { border-bottom: 0; }
.when { font-weight: 500; }
.load { margin-left: auto; }
.yaml { margin: 0; padding: var(--space-4); border-radius: var(--radius-md); background: var(--color-surface-muted); font-family: var(--font-mono); font-size: 13px; line-height: 1.6; overflow-x: auto; white-space: pre; }
.gap { margin-bottom: var(--space-4); }
@media (max-width: 767px) { .prompt { min-height: 380px; } }
</style>
