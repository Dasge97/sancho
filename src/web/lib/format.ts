// Textos y formatos que se repiten en varias pantallas: estados de revisión, fechas e importes.
import type {Tone} from './ui-state';

const reviewStates: Record<string, [string, Tone]> = {
  queued: ['En cola', 'info'],
  analyzing: ['Analizando', 'warning'],
  completed: ['Completada', 'success'],
  partial: ['Parcial', 'warning'],
  failed: ['Fallida', 'danger'],
  cancelled: ['Cancelada', 'neutral'],
  superseded: ['Sustituida', 'neutral'],
};
export const reviewState = (s: string): [string, Tone] => reviewStates[s] || [s, 'neutral'];

const publicationStates: Record<string, [string, Tone]> = {
  not_requested: ['Solo en el panel', 'neutral'],
  pending: ['Publicando', 'info'],
  published: ['Publicada en Bitbucket', 'success'],
  partial: ['Publicada a medias', 'warning'],
  failed: ['No se pudo publicar', 'danger'],
  stale: ['No publicada: la PR cambió', 'neutral'],
  simulated: ['Simulada', 'neutral'],
};
export const publicationState = (s: string): [string, Tone] => publicationStates[s] || [s, 'neutral'];

const severities: Record<string, [string, Tone]> = {
  critical: ['Crítico', 'danger'],
  high: ['Alto', 'danger'],
  medium: ['Medio', 'warning'],
};
export const severity = (s: string): [string, Tone] => severities[s] || [s, 'neutral'];

const categories: Record<string, string> = {
  security: 'Seguridad', authorization: 'Autorización', correctness: 'Funcionamiento',
  data_integrity: 'Integridad de datos', performance: 'Rendimiento', compatibility: 'Compatibilidad', other: 'Otro',
};
export const category = (c: string) => categories[c] || c;

const auditActions: Record<string, string> = {
  'user.created': 'Creó una cuenta',
  'user.updated': 'Cambió una cuenta',
  'user.reset_issued': 'Generó un enlace para cambiar la contraseña',
  'settings.updated': 'Cambió los ajustes',
  'openai.secret.rotated': 'Cambió la clave de OpenAI',
  'bitbucket.connection.saved': 'Guardó la conexión con Bitbucket',
  'repository.webhook.configured': 'Instaló el webhook de un repositorio',
  'repository.rules.updated': 'Cambió las reglas de revisión de un repositorio',
  'prompt.updated': 'Cambió las instrucciones de la IA',
  'prompt.reset': 'Restauró las instrucciones originales de la IA',
  'repository.profile.updated': 'Editó la ficha del proyecto de un repositorio',
  'repository.profile.requested': 'Pidió a Sancho que estudie un repositorio',
};
export const auditAction = (a: string) => auditActions[a] || a;

export const dateTime = (v: string) => new Date(v).toLocaleString('es-ES', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'});
export const date = (v: string) => new Date(v).toLocaleDateString('es-ES', {day: '2-digit', month: 'short', year: 'numeric'});

export function relative(v: string) {
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return date(v);
}

export const usd = (v: number | string | null | undefined, digits = 2) =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('es-ES', {style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits});
export const int = (v: number | string | null | undefined) => v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES');
