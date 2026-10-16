// Estado de interfaz compartido: avisos emergentes, ventana de confirmación, modo de color y
// la pantalla actual. Sustituye a alert() y confirm() del navegador.
import {reactive, ref} from 'vue';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/* ---- Avisos emergentes ---- */
export interface Toast { id: number; tone: Tone; title: string; text?: string }
export const toasts = reactive<Toast[]>([]);
let toastId = 0;

export function notify(tone: Tone, title: string, text?: string) {
  const id = ++toastId;
  toasts.push({id, tone, title, text});
  setTimeout(() => dismissToast(id), tone === 'danger' ? 8000 : 4500);
}
export function dismissToast(id: number) {
  const i = toasts.findIndex(t => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

/* ---- Ventana de diálogo ---- */
export interface DialogOptions {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  danger?: boolean;
  /** Texto para copiar (un enlace de activación, por ejemplo). */
  copyValue?: string;
  /** Si se indica, la ventana pide un texto (opcional) con esta etiqueta. */
  inputLabel?: string;
  inputPlaceholder?: string;
}
export const dialog = reactive<{open: boolean; options: DialogOptions | null; value: string; resolve: ((ok: boolean) => void) | null}>({open: false, options: null, value: '', resolve: null});

export function ask(options: DialogOptions): Promise<boolean> {
  return new Promise(resolve => { Object.assign(dialog, {open: true, options, value: '', resolve}); });
}
/** Como ask, pero con un campo de texto: devuelve el texto escrito, o null si se cancela. */
export async function askText(options: DialogOptions & {inputLabel: string}): Promise<string | null> {
  return await ask(options) ? dialog.value.trim() : null;
}
export function closeDialog(ok: boolean) {
  dialog.resolve?.(ok);
  Object.assign(dialog, {open: false, resolve: null});
}

/* ---- Modo de color: claro, oscuro o el del sistema ---- */
export type ThemeChoice = 'light' | 'dark' | 'system';
function storedTheme(): ThemeChoice {
  try { const t = localStorage.getItem('sancho-theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}
export const theme = ref<ThemeChoice>(storedTheme());
export function setTheme(choice: ThemeChoice) {
  theme.value = choice;
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try { if (choice === 'system') localStorage.removeItem('sancho-theme'); else localStorage.setItem('sancho-theme', choice); } catch { /* sin almacenamiento: dura hasta recargar */ }
}

/* ---- Pantalla actual, en la URL para poder recargar y enlazar ----
   #/ajustes/openai → pantalla y subpestaña. #/revision/<id>/cobertura → pantalla, id y subpestaña. */
export type ViewName = 'inicio' | 'repositorios' | 'repositorio' | 'revisiones' | 'revision' | 'consumo' | 'ajustes' | 'equipo' | 'auditoria';
const views: ViewName[] = ['inicio', 'repositorios', 'repositorio', 'revisiones', 'revision', 'consumo', 'ajustes', 'equipo', 'auditoria'];
// Pantallas de un elemento concreto: llevan su id antes de la subpestaña.
const withId: ViewName[] = ['revision', 'repositorio'];

function parseHash(): {view: ViewName; id: string | null; tab: string | null} {
  const [, name, a, b] = location.hash.split('/');
  if (!views.includes(name as ViewName)) return {view: 'inicio', id: null, tab: null};
  return withId.includes(name as ViewName) ? {view: name as ViewName, id: a || null, tab: b || null} : {view: name as ViewName, id: null, tab: a || null};
}
export const route = reactive(parseHash());
window.addEventListener('hashchange', () => Object.assign(route, parseHash()));

export function go(view: ViewName, id?: string, tab?: string) {
  location.hash = '/' + [view, id, tab].filter(Boolean).join('/');
}
/** Cambia de subpestaña sin añadir una entrada al historial por cada clic. */
export function setTab(tab: string) {
  const hash = '#/' + [route.view, route.id, tab].filter(Boolean).join('/');
  history.replaceState(null, '', hash);
  route.tab = tab;
}

/** Último tramo de las migas de pan cuando la pantalla lo conoce después de cargar (el título de la PR). */
export const crumbTail = ref('');
