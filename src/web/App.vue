<script setup lang="ts">
// Marco del panel: entrada, menú lateral (cajón en móvil), barra superior con migas de pan y la
// pantalla actual. La pantalla y su subpestaña van en la URL, así que se puede recargar y enlazar.
import {computed, onMounted, ref, watch, type Component} from 'vue';
import {ChevronRight, CircleDollarSign, FolderGit2, History, LayoutDashboard, LogOut, Menu, Monitor, Moon, ScanSearch, Settings, Sun, Users, X} from 'lucide-vue-next';
import {api, post} from './lib/api';
import {isAdmin, user, type User} from './lib/session';
import {crumbTail, go, route, setTheme, theme, type ThemeChoice, type ViewName} from './lib/ui-state';
import UiButton from './ui/UiButton.vue';
import UiDialog from './ui/UiDialog.vue';
import UiToasts from './ui/UiToasts.vue';
import UiSkeleton from './ui/UiSkeleton.vue';
import LoginView from './views/LoginView.vue';
import HomeView from './views/HomeView.vue';
import ReposView from './views/ReposView.vue';
import ReviewsView from './views/ReviewsView.vue';
import ReviewDetailView from './views/ReviewDetailView.vue';
import UsageView from './views/UsageView.vue';
import SettingsView from './views/SettingsView.vue';
import TeamView from './views/TeamView.vue';
import AuditView from './views/AuditView.vue';

interface NavItem { view: ViewName; label: string; icon: Component }
const work: NavItem[] = [
  {view: 'inicio', label: 'Panel', icon: LayoutDashboard},
  {view: 'repositorios', label: 'Repositorios', icon: FolderGit2},
  {view: 'revisiones', label: 'Revisiones', icon: ScanSearch},
  {view: 'consumo', label: 'Consumo', icon: CircleDollarSign},
];
const admin: NavItem[] = [
  {view: 'ajustes', label: 'Ajustes', icon: Settings},
  {view: 'equipo', label: 'Equipo', icon: Users},
  {view: 'auditoria', label: 'Auditoría', icon: History},
];
const views: Record<ViewName, Component> = {inicio: HomeView, repositorios: ReposView, revisiones: ReviewsView, revision: ReviewDetailView, consumo: UsageView, ajustes: SettingsView, equipo: TeamView, auditoria: AuditView};
const themes: {value: ThemeChoice; label: string; icon: Component}[] = [
  {value: 'light', label: 'Claro', icon: Sun}, {value: 'dark', label: 'Oscuro', icon: Moon}, {value: 'system', label: 'Sistema', icon: Monitor},
];

const checking = ref(true), menuOpen = ref(false);
const adminOnly: ViewName[] = ['ajustes', 'equipo', 'auditoria'];
const current = computed(() => adminOnly.includes(route.view) && !isAdmin.value ? 'inicio' : route.view);
const activeNav = computed(() => current.value === 'revision' ? 'revisiones' : current.value);

// Migas de pan: la sección y la pantalla; el último tramo lo pone la pantalla cuando lo sabe.
interface Crumb { label: string; view?: ViewName }
const crumbs = computed<Crumb[]>(() => {
  const all = [...work, ...admin];
  const base: Crumb[] = [{label: 'Sancho', view: 'inicio'}];
  if (current.value === 'inicio') return [...base, {label: 'Panel'}];
  if (current.value === 'revision') return [...base, {label: 'Revisiones', view: 'revisiones'}, {label: crumbTail.value || 'Revisión'}];
  const item = all.find(i => i.view === current.value)!;
  const section = adminOnly.includes(current.value) ? [{label: 'Administración'}] : [];
  return [...base, ...section, crumbTail.value ? {label: item.label, view: item.view} : {label: item.label}, ...(crumbTail.value ? [{label: crumbTail.value}] : [])];
});

watch(() => route.view, () => { menuOpen.value = false; crumbTail.value = ''; window.scrollTo({top: 0}); });
// En móvil, Escape cierra el menú, como cualquier ventana superpuesta.
window.addEventListener('keydown', e => { if (e.key === 'Escape') menuOpen.value = false; });

// Los enlaces «Detalle» de los comentarios de Bitbucket llegan con ?review=<id>.
function openLinkedReview() {
  const id = new URLSearchParams(location.search).get('review');
  if (!id) return;
  history.replaceState({}, '', location.pathname);
  go('revision', id);
}
function signedIn(u: User) { user.value = u; openLinkedReview(); }
async function signOut() {
  try { await post('/auth/logout'); } finally { user.value = null; go('inicio'); }
}
onMounted(async () => {
  try { user.value = await api<User>('/me'); openLinkedReview(); } catch { user.value = null; } finally { checking.value = false; }
});
</script>

<template>
  <div v-if="checking" class="boot"><UiSkeleton kind="text" :count="3" /></div>

  <LoginView v-else-if="!user" @signed-in="signedIn" />

  <div v-else class="shell">
    <Transition name="fade"><div v-if="menuOpen" class="scrim" @click="menuOpen = false" /></Transition>

    <aside class="sidebar" :class="{open: menuOpen}" aria-label="Menú principal">
      <div class="brand">
        <img src="/sancho-mark-96.png" alt="" width="36" height="36">
        <div><p class="brand-name">Sancho</p><p class="brand-sub">Revisión de código con IA</p></div>
        <button class="icon-btn close" type="button" aria-label="Cerrar el menú" @click="menuOpen = false"><X :size="20" /></button>
      </div>

      <nav class="nav">
        <p class="nav-group">Revisión de código</p>
        <a v-for="item in work" :key="item.view" :href="'#/' + item.view" class="nav-link" :class="{active: activeNav === item.view}" :aria-current="activeNav === item.view ? 'page' : undefined">
          <component :is="item.icon" :size="18" aria-hidden="true" />{{ item.label }}
        </a>
        <template v-if="isAdmin">
          <p class="nav-group">Administración</p>
          <a v-for="item in admin" :key="item.view" :href="'#/' + item.view" class="nav-link" :class="{active: activeNav === item.view}" :aria-current="activeNav === item.view ? 'page' : undefined">
            <component :is="item.icon" :size="18" aria-hidden="true" />{{ item.label }}
          </a>
        </template>
      </nav>

      <div class="side-bottom">
        <div class="theme" role="radiogroup" aria-label="Modo de color">
          <button v-for="t in themes" :key="t.value" type="button" role="radio" class="theme-btn" :class="{on: theme === t.value}" :aria-checked="theme === t.value" :title="t.label" @click="setTheme(t.value)">
            <component :is="t.icon" :size="16" aria-hidden="true" /><span>{{ t.label }}</span>
          </button>
        </div>
        <div class="me">
          <span class="avatar" aria-hidden="true">{{ user.email.slice(0, 1).toUpperCase() }}</span>
          <div class="me-text"><p class="me-email" :title="user.email">{{ user.email }}</p><p class="me-role">{{ isAdmin ? 'Administración' : 'Miembro del equipo' }}</p></div>
          <button class="icon-btn" type="button" aria-label="Cerrar sesión" title="Cerrar sesión" @click="signOut"><LogOut :size="18" /></button>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" type="button" aria-label="Abrir el menú" :aria-expanded="menuOpen" @click="menuOpen = true"><Menu :size="20" /></button>
        <img class="top-mark" src="/sancho-mark-96.png" alt="" width="28" height="28">
        <nav class="crumbs" aria-label="Estás en">
          <ol>
            <li v-for="(c, i) in crumbs" :key="i" :class="{first: i === 0}">
              <ChevronRight v-if="i > 0" :size="14" class="sep" aria-hidden="true" />
              <a v-if="c.view && i < crumbs.length - 1" :href="'#/' + c.view">{{ c.label }}</a>
              <span v-else :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ c.label }}</span>
            </li>
          </ol>
        </nav>
        <div class="top-actions">
          <UiButton v-if="current !== 'repositorios'" variant="primary" size="sm" @click="go('repositorios')"><template #icon><ScanSearch :size="14" /></template>Revisar una pull request</UiButton>
        </div>
      </header>

      <main class="content">
        <component :is="views[current]" v-bind="current === 'revision' && route.id ? {id: route.id} : {}" :key="current + (route.id || '')" />
      </main>
    </div>
  </div>

  <UiToasts />
  <UiDialog />
</template>

<style scoped>
.boot { max-width: 480px; margin: 20vh auto; padding: var(--space-4); }

.shell { min-height: 100vh; }
.icon-btn { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: var(--radius-md); background: transparent; color: inherit; transition: background var(--duration) var(--ease); }
.icon-btn:hover { background: rgb(127 127 127 / 0.12); }

.scrim { position: fixed; inset: 0; z-index: 30; background: rgb(8 23 15 / 0.5); }

/* ---- Menú lateral ---- */
.sidebar {
  position: fixed; inset: 0 auto 0 0; z-index: 40; width: min(var(--sidebar-width), 85vw);
  display: flex; flex-direction: column; padding: var(--space-4) 0;
  background: var(--color-sidebar); color: var(--color-sidebar-text);
  transform: translateX(-100%); transition: transform var(--duration) var(--ease);
}
.sidebar.open { transform: none; box-shadow: var(--shadow-3); }
.brand { display: flex; align-items: center; gap: var(--space-3); height: 40px; padding: 0 var(--space-4); margin-bottom: var(--space-4); }
.brand img { border-radius: 50%; flex-shrink: 0; }
.brand-name { color: #fffdf8; font-size: var(--text-md); font-weight: 600; line-height: 1.2; }
.brand-sub { color: var(--color-sidebar-muted); font-size: var(--text-xs); line-height: 1.3; }
.close { margin-left: auto; }

.nav { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.nav-group { margin: var(--space-4) var(--space-4) var(--space-1); color: var(--color-sidebar-muted); font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
/* Elemento del menú. El activo, como en Hangar: líneas de 1 px arriba y abajo en degradado y un brillo suave. */
.nav-link {
  display: flex; align-items: center; gap: var(--space-3); min-height: 40px; padding: 0 var(--space-4);
  color: var(--color-sidebar-text); font-size: var(--text-sm); font-weight: 500; text-decoration: none;
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.nav-link:hover { background: rgb(255 255 255 / 0.05); color: #fffdf8; text-decoration: none; }
.nav-link.active {
  color: #fffdf8; font-weight: 600;
  background: var(--sidebar-active-line) top / 100% 1px no-repeat, var(--sidebar-active-line) bottom / 100% 1px no-repeat, var(--sidebar-active-glow);
}
.nav-link.active svg { color: var(--green-400); }
.nav-link:focus-visible { outline-offset: -2px; }

.side-bottom { margin-top: auto; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4) var(--space-4) 0; border-top: 1px solid rgb(255 255 255 / 0.08); }
.theme { display: grid; grid-template-columns: repeat(3, 1fr); }
.theme-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: var(--space-1) 0 var(--space-2); border: 0; background: transparent; color: var(--color-sidebar-muted); font-size: 11px; transition: color var(--duration) var(--ease); }
.theme-btn:hover { color: #fffdf8; }
.theme-btn.on { color: #fffdf8; background: var(--sidebar-active-line) bottom / 100% 2px no-repeat; }
.me { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.avatar { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; background: var(--gold-500); color: var(--green-950); font-size: var(--text-sm); font-weight: 600; }
.me-text { flex: 1; min-width: 0; }
.me-email { overflow: hidden; color: #fffdf8; font-size: var(--text-xs); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.me-role { color: var(--color-sidebar-muted); font-size: var(--text-xs); }
.me .icon-btn:hover { background: rgb(255 255 255 / 0.08); }

/* ---- Barra superior con migas de pan ---- */
.main { min-width: 0; }
.topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: var(--space-2);
  height: var(--topbar-height); padding: 0 var(--space-4);
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
  backdrop-filter: saturate(1.4) blur(10px);
  border-bottom: 1px solid var(--color-border);
}
.menu-btn { margin-left: calc(-1 * var(--space-2)); }
.top-mark { border-radius: 50%; flex-shrink: 0; }
.crumbs { flex: 1; min-width: 0; }
.crumbs ol { display: flex; align-items: center; margin: 0; padding: 0; list-style: none; font-size: var(--text-sm); white-space: nowrap; overflow: hidden; }
.crumbs li { display: flex; align-items: center; min-width: 0; }
.crumbs li:last-child { flex-shrink: 1; }
.crumbs li:last-child span { overflow: hidden; text-overflow: ellipsis; color: var(--color-text); font-weight: 600; }
.crumbs a { color: var(--color-text-muted); }
.crumbs a:hover { color: var(--color-text); }
.sep { margin: 0 var(--space-1); color: var(--color-border-strong); flex-shrink: 0; }
.top-actions { display: none; }

.content { max-width: var(--content-max); padding: var(--space-6) var(--space-4) var(--space-12); animation: fade-in var(--duration) var(--ease); }

.fade-enter-active, .fade-leave-active { transition: opacity var(--duration) var(--ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 767px) {
  /* En móvil, las migas solo muestran el tramo final para que quepan. */
  .crumbs li:not(:last-child) { display: none; }
  .crumbs .sep { display: none; }
}
@media (min-width: 768px) {
  .topbar { padding: 0 var(--space-6); }
  .content { padding: var(--space-6) var(--space-6) var(--space-12); }
  .top-actions { display: flex; }
}
@media (min-width: 1024px) {
  .scrim, .close, .menu-btn, .top-mark { display: none; }
  .sidebar { transform: none; width: var(--sidebar-width); }
  .main { margin-left: var(--sidebar-width); }
  .topbar { padding: 0 var(--space-8); }
  .content { padding: var(--space-8) var(--space-8) var(--space-12); }
}
</style>
