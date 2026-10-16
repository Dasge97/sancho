// Qué código ve el modelo además del diff. Se leen los ficheros que cambia la PR y los que esos
// ficheros usan: las clases importadas con `use` (resueltas con el autoload PSR-4 de composer.json),
// las políticas de Laravel de los modelos usados y los ficheros de rutas y seguridad cuando cambia
// un controlador. Todo sale del commit de la PR y pasa por el ocultado de secretos.
import {redactSecretsFromText} from './domain.js';

export interface ContextFile { path: string; reason: string; truncated: boolean }
export type FileFetcher = (path: string, maxBytes: number) => Promise<{text: string; truncated: boolean} | null>;

export const CONTEXT_LIMITS = {changedFiles: 8, changedBytes: 16_000, relatedFiles: 8, relatedBytes: 12_000, totalChars: 60_000};

/** Diff con el número de línea del fichero nuevo delante: `+L28| ` añadida, ` L27| ` sin cambios, `-     | ` borrada. */
export function annotateDiff(diff: string): string {
  let line = 0, inHunk = false;
  return diff.split('\n').map(row => {
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { line = Number(hunk[1]); inHunk = true; return row; }
    if (row.startsWith('diff --git ')) { inHunk = false; return row; }
    if (!inHunk || row.startsWith('\\')) return row;
    if (row.startsWith('+')) return `+L${line++}| ${row.slice(1)}`;
    if (row.startsWith('-')) return `-     | ${row.slice(1)}`;
    if (row.startsWith(' ') || row === '') return ` L${line++}| ${row.slice(1)}`;
    return row;
  }).join('\n');
}

/** Datos de una revisión para el modelo: la PR, bloques extra (seguimiento, análisis estático), el diff
 *  numerado y, sin agente, el contexto. Lo usan el worker y el banco de pruebas (`npm run eval`). */
export function reviewData(input: {title: string; repository: string; extra?: string[]; diff: string; context: string | null}): string {
  return ['<pull_request>', 'Título: ' + input.title, 'Repositorio: ' + input.repository, '</pull_request>', ...(input.extra || []),
    '', '<diff>', annotateDiff(input.diff), '</diff>',
    ...(input.context === null ? [] : ['', '<contexto>', input.context || '(sin ficheros de contexto)', '</contexto>'])].join('\n');
}

/** Ficheros del diff que siguen existiendo en el commit de la PR (los borrados no se pueden leer). */
export function changedFiles(diff: string): string[] {
  const files: string[] = [];
  for (const section of diff.split(/^diff --git /m).slice(1)) {
    const header = section.match(/^a\/(.+?) b\/(.+)$/m);
    if (!header || /^\+\+\+ \/dev\/null/m.test(section)) continue;
    const path = header[2].trim();
    if (!path.includes('..')) files.push(path);
  }
  return files;
}

export const isReadableSource = (path: string) => /\.(php|twig|ya?ml|xml)$/i.test(path) || /(^|\/)composer\.json$/i.test(path);

export const numberLines = (text: string) => text.split('\n').map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join('\n');

/** Clases importadas con `use` en un fichero PHP (sin `use function`, `use const` ni grupos). */
export function phpUses(source: string): string[] {
  return [...source.matchAll(/^use\s+(?!function\s|const\s)([A-Za-z_][A-Za-z0-9_\\]*)(?:\s+as\s+\w+)?\s*;/gm)].map(m => m[1].replace(/^\\/, ''));
}

/** Prefijos de espacio de nombres y su carpeta, del autoload PSR-4 de composer.json. */
export function psr4Map(composerJson: string | null): [string, string][] {
  if (!composerJson) return [];
  try {
    const c = JSON.parse(composerJson);
    const entries = {...(c.autoload?.['psr-4'] || {}), ...(c['autoload-dev']?.['psr-4'] || {})};
    return Object.entries(entries).map(([prefix, dir]) => [prefix, String(Array.isArray(dir) ? dir[0] : dir)] as [string, string]).sort((a, b) => b[0].length - a[0].length);
  } catch { return []; }
}

/** Ruta del fichero de una clase según el autoload, o null si es de vendor u otro paquete. */
export function classToPath(fqcn: string, map: [string, string][]): string | null {
  for (const [prefix, dir] of map) {
    if (fqcn.startsWith(prefix)) {
      const base = dir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/?$/, '/');
      return (base === '/' ? '' : base) + fqcn.slice(prefix.length).replace(/\\/g, '/') + '.php';
    }
  }
  return null;
}

/** Ficheros relacionados con los cambiados, con el motivo de cada uno, sin repetir ni incluir los cambiados. */
export function relatedFiles(changed: {path: string; content: string}[], map: [string, string][]): {path: string; reason: string}[] {
  const out = new Map<string, string>();
  const skip = new Set(changed.map(c => c.path));
  const add = (path: string | null, reason: string) => { if (path && !skip.has(path) && !out.has(path)) out.set(path, reason); };
  for (const file of changed.filter(c => c.path.endsWith('.php'))) {
    for (const fqcn of phpUses(file.content)) {
      add(classToPath(fqcn, map), `clase usada en ${file.path}: ${fqcn}`);
      // Laravel: la política de un modelo usado (App\Models\Invoice → App\Policies\InvoicePolicy).
      const model = fqcn.match(/^(.*)\\Models\\(\w+)$/);
      if (model) add(classToPath(`${model[1]}\\Policies\\${model[2]}Policy`, map), `política del modelo ${fqcn}`);
    }
    // Laravel: el usuario de la sesión no se importa con `use`, pero su modelo dice qué columnas se
    // pueden asignar ($fillable o $guarded), que es lo que decide una asignación masiva.
    if (/->user\(\)|\bauth\(\)->user\(\)|\bAuth::user\(\)/.test(file.content)) add(classToPath('App\\Models\\User', map), `modelo del usuario de la sesión, usado en ${file.path}`);
  }
  if (changed.some(c => /controller/i.test(c.path))) {
    for (const path of ['routes/web.php', 'routes/api.php']) add(path, 'rutas de la aplicación (Laravel)');
    add('config/routes.yaml', 'rutas de la aplicación (Symfony)');
    add('config/packages/security.yaml', 'reglas de acceso (Symfony)');
  }
  return [...out].map(([path, reason]) => ({path, reason}));
}

/** Reúne el contexto respetando los límites. `fetch` lee un fichero del commit de la PR o devuelve null. */
export async function gatherContext(diff: string, fetch: FileFetcher, limits = CONTEXT_LIMITS) {
  const files: ContextFile[] = [], blocks: string[] = [];
  let redacted = 0, partial = false, total = 0;
  const changedPaths = changedFiles(diff).filter(isReadableSource);
  if (changedPaths.length > limits.changedFiles) partial = true;

  async function include(path: string, reason: string, maxBytes: number) {
    const got = await fetch(path, maxBytes);
    if (!got) return null;
    const clean = redactSecretsFromText(got.text);
    const block = `=== Fichero: ${path} · ${reason}${got.truncated ? ' · recortado' : ''} ===\n${numberLines(clean.text)}`;
    if (total + block.length > limits.totalChars) { partial = true; return null; }
    redacted += clean.redacted; total += block.length;
    if (got.truncated) partial = true;
    blocks.push(block); files.push({path, reason, truncated: got.truncated});
    return clean.text;
  }

  const changed: {path: string; content: string}[] = [];
  for (const path of changedPaths.slice(0, limits.changedFiles)) {
    const content = await include(path, 'cambiado en la PR', limits.changedBytes);
    if (content === null) partial = true; else changed.push({path, content});
  }
  const composer = changed.find(c => c.path === 'composer.json')?.content ?? (await fetch('composer.json', 20_000))?.text ?? null;
  const related = relatedFiles(changed, psr4Map(composer));
  if (related.length > limits.relatedFiles) partial = true;
  for (const r of related.slice(0, limits.relatedFiles)) await include(r.path, r.reason, limits.relatedBytes);

  return {text: blocks.join('\n\n'), files, redacted, partial};
}
