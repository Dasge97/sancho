<script setup lang="ts">
// Historial de revisiones con subpestañas por estado. Las fallidas y las parciales se ven como
// tales («Con incidencias»), nunca como revisiones sin problemas.
import {computed} from 'vue';
import {ScanSearch} from 'lucide-vue-next';
import {api} from '../lib/api';
import {dateTime, publicationState, relative, reviewState} from '../lib/format';
import {go, route, setTab} from '../lib/ui-state';
import {useLoad} from '../lib/use-load';
import PageHeader from '../ui/PageHeader.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiTabs from '../ui/UiTabs.vue';

const {data: reviews, loading, error, reload} = useLoad(() => api<any[]>('/reviews'));
defineExpose({reload});

const groups: Record<string, (s: string) => boolean> = {
  todas: () => true,
  'en-curso': s => s === 'queued' || s === 'analyzing',
  completadas: s => s === 'completed',
  incidencias: s => s === 'failed' || s === 'partial',
};
const tab = computed({get: () => route.tab && groups[route.tab] ? route.tab : 'todas', set: setTab});
const count = (g: string) => (reviews.value || []).filter(r => groups[g](r.status)).length;
const tabs = computed(() => [
  {id: 'todas', label: 'Todas', count: count('todas')},
  {id: 'en-curso', label: 'En curso', count: count('en-curso')},
  {id: 'completadas', label: 'Completadas', count: count('completadas')},
  {id: 'incidencias', label: 'Con incidencias', count: count('incidencias')},
]);
const shown = computed(() => (reviews.value || []).filter(r => groups[tab.value](r.status)));
const emptyText: Record<string, string> = {
  'en-curso': 'Ahora mismo no hay ninguna revisión en marcha.',
  completadas: 'Aquí aparecerán las revisiones terminadas.',
  incidencias: 'Ninguna revisión ha fallado ni se ha quedado a medias.',
};
</script>

<template>
  <PageHeader title="Revisiones" description="Cada pull request que Sancho ha analizado, con su resultado y lo que se ha comentado en Bitbucket." />

  <UiNotice v-if="error" tone="danger" title="No se pudieron cargar las revisiones">
    {{ error }}
    <template #action><UiButton size="sm" @click="reload">Reintentar</UiButton></template>
  </UiNotice>

  <template v-else>
    <UiTabs v-if="!loading && reviews?.length" v-model="tab" :tabs="tabs" label="Revisiones por estado" />
    <UiCard flush>
      <div v-if="loading" class="pad"><UiSkeleton :count="6" /></div>
      <UiEmpty v-else-if="!reviews?.length" :icon="ScanSearch" title="Aún no hay revisiones" text="Pide la primera desde Repositorios o abre una pull request en un repositorio con la revisión automática activada.">
        <UiButton variant="primary" @click="go('repositorios')">Revisar una pull request</UiButton>
      </UiEmpty>
      <UiEmpty v-else-if="!shown.length" :icon="ScanSearch" title="Nada por aquí" :text="emptyText[tab]" />
      <div v-else class="table-wrap">
        <table class="table cards">
          <thead><tr><th>Pull request</th><th>Repositorio</th><th>Resultado</th><th>En Bitbucket</th><th>Fecha</th></tr></thead>
          <tbody>
            <tr v-for="r in shown" :key="r.id" class="clickable" tabindex="0" @click="go('revision', r.id)" @keydown.enter="go('revision', r.id)">
              <td data-label="Pull request" class="pr-cell">
                <span class="title"><span class="muted tabular">#{{ r.number }}</span> {{ r.title }}</span>
                <span v-if="r.summary" class="summary">{{ r.summary }}</span>
              </td>
              <td data-label="Repositorio" class="muted nowrap">{{ r.repository }}</td>
              <td data-label="Resultado"><UiBadge :tone="reviewState(r.status)[1]">{{ reviewState(r.status)[0] }}</UiBadge></td>
              <td data-label="En Bitbucket"><UiBadge :tone="publicationState(r.publication_status)[1]">{{ publicationState(r.publication_status)[0] }}</UiBadge></td>
              <td data-label="Fecha" class="muted nowrap" :title="dateTime(r.created_at)">{{ relative(r.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>
  </template>
</template>

<style scoped>
.pad { padding: var(--space-6); }
.table-wrap { margin: 0; }
.pr-cell { max-width: 560px; }
.title { display: block; font-weight: 500; }
.summary { display: -webkit-box; margin-top: 2px; color: var(--color-text-muted); font-size: var(--text-xs); -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
@media (max-width: 767px) { .summary { -webkit-line-clamp: 2; } }
</style>
