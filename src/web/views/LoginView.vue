<script setup lang="ts">
// Entrada al panel. Con ?activate=<token> en la URL, en vez de iniciar sesión se elige la
// contraseña de una cuenta nueva o se cambia la olvidada (el enlace lo da un administrador).
import {computed, ref} from 'vue';
import {errorMessage, post} from '../lib/api';
import {notify} from '../lib/ui-state';
import UiButton from '../ui/UiButton.vue';
import UiField from '../ui/UiField.vue';
import UiNotice from '../ui/UiNotice.vue';

const emit = defineEmits<{signedIn: [user: {id: string; email: string; role: 'admin' | 'member'}]}>();
const activationToken = ref(new URLSearchParams(location.search).get('activate') || '');
const email = ref(''), password = ref(''), newPassword = ref(''), repeatPassword = ref('');
const busy = ref(false), error = ref(''), touched = ref({email: false, newPassword: false, repeat: false});

const emailError = computed(() => touched.value.email && email.value && !/^\S+@\S+\.\S+$/.test(email.value) ? 'Escribe un correo con el formato nombre@empresa.com.' : '');
const newPasswordError = computed(() => touched.value.newPassword && newPassword.value.length < 12 ? 'La contraseña necesita al menos 12 caracteres.' : '');
const repeatError = computed(() => touched.value.repeat && repeatPassword.value !== newPassword.value ? 'Las dos contraseñas no coinciden.' : '');

async function signIn() {
  error.value = ''; busy.value = true;
  try { emit('signedIn', await post('/auth/login', {email: email.value, password: password.value})); }
  catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
async function activate() {
  touched.value = {email: false, newPassword: true, repeat: true};
  if (newPasswordError.value || repeatError.value) return;
  error.value = ''; busy.value = true;
  try {
    await post('/auth/activate', {token: activationToken.value, password: newPassword.value});
    history.replaceState({}, '', location.pathname);
    activationToken.value = '';
    notify('success', 'Contraseña guardada', 'Ya puedes entrar con tu correo y la contraseña nueva.');
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
</script>

<template>
  <main class="login">
    <aside class="brand">
      <div class="brand-inner">
        <img src="/sancho-mark-192.png" alt="" width="72" height="72" class="mark">
        <p class="eyebrow">El escudero de tus pull requests</p>
        <p class="claim">Revisiones de código con IA que tu equipo sí va a leer.</p>
        <ul class="points">
          <li>Detecta fallos de seguridad y regresiones antes de fusionar.</li>
          <li>Comenta en la línea exacta, en tres frases y con el arreglo.</li>
          <li>Tú decides siempre: nunca aprueba ni fusiona.</li>
        </ul>
      </div>
    </aside>

    <section class="form-side">
      <div class="form-box">
        <img src="/sancho-mark-96.png" alt="Sancho" width="48" height="48" class="mobile-mark">
        <template v-if="!activationToken">
          <h1>Bienvenido a Sancho</h1>
          <p class="lead">Entra con la cuenta de tu equipo.</p>
          <form class="form" novalidate @submit.prevent="signIn">
            <UiField v-slot="f" label="Correo" :error="emailError">
              <input :id="f.id" v-model="email" class="control" type="email" autocomplete="username" required :aria-invalid="f.invalid" :aria-describedby="f.describedby" @blur="touched.email = true">
            </UiField>
            <UiField v-slot="f" label="Contraseña">
              <input :id="f.id" v-model="password" class="control" type="password" autocomplete="current-password" required>
            </UiField>
            <UiNotice v-if="error" tone="danger">{{ error }}</UiNotice>
            <UiButton type="submit" variant="primary" block :loading="busy" :disabled="!email || !password">Entrar</UiButton>
          </form>
          <p class="foot">¿Aún sin cuenta o has olvidado la contraseña? El administrador de tu equipo te envía un enlace de acceso en segundos.</p>
        </template>
        <template v-else>
          <h1>Crea tu contraseña</h1>
          <p class="lead">Un último paso y tendrás tus revisiones listas. Este enlace solo sirve una vez.</p>
          <form class="form" novalidate @submit.prevent="activate">
            <UiField v-slot="f" label="Contraseña nueva" help="Al menos 12 caracteres." :error="newPasswordError">
              <input :id="f.id" v-model="newPassword" class="control" type="password" autocomplete="new-password" :aria-invalid="f.invalid" :aria-describedby="f.describedby" @blur="touched.newPassword = true">
            </UiField>
            <UiField v-slot="f" label="Repite la contraseña" :error="repeatError">
              <input :id="f.id" v-model="repeatPassword" class="control" type="password" autocomplete="new-password" :aria-invalid="f.invalid" :aria-describedby="f.describedby" @blur="touched.repeat = true">
            </UiField>
            <UiNotice v-if="error" tone="danger">{{ error }}</UiNotice>
            <UiButton type="submit" variant="primary" block :loading="busy">Crear contraseña y continuar</UiButton>
          </form>
        </template>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login { min-height: 100vh; display: grid; grid-template-columns: 1fr; background: var(--color-bg); }
.brand { display: none; }
.form-side { display: grid; place-items: center; padding: var(--space-8) var(--space-4); }
.form-box { width: min(400px, 100%); }
.mobile-mark { border-radius: 50%; margin-bottom: var(--space-6); }
h1 { font-size: var(--text-2xl); }
.lead { margin-top: var(--space-2); color: var(--color-text-muted); }
.form { display: flex; flex-direction: column; gap: var(--space-4); margin-top: var(--space-8); }
.form :deep(.btn) { margin-top: var(--space-2); }
.foot { margin-top: var(--space-6); font-size: var(--text-sm); color: var(--color-text-muted); }

@media (min-width: 1024px) {
  .login { grid-template-columns: minmax(420px, 5fr) 7fr; }
  .brand { display: flex; align-items: center; padding: var(--space-16); background: var(--color-sidebar); color: #f3f1e7; }
  .brand-inner { max-width: 420px; }
  .mark { border-radius: 50%; box-shadow: 0 0 0 6px rgb(244 185 66 / 0.18); }
  .eyebrow { margin-top: var(--space-8); color: var(--gold-500); font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
  .claim { margin-top: var(--space-3); font-size: var(--text-2xl); font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; }
  .points { margin: var(--space-8) 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-3); color: var(--color-sidebar-text); }
  .points li { position: relative; padding-left: var(--space-6); }
  .points li::before { content: ''; position: absolute; left: 0; top: 0.55em; width: 8px; height: 8px; border-radius: 50%; background: var(--green-400); }
  .mobile-mark { display: none; }
}
</style>
