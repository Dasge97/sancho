<script setup lang="ts">
// Repositorios de Bitbucket: todos los miembros los ven; activar, pausar, instalar el webhook y
// publicar comentarios queda para administración (el servidor lo vuelve a comprobar).
import {computed, reactive, ref} from 'vue';
import {BookOpen, FolderGit2, MessageSquare, Pause, Play, RefreshCw, ScanSearch, Webhook} from 'lucide-vue-next';
import {api, errorMessage, patch, post} from '../lib/api';
import {isAdmin} from '../lib/session';
import {ask, go, notify, route, setTab} from '../lib/ui-state';
import {useLoad} from '../lib/use-load';
import PageHeader from '../ui/PageHeader.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiTabs from '../ui/UiTabs.vue';

interface Repo { id: string; workspace: string; slug: string; name: string; active: boolean; updated_at: string; webhook_id: string | null; remote_uuid: string }
const {data: repos, loading, error, reload} = useLoad(() => api<Repo[]>('/repositories'));
defineExpose({reload});

const tab = computed({get: () => route.tab === 'pausados' ? 'pausados' : 'activos', set: setTab});
const shown = computed(() => (repos.value || []).filter(r => r.active === (tab.value === 'activos')));
const tabs = computed(() => [
  {id: 'activos', label: 'Activos', count: (repos.value || []).filter(r => r.active).length},
  {id: 'pausados', label: 'Pausados', count: (repos.value || []).filter(r => !r.active).length},
]);

const syncing = ref(false);
const busy = reactive<Record<string, string>>({});
const prNumber = reactive<Record<string, string>>({});
const prError = reactive<Record<string, string>>({});

async function sync() {
  syncing.value = true;
  try {
    const r = await post<{synchronized: number}>('/connections/sync');
    notify('success', 'Catálogo al día', `${r.synchronized} repositorios en Bitbucket. Los nuevos aparecen en «Pausados» hasta que los actives.`);
    await reload();
  } catch (e) { notify('danger', 'No se pudo sincronizar', errorMessage(e)); }
  finally { syncing.value = false; }
}

async function setActive(repo: Repo, active: boolean) {
  if (!active && !await ask({title: `¿Pausar ${repo.name}?`, text: 'Sancho dejará de revisar sus pull requests hasta que lo reactives. Su historial de revisiones se conserva.', confirmLabel: 'Pausar', danger: true})) return;
  busy[repo.id] = 'active';
  try {
    await patch(`/repositories/${repo.id}`, {active, expected_updated_at: repo.updated_at});
    notify('success', active ? `${repo.name} está activo` : `${repo.name} está en pausa`, active ? 'Instala el webhook para que revise cada pull request sin que tengas que pedirlo.' : undefined);
    await reload();
  } catch (e) { notify('danger', 'No se pudo cambiar el repositorio', errorMessage(e)); }
  finally { delete busy[repo.id]; }
}

async function installWebhook(repo: Repo) {
  busy[repo.id] = 'webhook';
  try {
    await post(`/repositories/${repo.id}/webhook`);
    notify('success', 'Revisión automática activada', `Cada pull request de ${repo.name} se revisará en cuanto se abra o reciba cambios.`);
    await reload();
  } catch (e) { notify('danger', 'No se pudo instalar el webhook', errorMessage(e)); }
  finally { delete busy[repo.id]; }
}

async function review(repo: Repo, publish: boolean) {
  const n = Number(prNumber[repo.id]);
  prError[repo.id] = Number.isInteger(n) && n > 0 ? '' : 'Escribe el número de la pull request (por ejemplo, 12).';
  if (prError[repo.id]) return;
  if (publish && !await ask({title: `¿Comentar en la PR #${n}?`, text: 'Sancho publicará en Bitbucket un resumen y un comentario en cada línea con un problema. Los comentarios saldrán con el nombre de la cuenta conectada.', confirmLabel: 'Revisar y comentar'})) return;
  busy[repo.id] = publish ? 'publish' : 'review';
  try {
    const r = await post<{id: string | null; created: boolean}>(`/repositories/${repo.id}/reviews`, {number: n, publish, idempotency_key: crypto.randomUUID()});
    notify('success', r.created ? 'Revisión en marcha' : 'Estos cambios ya se están revisando', 'Normalmente tarda menos de un minuto.');
    if (r.id) go('revision', r.id);
  } catch (e) { notify('danger', 'No se pudo pedir la revisión', errorMessage(e)); }
  finally { delete busy[repo.id]; }
}
</script>

<template>
  <PageHeader title="Repositorios" description="Elige qué repositorios vigila Sancho. Con la revisión automática, cada pull request se analiza en cuanto se abre o recibe cambios.">
    <UiButton v-if="isAdmin" variant="primary" :loading="syncing" @click="sync"><template #icon><RefreshCw :size="16" /></template>Sincronizar con Bitbucket</UiButton>
  </PageHeader>

  <UiNotice v-if="error" tone="danger" title="No se pudieron cargar los repositorios">
    {{ error }}
    <template #action><UiButton size="sm" @click="reload">Reintentar</UiButton></template>
  </UiNotice>

  <UiCard v-else-if="loading"><UiSkeleton :count="3" /></UiCard>

  <UiTabs v-if="!error && !loading && repos?.length" v-model="tab" :tabs="tabs" label="Repositorios por estado" />

  <UiCard v-if="!error && !loading && !repos?.length">
    <UiEmpty :icon="FolderGit2" title="Conecta tus repositorios" :text="isAdmin ? 'Trae el catálogo de Bitbucket y activa los repositorios que quieras proteger. Lleva menos de un minuto.' : 'Pide a un administrador que conecte Bitbucket y active los repositorios de tu equipo.'">
      <div v-if="isAdmin" class="row-actions center">
        <UiButton variant="primary" :loading="syncing" @click="sync">Sincronizar con Bitbucket</UiButton>
        <UiButton variant="ghost" @click="go('ajustes', undefined, 'bitbucket')">Configurar la conexión</UiButton>
      </div>
    </UiEmpty>
  </UiCard>

  <UiCard v-if="!error && !loading && repos?.length && !shown.length">
    <UiEmpty :icon="FolderGit2" :title="tab === 'activos' ? 'Ningún repositorio activo' : 'No hay repositorios en pausa'" :text="tab === 'activos' ? 'Activa un repositorio desde «Pausados» para que Sancho empiece a revisarlo.' : 'Todos tus repositorios están siendo revisados.'">
      <UiButton v-if="tab === 'activos'" variant="primary" @click="tab = 'pausados'">Ver los pausados</UiButton>
    </UiEmpty>
  </UiCard>

  <div v-if="!error && !loading && shown.length" class="repo-list">
    <UiCard v-for="repo in shown" :key="repo.id">
      <div class="repo">
        <div class="repo-head">
          <span class="repo-icon" aria-hidden="true"><FolderGit2 :size="20" /></span>
          <div class="repo-name">
            <h2>{{ repo.name }}</h2>
            <p class="muted">{{ repo.workspace }} / {{ repo.slug }}</p>
          </div>
          <div class="badges">
            <UiBadge :tone="repo.active ? 'success' : 'neutral'">{{ repo.active ? 'Activo' : 'Pausado' }}</UiBadge>
            <UiBadge v-if="repo.active && !repo.remote_uuid.startsWith('sim:')" :tone="repo.webhook_id ? 'success' : 'warning'">{{ repo.webhook_id ? 'Revisión automática' : 'Sin webhook' }}</UiBadge>
          </div>
          <UiButton size="sm" variant="ghost" @click="go('repositorio', repo.id)"><template #icon><BookOpen :size="14" /></template>Ficha y configuración</UiButton>
        </div>

        <form v-if="repo.active" class="review-form" novalidate @submit.prevent="review(repo, false)">
          <div class="pr-field">
            <label :for="'pr-' + repo.id" class="label">Pull request</label>
            <div class="pr-input">
              <span class="hash" aria-hidden="true">#</span>
              <input :id="'pr-' + repo.id" v-model="prNumber[repo.id]" class="control" inputmode="numeric" placeholder="12" :aria-invalid="!!prError[repo.id]" :aria-describedby="prError[repo.id] ? 'pr-err-' + repo.id : undefined">
            </div>
            <p v-if="prError[repo.id]" :id="'pr-err-' + repo.id" class="field-error" role="alert">{{ prError[repo.id] }}</p>
          </div>
          <div class="row-actions">
            <UiButton type="submit" :loading="busy[repo.id] === 'review'"><template #icon><ScanSearch :size="16" /></template>Revisar en el panel</UiButton>
            <UiButton v-if="isAdmin" :loading="busy[repo.id] === 'publish'" @click="review(repo, true)"><template #icon><MessageSquare :size="16" /></template>Revisar y comentar</UiButton>
          </div>
        </form>

        <div v-if="isAdmin" class="admin-actions">
          <UiButton v-if="repo.active && !repo.webhook_id && !repo.remote_uuid.startsWith('sim:')" variant="ghost" size="sm" :loading="busy[repo.id] === 'webhook'" @click="installWebhook(repo)"><template #icon><Webhook :size="14" /></template>Instalar webhook</UiButton>
          <UiButton v-if="repo.active" variant="ghost" size="sm" :loading="busy[repo.id] === 'active'" @click="setActive(repo, false)"><template #icon><Pause :size="14" /></template>Pausar</UiButton>
          <UiButton v-else variant="primary" size="sm" :loading="busy[repo.id] === 'active'" @click="setActive(repo, true)"><template #icon><Play :size="14" /></template>Activar</UiButton>
        </div>
      </div>
    </UiCard>
  </div>
</template>

<style scoped>
.repo-list { display: flex; flex-direction: column; gap: var(--space-4); }
.repo { display: flex; flex-direction: column; gap: var(--space-6); }
.repo-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); }
.repo-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--radius-md); background: var(--color-primary-soft); color: var(--color-primary-text); flex-shrink: 0; }
.repo-name { flex: 1; min-width: 180px; }
.repo-name h2 { font-size: var(--text-md); }
.repo-name p { font-size: var(--text-sm); }
.badges { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.review-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-4); padding-top: var(--space-6); border-top: 1px solid var(--color-border); }
.pr-field { display: flex; flex-direction: column; gap: var(--space-2); width: 160px; }
.label { font-size: var(--text-sm); font-weight: 600; }
.pr-input { position: relative; }
.pr-input .control { padding-left: var(--space-8); }
.hash { position: absolute; left: var(--space-3); top: 50%; transform: translateY(-50%); color: var(--color-text-muted); font-size: var(--text-sm); }
.field-error { font-size: var(--text-xs); color: var(--color-danger-text); font-weight: 500; }
.admin-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: flex-end; margin-top: calc(-1 * var(--space-2)); }
.repo:has(.review-form) .admin-actions { margin-top: calc(-1 * var(--space-4)); }
.center { justify-content: center; }
@media (max-width: 767px) {
  .pr-field { width: 100%; }
  .review-form .row-actions { width: 100%; }
  .review-form .row-actions > * { flex: 1; }
  .admin-actions { justify-content: flex-start; margin-top: 0 !important; }
}
</style>
