<script setup lang="ts">
// Lo que Sancho ha aprendido en un repositorio: de las respuestas en las PR, de los falsos positivos
// marcados con motivo y de lo que añade administración. Se suma a las instrucciones de cada revisión.
import {ref} from 'vue';
import {GraduationCap, Plus, Trash2} from 'lucide-vue-next';
import {api, errorMessage, patch, post} from '../lib/api';
import {dateTime} from '../lib/format';
import {isAdmin} from '../lib/session';
import {ask, notify} from '../lib/ui-state';
import {useLoad} from '../lib/use-load';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiSwitch from '../ui/UiSwitch.vue';

interface Rule { id: string; text: string; source: 'conversacion' | 'falso_positivo' | 'panel'; active: boolean; created_at: string; actor: string | null; conversation_author: string | null }
const props = defineProps<{repoId: string}>();
const {data: rules, loading, error, reload} = useLoad(() => api<Rule[]>(`/repositories/${props.repoId}/learned`));
const draft = ref(''), adding = ref(false);

const origin = (r: Rule) => r.source === 'conversacion' ? `De una conversación con ${r.conversation_author || 'el equipo'}` : r.source === 'falso_positivo' ? `Falso positivo marcado por ${r.actor || 'el equipo'}` : `Añadida por ${r.actor || 'administración'}`;

async function add() {
  adding.value = true;
  try { await post(`/repositories/${props.repoId}/learned`, {text: draft.value.trim()}); draft.value = ''; await reload(); notify('success', 'Regla añadida', 'Sancho la tendrá en cuenta desde la próxima revisión.'); }
  catch (e) { notify('danger', 'No se pudo añadir', errorMessage(e)); }
  finally { adding.value = false; }
}
async function toggle(r: Rule, active: boolean) {
  r.active = active;
  try { await patch(`/learned/${r.id}`, {active}); }
  catch (e) { r.active = !active; notify('danger', 'No se pudo cambiar', errorMessage(e)); }
}
async function remove(r: Rule) {
  if (!await ask({title: '¿Borrar lo aprendido?', text: 'Sancho dejará de tenerlo en cuenta. Si solo quieres probar sin ello, desactívalo en lugar de borrarlo.', confirmLabel: 'Borrar', danger: true})) return;
  try { await api(`/learned/${r.id}`, {method: 'DELETE'}); await reload(); }
  catch (e) { notify('danger', 'No se pudo borrar', errorMessage(e)); }
}
</script>

<template>
  <UiNotice v-if="error" tone="danger" title="No se pudo cargar lo aprendido">{{ error }}</UiNotice>
  <div v-else class="stack">
    <UiCard v-if="isAdmin" title="Enseñar algo a Sancho" description="Una regla en una frase, como se la dirías a un compañero. Se aplica solo a este repositorio.">
      <form class="add" novalidate @submit.prevent="add">
        <label class="sr-only" for="learned-new">Regla nueva</label>
        <input id="learned-new" v-model="draft" class="control" maxlength="500" placeholder="Por ejemplo: los administradores pueden ver todas las facturas; no es un fallo de autorización.">
        <UiButton type="submit" variant="primary" :loading="adding" :disabled="draft.trim().length < 5"><template #icon><Plus :size="16" /></template>Añadir</UiButton>
      </form>
    </UiCard>

    <UiCard title="Lo que ha aprendido" description="Sale de las respuestas del equipo en las PR y de los falsos positivos marcados con motivo. Lo lee en cada revisión.">
      <UiSkeleton v-if="loading" />
      <UiEmpty v-else-if="!rules?.length" :icon="GraduationCap" title="Todavía no ha aprendido nada aquí" text="Responde a sus comentarios en Bitbucket o marca un falso positivo con su motivo, y Sancho lo recordará en las próximas revisiones." />
      <ul v-else class="rules">
        <li v-for="r in rules" :key="r.id" :class="{off: !r.active}">
          <div class="rule-main">
            <p class="rule-text">{{ r.text }}</p>
            <p class="muted small">{{ origin(r) }} · {{ dateTime(r.created_at) }}</p>
          </div>
          <UiBadge v-if="!isAdmin" :tone="r.active ? 'success' : 'neutral'">{{ r.active ? 'Activa' : 'Desactivada' }}</UiBadge>
          <div v-else class="rule-actions">
            <UiSwitch :model-value="r.active" :label="r.active ? 'Activa' : 'Desactivada'" @update:model-value="v => toggle(r, v)" />
            <UiButton size="sm" variant="ghost" :aria-label="'Borrar: ' + r.text" @click="remove(r)"><template #icon><Trash2 :size="14" /></template>Borrar</UiButton>
          </div>
        </li>
      </ul>
    </UiCard>
  </div>
</template>

<style scoped>
.add { display: flex; gap: var(--space-3); }
.add .control { flex: 1; }
.rules { list-style: none; margin: 0; padding: 0; }
.rules li { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) 0; border-bottom: 1px solid var(--color-border); }
.rules li:last-child { border-bottom: 0; }
.rules li.off .rule-text { color: var(--color-text-muted); text-decoration: line-through; }
.rule-main { flex: 1; min-width: 0; }
.rule-text { overflow-wrap: anywhere; }
.small { font-size: var(--text-xs); margin-top: var(--space-1); }
.rule-actions { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }
@media (max-width: 767px) {
  .add { flex-direction: column; }
  .rules li { flex-direction: column; align-items: flex-start; }
}
</style>
