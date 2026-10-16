<script setup lang="ts">
// Conversaciones con Sancho en las PR de un repositorio: lo que le escribieron y lo que contestó.
import {MessagesSquare} from 'lucide-vue-next';
import {api} from '../lib/api';
import {relative} from '../lib/format';
import {useLoad} from '../lib/use-load';
import type {Tone} from '../lib/ui-state';
import InlineCode from '../ui/InlineCode.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiMarkdown from '../ui/UiMarkdown.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';

const props = defineProps<{repoId: string}>();
const {data: items, loading, error} = useLoad(() => api<any[]>(`/repositories/${props.repoId}/conversations`));
const kinds: Record<string, string> = {thread: 'Respuesta a un comentario', question: 'Pregunta', review: '@sancho revisa', pause: '@sancho pausa', resume: '@sancho reanuda', help: '@sancho ayuda'};
const outcome = (c: any): [string, Tone] | null => c.status === 'failed' ? ['No pudo contestar', 'danger'] : c.status === 'pending' ? ['Contestando…', 'info'] : c.action === 'withdraw' ? ['Retiró el problema', 'success'] : c.action === 'resolve' ? ['Dio el problema por arreglado', 'success'] : null;
</script>

<template>
  <UiNotice v-if="error" tone="danger" title="No se pudieron cargar las conversaciones">{{ error }}</UiNotice>
  <UiCard v-else title="Conversaciones en las PR" description="Las respuestas a los comentarios de Sancho y los mensajes con @sancho de las últimas semanas. En Bitbucket, escribe @sancho ayuda para ver lo que puedes pedirle.">
    <UiSkeleton v-if="loading" />
    <UiEmpty v-else-if="!items?.length" :icon="MessagesSquare" title="Nadie ha hablado con Sancho todavía" text="Responde en el hilo de uno de sus comentarios o escribe @sancho en una PR de este repositorio." />
    <ol v-else class="conversations">
      <li v-for="c in items" :key="c.id">
        <div class="head">
          <a :href="c.url" target="_blank" rel="noopener" class="pr">#{{ c.number }} {{ c.title }}</a>
          <span class="muted small">{{ kinds[c.kind] || c.kind }} · {{ relative(c.created_at) }}</span>
          <UiBadge v-if="outcome(c)" :tone="outcome(c)![1]">{{ outcome(c)![0] }}</UiBadge>
        </div>
        <p class="message"><strong>{{ c.author }}:</strong> <InlineCode :text="c.message" /></p>
        <div v-if="c.reply" class="reply"><strong>Sancho:</strong><UiMarkdown :text="c.reply" /></div>
      </li>
    </ol>
  </UiCard>
</template>

<style scoped>
.conversations { list-style: none; margin: 0; padding: 0; }
.conversations li { padding: var(--space-4) 0; border-bottom: 1px solid var(--color-border); }
.conversations li:last-child { border-bottom: 0; }
.head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); }
.pr { font-weight: 600; }
.small { font-size: var(--text-xs); }
.message, .reply { max-width: 85ch; overflow-wrap: anywhere; font-size: var(--text-sm); }
.message { white-space: pre-line; }
.reply :deep(p) { margin: var(--space-1) 0 0; }
.reply { margin-top: var(--space-2); padding-left: var(--space-3); border-left: 3px solid var(--color-active); color: var(--color-text-muted); }
.reply strong { color: var(--color-text); }
</style>
