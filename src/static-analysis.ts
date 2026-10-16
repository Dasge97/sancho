// Análisis estático que no ejecuta el proyecto revisado:
// - gitleaks busca secretos en las líneas añadidas del diff (antes de que Sancho los tape).
// - `php -l` comprueba que los ficheros PHP cambiados compilan. Solo compila, no ejecuta nada.
// Lo que encuentran se publica como problemas sin pasar por el modelo, y el modelo recibe la lista
// para no repetirlos. Si una herramienta no está instalada, la revisión sigue sin ella.
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type Tool = 'gitleaks' | 'php';
export interface StaticFinding {
  tool: Tool; path: string; line: number; severity: 'critical' | 'high'; category: 'security' | 'correctness';
  title: string; scenario: string; impact: string; evidence: string; recommendation: string;
  shortTitle: string; shortImpact: string; shortFix: string;
}
export interface ToolRun { tool: Tool; status: 'ok' | 'unavailable' | 'failed' | 'skipped'; files: number; findings: number; note?: string }
export interface StaticReport { findings: StaticFinding[]; tools: ToolRun[] }
export interface DiffFile { path: string; created: boolean; deleted: boolean; lines: {line: number; text: string}[] }
type Fetch = (path: string) => Promise<{text: string; truncated: boolean} | null>;

// Dependencias, ficheros generados y binarios: no se analizan.
const SKIP = /(^|\/)(vendor|node_modules|dist|build)\/|\.(min\.js|lock|map|png|jpe?g|gif|ico|pdf|zip|woff2?)$|package-lock\.json$/i;
const MAX_PHP_FILES = 40;

// Líneas añadidas de cada fichero del diff, con su número en la versión nueva.
export function addedLines(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  for (const section of diff.split(/^diff --git /m).slice(1)) {
    const rows = section.split('\n');
    const plus = rows.find(r => r.startsWith('+++ ')), minus = rows.find(r => r.startsWith('--- '));
    const deleted = plus?.trim() === '+++ /dev/null';
    const file = deleted ? (minus || '').replace(/^--- (a\/)?/, '').trim() : (plus || '').replace(/^\+\+\+ (b\/)?/, '').trim();
    if (!file) continue;
    const entry: DiffFile = {path: file, created: minus?.trim() === '--- /dev/null', deleted, lines: []};
    let current = 0, inHunk = false;
    for (const row of rows) {
      const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) { current = Number(hunk[1]); inHunk = true; continue; }
      if (!inHunk) continue;
      if (row.startsWith('+')) { entry.lines.push({line: current, text: row.slice(1).replace(/\r$/, '')}); current++; }
      else if (row.startsWith(' ')) current++;
    }
    files.push(entry);
  }
  return files;
}

// Ejecuta una herramienta con la entrada por stdin, sin shell y con un entorno mínimo.
// Devuelve null si el programa no está instalado.
function run(bin: string, args: string[], input: string, timeoutMs: number): Promise<{code: number | null; out: string} | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {env: {PATH: process.env.PATH || '', HOME: os.tmpdir()}, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
    let out = '', settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => { child.kill('SIGKILL'); done(() => reject(new Error(`${path.basename(bin)}_timeout`))); }, timeoutMs);
    child.stdout.on('data', d => { if (out.length < 200000) out += d; });
    child.stderr.on('data', d => { if (out.length < 200000) out += d; });
    child.on('error', (e: NodeJS.ErrnoException) => done(() => e.code === 'ENOENT' ? resolve(null) : reject(e)));
    child.on('close', code => done(() => resolve({code, out})));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

// gitleaks sobre todas las líneas añadidas a la vez. Cada línea de la entrada se traduce a su fichero
// y su línea. El informe va redactado: Sancho no ve ni guarda el valor del secreto.
export async function runGitleaks(files: DiffFile[], bin = process.env.GITLEAKS_BIN || 'gitleaks'): Promise<{run: ToolRun; findings: StaticFinding[]}> {
  const map: {path: string; line: number}[] = [], text: string[] = [];
  const scanned = files.filter(f => !f.deleted && !SKIP.test(f.path) && f.lines.length);
  for (const f of scanned) for (const l of f.lines) { map.push({path: f.path, line: l.line}); text.push(l.text); }
  if (!text.length) return {run: {tool: 'gitleaks', status: 'skipped', files: 0, findings: 0, note: 'No hay líneas añadidas que analizar.'}, findings: []};
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sancho-gitleaks-'));
  try {
    const report = path.join(dir, 'informe.json');
    const r = await run(bin, ['stdin', '--no-banner', '--redact', '--exit-code', '0', '--log-level', 'error', '--report-format', 'json', '--report-path', report], text.join('\n') + '\n', 60000);
    if (!r) return {run: {tool: 'gitleaks', status: 'unavailable', files: 0, findings: 0, note: 'gitleaks no está instalado.'}, findings: []};
    if (r.code !== 0) return {run: {tool: 'gitleaks', status: 'failed', files: scanned.length, findings: 0, note: `gitleaks terminó con el código ${r.code}.`}, findings: []};
    const entries: any[] = JSON.parse(await fs.readFile(report, 'utf8').catch(() => '[]') || '[]');
    const findings = gitleaksFindings(entries, map);
    return {run: {tool: 'gitleaks', status: 'ok', files: scanned.length, findings: findings.length}, findings};
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
}

export function gitleaksFindings(entries: any[], map: {path: string; line: number}[]): StaticFinding[] {
  const seen = new Set<string>(), out: StaticFinding[] = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    const at = map[Number(e?.StartLine) - 1], rule = String(e?.RuleID || 'secreto').replace(/[^\w.-]/g, '').slice(0, 60);
    if (!at || seen.has(at.path + ':' + at.line)) continue;
    seen.add(at.path + ':' + at.line);
    const kind = String(e?.Description || '').replace(/[\r\n`]/g, ' ').trim().slice(0, 200);
    out.push({
      tool: 'gitleaks', path: at.path, line: at.line, severity: 'critical', category: 'security',
      title: `Secreto escrito en el código (${rule})`,
      scenario: 'Cualquiera con acceso de lectura al repositorio, o a una copia, puede copiar el valor y usarlo.',
      impact: 'El secreto queda en el historial de git aunque se borre después, así que hay que darlo por expuesto.',
      evidence: `gitleaks (regla ${rule}) detecta un secreto en esta línea añadida${kind ? ` («${kind}»)` : ''}. Sancho no guarda ni muestra su valor.`,
      recommendation: 'Revocar el secreto, generar uno nuevo y leerlo de una variable de entorno o de un gestor de secretos. Borrarlo del código no basta.',
      shortTitle: 'Secreto escrito en el código',
      shortImpact: 'Queda en el historial de git: cualquiera con acceso al repositorio puede usarlo.',
      shortFix: 'Revócalo, genera uno nuevo y léelo de una variable de entorno.',
    });
  }
  return out;
}

// Error de `php -l`: el mensaje y la línea. null si compila.
export function parsePhpLint(out: string): {line: number; message: string} | null {
  const m = out.match(/(?:PHP )?(?:Parse|Fatal) error:\s*(.+?) in (?:Standard input code|-) on line (\d+)/);
  return m ? {message: m[1].replace(/\s+/g, ' ').trim().slice(0, 200), line: Number(m[2])} : null;
}

// `php -l` sobre cada PHP cambiado, con el fichero completo del commit de la PR. Si la versión de la
// rama de destino tampoco compila, no se avisa: será otra versión de PHP o un error que ya existía.
export async function runPhpLint(files: DiffFile[], source: Fetch, base: Fetch, bin = process.env.PHP_BIN || 'php'): Promise<{run: ToolRun; findings: StaticFinding[]}> {
  const php = files.filter(f => !f.deleted && /\.php$/i.test(f.path) && !SKIP.test(f.path) && f.lines.length);
  if (!php.length) return {run: {tool: 'php', status: 'skipped', files: 0, findings: 0, note: 'La PR no cambia ficheros PHP.'}, findings: []};
  const lint = async (text: string) => { const r = await run(bin, ['-n', '-l'], text, 20000); return r ? parsePhpLint(r.out) : undefined; };
  const findings: StaticFinding[] = [];
  let checked = 0, unreadable = 0, alreadyBroken = 0;
  for (const f of php.slice(0, MAX_PHP_FILES)) {
    const src = await source(f.path);
    if (!src || src.truncated) { unreadable++; continue; }
    const err = await lint(src.text);
    if (err === undefined) return {run: {tool: 'php', status: 'unavailable', files: 0, findings: 0, note: 'PHP no está instalado.'}, findings: []};
    checked++;
    if (!err) continue;
    if (!f.created) {
      const before = await base(f.path);
      if (before && !before.truncated && await lint(before.text)) { alreadyBroken++; continue; }
    }
    // El comentario va en la línea añadida del error o, si no lo es, en la añadida más cercana por encima.
    const anchor = f.lines.filter(l => l.line <= err.line && err.line - l.line <= 30).at(-1);
    if (!anchor) continue;
    findings.push({
      tool: 'php', path: f.path, line: anchor.line, severity: 'high', category: 'correctness',
      title: `El fichero PHP no compila: ${err.message}`,
      scenario: 'Cualquier petición o comando que cargue este fichero falla antes de ejecutar nada.',
      impact: 'La parte de la aplicación que usa este fichero deja de funcionar al desplegar.',
      evidence: `\`php -l\` sobre el fichero completo de la PR: «${err.message}» en la línea ${err.line}. La versión de la rama de destino sí compila.`,
      recommendation: `Corregir la sintaxis cerca de la línea ${err.line}.`,
      shortTitle: 'El fichero PHP no compila',
      shortImpact: 'Falla cualquier petición que cargue este fichero.',
      shortFix: `Corrige la sintaxis de la línea ${err.line}: ${err.message}`.slice(0, 140),
    });
  }
  const notes = [php.length > MAX_PHP_FILES ? `Solo los ${MAX_PHP_FILES} primeros de ${php.length} ficheros PHP.` : '', unreadable ? `${unreadable} sin leer.` : '', alreadyBroken ? `${alreadyBroken} que ya no compilaban en la rama de destino.` : ''].filter(Boolean).join(' ');
  return {run: {tool: 'php', status: 'ok', files: checked, findings: findings.length, ...(notes ? {note: notes} : {})}, findings};
}

export async function staticAnalysis(diff: string, io: {source: Fetch; base: Fetch}): Promise<StaticReport> {
  const files = addedLines(diff), tools: ToolRun[] = [], findings: StaticFinding[] = [];
  for (const [tool, job] of [['gitleaks', () => runGitleaks(files)], ['php', () => runPhpLint(files, io.source, io.base)]] as const) {
    try { const r = await job(); tools.push(r.run); findings.push(...r.findings); }
    catch (e) { tools.push({tool, status: 'failed', files: 0, findings: 0, note: e instanceof Error && e.message.endsWith('_timeout') ? 'Tardó demasiado.' : 'Falló al ejecutarse.'}); }
  }
  return {findings, tools};
}
