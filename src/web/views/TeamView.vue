<script setup lang="ts">
// Equipo (solo administración): crear cuentas, dar enlaces para elegir o cambiar la contraseña y
// desactivar cuentas. No se envían correos: el enlace se copia y se entrega por un canal seguro.
import {computed, reactive, ref} from 'vue';
import {KeyRound, UserPlus, Users} from 'lucide-vue-next';
import {api, errorMessage, patch, post} from '../lib/api';
import {date} from '../lib/format';
import {user as me} from '../lib/session';
import {ask, notify, route, setTab} from '../lib/ui-state';
import {useLoad} from '../lib/use-load';
import PageHeader from '../ui/PageHeader.vue';
import UiBadge from '../ui/UiBadge.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiEmpty from '../ui/UiEmpty.vue';
import UiField from '../ui/UiField.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiTabs from '../ui/UiTabs.vue';

interface Account { id: string; email: string; role: 'admin' | 'member'; active: boolean; created_at: string }
const {data: users, loading, error, reload} = useLoad(() => api<Account[]>('/users'));
defineExpose({reload});

const tab = computed({get: () => route.tab === 'pendientes' ? 'pendientes' : 'activas', set: setTab});
const tabs = computed(() => [
  {id: 'activas', label: 'Activas', count: (users.value || []).filter(u => u.active).length},
  {id: 'pendientes', label: 'Pendientes o desactivadas', count: (users.value || []).filter(u => !u.active).length},
]);
const shown = computed(() => (users.value || []).filter(u => u.active === (tab.value === 'activas')));

const invite = reactive({email: '', role: 'member'});
const inviteTouched = ref(false), creating = ref(false), busy = reactive<Record<string, boolean>>({});
const inviteError = computed(() => inviteTouched.value && !/^\S+@\S+\.\S+$/.test(invite.email) ? 'Escribe un correo con el formato nombre@empresa.com.' : '');
const roleName = (r: string) => r === 'admin' ? 'Administración' : 'Miembro';

async function create() {
  inviteTouched.value = true;
  if (inviteError.value) return;
  creating.value = true;
  try {
    const r = await post<{activation_token: string}>('/users', invite);
    const email = invite.email;
    Object.assign(invite, {email: '', role: 'member'}); inviteTouched.value = false;
    await reload();
    creating.value = false;
    await ask({title: 'Cuenta creada', text: `Envía este enlace a ${email} por un canal seguro. Sirve una vez y caduca en 24 horas.`, copyValue: `${location.origin}/?activate=${r.activation_token}`, confirmLabel: 'Hecho', cancelLabel: null});
  } catch (e) { notify('danger', 'No se pudo crear la cuenta', errorMessage(e)); }
  finally { creating.value = false; }
}

async function resetLink(u: Account) {
  busy[u.id] = true;
  try {
    const r = await post<{reset_token: string}>(`/users/${u.id}/reset-link`);
    await ask({title: 'Enlace para cambiar la contraseña', text: `Envíalo a ${u.email} por un canal seguro. Sirve una vez y caduca en 30 minutos. Sus sesiones abiertas se han cerrado.`, copyValue: `${location.origin}/?activate=${r.reset_token}`, confirmLabel: 'Hecho', cancelLabel: null});
  } catch (e) { notify('danger', 'No se pudo crear el enlace', errorMessage(e)); }
  finally { busy[u.id] = false; }
}

async function toggle(u: Account) {
  if (u.active && !await ask({title: `¿Desactivar a ${u.email}?`, text: 'No podrá entrar y se cerrarán sus sesiones. Puedes volver a activarla cuando quieras.', confirmLabel: 'Desactivar', danger: true})) return;
  busy[u.id] = true;
  try {
    await patch(`/users/${u.id}`, {active: !u.active});
    notify('success', u.active ? 'Cuenta desactivada' : 'Cuenta activada', u.email);
    await reload();
  } catch (e) { notify('danger', 'No se pudo cambiar la cuenta', errorMessage(e)); }
  finally { busy[u.id] = false; }
}
</script>

<template>
  <PageHeader title="Equipo" description="Da acceso a tu equipo en segundos. Todos ven las revisiones; solo administración cambia ajustes y publica en Bitbucket." />

  <div class="stack">
    <UiCard title="Invitar a alguien" description="Crea la cuenta y comparte el enlace de acceso: la persona elige su contraseña y entra.">
      <form class="invite" novalidate @submit.prevent="create">
        <UiField v-slot="f" label="Correo" :error="inviteError">
          <input :id="f.id" v-model.trim="invite.email" class="control" type="email" autocomplete="off" placeholder="nombre@empresa.com" :aria-invalid="f.invalid" :aria-describedby="f.describedby" @blur="inviteTouched = !!invite.email">
        </UiField>
        <UiField v-slot="f" label="Permisos" :help="invite.role === 'admin' ? 'Además de revisar, cambia ajustes, equipo y publica en Bitbucket.' : 'Consulta todo y pide revisiones en el panel.'">
          <select :id="f.id" v-model="invite.role" class="control" :aria-describedby="f.describedby">
            <option value="member">Miembro</option>
            <option value="admin">Administración</option>
          </select>
        </UiField>
        <UiButton type="submit" variant="primary" :loading="creating"><template #icon><UserPlus :size="16" /></template>Crear cuenta</UiButton>
      </form>
    </UiCard>

    <UiNotice v-if="error" tone="danger" title="No se pudo cargar el equipo">
      {{ error }}
      <template #action><UiButton size="sm" @click="reload">Reintentar</UiButton></template>
    </UiNotice>

    <div v-else>
    <UiTabs v-if="!loading" v-model="tab" :tabs="tabs" label="Cuentas por estado" />
    <UiCard flush>
      <div v-if="loading" class="pad"><UiSkeleton /></div>
      <UiEmpty v-else-if="!shown.length" :icon="Users" :title="tab === 'activas' ? 'No hay cuentas activas' : 'Nadie pendiente'" :text="tab === 'activas' ? undefined : 'Todas las invitaciones están aceptadas y ninguna cuenta está desactivada.'" />
      <div v-else class="table-wrap">
        <table class="table cards-wide">
          <thead><tr><th>Correo</th><th>Permisos</th><th>Estado</th><th>Alta</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            <tr v-for="u in shown" :key="u.id">
              <td data-label="Correo" class="email">{{ u.email }}<span v-if="u.id === me?.id" class="you"> · tú</span></td>
              <td data-label="Permisos">{{ roleName(u.role) }}</td>
              <td data-label="Estado"><UiBadge :tone="u.active ? 'success' : 'neutral'">{{ u.active ? 'Activa' : 'Pendiente o desactivada' }}</UiBadge></td>
              <td data-label="Alta" class="muted nowrap">{{ date(u.created_at) }}</td>
              <td class="actions" data-label="">
                <div class="row-actions end">
                  <UiButton size="sm" variant="ghost" :loading="busy[u.id]" @click="resetLink(u)"><template #icon><KeyRound :size="14" /></template>Enlace de contraseña</UiButton>
                  <UiButton v-if="u.id !== me?.id" size="sm" :variant="u.active ? 'danger' : 'secondary'" :disabled="busy[u.id]" @click="toggle(u)">{{ u.active ? 'Desactivar' : 'Activar' }}</UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>
    </div>
  </div>
</template>

<style scoped>
.pad { padding: var(--space-6); }
.invite { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr); align-items: start; }
.invite > :deep(.btn) { align-self: end; }
.email { font-weight: 500; overflow-wrap: anywhere; }
.you { color: var(--color-text-muted); font-weight: 400; }
.end { justify-content: flex-end; flex-wrap: nowrap; }
@media (min-width: 768px) { .invite { grid-template-columns: 2fr 2fr auto; } .invite > :deep(.btn) { margin-top: 28px; } }
@media (max-width: 1023px) { .end { justify-content: flex-start; flex-wrap: wrap; } .actions { padding-top: var(--space-2) !important; } .actions::before { display: none; } }
</style>
