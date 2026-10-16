<script setup lang="ts">
// Editor de las instrucciones de la IA (Ajustes → Instrucciones de la IA). Cada guardado crea una
// versión; se puede volver al original de prompts/ o cargar una versión anterior en el editor.
// El formato de la respuesta lo fija el servidor: editar el texto no puede romper la revisión.
import {computed, ref} from 'vue';
import {History, RotateCcw} from 'lucide-vue-next';
import {api, errorMessage, put} from '../lib/api';
import {dateTime} from '../lib/format';
import {ask, notify} from '../lib/ui-state';
import {useLoad} from '../lib/use-load';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';

interface Version { id: string; created_at: string; actor: string | null; content: string | null }
interface Prompt { name: string; label: string; original: string; content: string; customized: boolean; updated_at: string | null; updated_by: string | null; history: Version[] }

const help: Record<string, string> = {
  deteccion: 'Primera pasada: qué buscar, qué no comentar, cómo medir la gravedad y cómo escribir cada hallazgo.',
  verificacion: 'Segunda pasada: cómo comprobar cada hallazgo antes de publicarlo y cuándo descartarlo.',
  agente: 'Se añade a las dos anteriores cuando revisa el agente de Claude: cómo explorar el repositorio y qué puede hacer.',
  ficha: 'Cómo estudia Sancho un repositorio entero para escribir su ficha del proyecto: qué mirar y qué secciones escribir.',
};

const selected = ref('deteccion');
const draft = ref('');
const saving = ref(false);
const {data: prompts, loading, error, reload} = useLoad(async () => {
  const list = await api<Prompt[]>('/prompts');
  draft.value = list.find(p => p.name === selected.value)?.content || '';
  return list;
});
const current = computed(() => prompts.value?.find(p => p.name === selected.value));
const dirty = computed(() => !!current.value && draft.value !== current.value.content);

async function pick(name: string) {
  if (name === selected.value) return;
  if (dirty.value && !await ask({title: 'Tienes cambios sin guardar', text: 'Si cambias de instrucción, se perderán.', confirmLabel: 'Descartar y cambiar', danger: true})) return;
  selected.value = name;
  draft.value = current.value?.content || '';
}

async function save(content: string | null, message: string) {
  saving.value = true;
  try {
    await put(`/prompts/${selected.value}`, {content});
    await reload();
    draft.value = current.value?.content || '';
    notify('success', message, 'Se aplica desde la próxima revisión.');
  } catch (e) { notify('danger', 'No se pudo guardar', errorMessage(e)); }
  finally { saving.value = false; }
}
const saveDraft = () => save(draft.value, `Instrucciones de ${current.value?.label.toLowerCase()} guardadas`);
async function restoreOriginal() {
  if (!await ask({title: '¿Volver a las instrucciones originales?', text: 'Se usará el texto que viene con Sancho. Tu versión quedará en el historial por si la necesitas.', confirmLabel: 'Restaurar original', danger: true})) return;
  await save(null, 'Instrucciones originales restauradas');
}
function loadVersion(v: Version) {
  draft.value = v.content ?? current.value?.original ?? '';
  notify('info', 'Versión cargada en el editor', 'Revísala y pulsa «Guardar cambios» para usarla.');
}
</script>

<template>
  <UiNotice v-if="error" tone="danger" title="No se pudieron cargar las instrucciones">
    {{ error }}
    <template #action><UiButton size="sm" @click="reload">Reintentar</UiButton></template>
  </UiNotice>
  <UiCard v-else-if="loading"><UiSkeleton kind="text" :count="8" /></UiCard>

  <div v-else class="stack">
    <UiCard title="Instrucciones de la IA" description="El texto que lee el modelo antes de cada revisión. Lo que escribas aquí sustituye al original; las reglas del equipo se añaden al final, y el formato de la respuesta lo fija Sancho.">
      <div class="segmented" role="radiogroup" aria-label="Instrucción que editas">
        <button v-for="p in prompts" :key="p.name" type="button" role="radio" :aria-checked="p.name === selected" :class="{on: p.name === selected}" @click="pick(p.name)">
          {{ p.label }}<span v-if="p.customized" class="dot" title="Personalizada" />
        </button>
      </div>

      <div v-if="current" class="editor">
        <div class="meta">
          <p class="muted">{{ help[current.name] }}</p>
          <div class="meta-right">
            <UiBadge :tone="current.customized ? 'info' : 'neutral'">{{ current.customized ? 'Personalizada' : 'Original' }}</UiBadge>
            <span v-if="current.updated_at" class="muted small">{{ current.updated_by || 'Alguien' }} · {{ dateTime(current.updated_at) }}</span>
          </div>
        </div>
        <label class="sr-only" for="prompt-text">Texto de las instrucciones de {{ current.label.toLowerCase() }}</label>
        <textarea id="prompt-text" v-model="draft" class="control prompt" spellcheck="false" maxlength="40000" />
        <div class="bar">
          <span class="muted small tabular">{{ draft.length.toLocaleString('es-ES') }} caracteres{{ dirty ? ' · cambios sin guardar' : '' }}</span>
          <div class="row-actions">
            <UiButton v-if="current.customized" variant="danger" :disabled="saving" @click="restoreOriginal"><template #icon><RotateCcw :size="16" /></template>Restaurar original</UiButton>
            <UiButton v-if="dirty" variant="ghost" :disabled="saving" @click="draft = current.content">Descartar cambios</UiButton>
            <UiButton variant="primary" :loading="saving" :disabled="!dirty" @click="saveDraft">Guardar cambios</UiButton>
          </div>
        </div>
      </div>
    </UiCard>

    <UiCard v-if="current?.history.length" :title="`Historial de ${current.label.toLowerCase()}`" description="Las últimas versiones guardadas. Carga una en el editor para revisarla y volver a usarla.">
      <ol class="history">
        <li v-for="(v, i) in current.history" :key="v.id">
          <History :size="16" class="muted" aria-hidden="true" />
          <span class="when tabular">{{ dateTime(v.created_at) }}</span>
          <span class="muted">{{ v.actor || 'Alguien' }}</span>
          <UiBadge :tone="v.content ? 'info' : 'neutral'">{{ v.content ? 'Personalizada' : 'Original' }}</UiBadge>
          <span v-if="i === 0" class="muted small">· en uso</span>
          <UiButton v-else size="sm" variant="ghost" class="load" @click="loadVersion(v)">Cargar en el editor</UiButton>
        </li>
      </ol>
    </UiCard>
  </div>
</template>

<style scoped>
.segmented { display: inline-flex; flex-wrap: wrap; gap: var(--space-1); padding: var(--space-1); margin-bottom: var(--space-6); border-radius: var(--radius-md); background: var(--color-surface-muted); }
.segmented button { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 36px; padding: 0 var(--space-4); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); font-size: var(--text-sm); font-weight: 500; transition: color var(--duration) var(--ease); }
.segmented button:hover { color: var(--color-text); }
.segmented button.on { color: var(--color-text); font-weight: 600; background: var(--active-line) bottom / 100% 2px no-repeat, var(--color-surface); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--state-info-dot); }
.editor { display: flex; flex-direction: column; gap: var(--space-3); }
.meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.meta p { font-size: var(--text-sm); max-width: 75ch; }
.meta-right { display: flex; align-items: center; gap: var(--space-3); }
.small { font-size: var(--text-xs); }
.prompt { min-height: 480px; font-family: var(--font-mono); font-size: 13px; line-height: 1.6; tab-size: 2; }
.bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.history { list-style: none; margin: 0; padding: 0; }
.history li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border); font-size: var(--text-sm); }
.history li:last-child { border-bottom: 0; }
.when { font-weight: 500; }
.load { margin-left: auto; }
@media (max-width: 767px) { .prompt { min-height: 360px; } }
</style>
