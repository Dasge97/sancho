// Configuración de Sancho dentro del propio repositorio: el fichero .sancho.yml de la raíz.
// Se lee de la rama de destino de la PR (no de la PR), para que una PR no pueda relajar sus propias
// reglas. Lo que diga se suma a las reglas del panel.
//
//   contexto: |            de qué va el proyecto
//   reglas: |              reglas para todo el repositorio
//   rutas:                 reglas que solo valen para ciertos ficheros
//     - ruta: "app/Http/Controllers/**"
//       reglas: "Todo controlador que cambia datos usa un FormRequest."
//   excluir:               rutas que no se revisan
//     - "legacy/**"
//   gravedad_minima: high  low, medium, high o critical
//   perfil: exigente       estandar (solo problemas) o exigente (también detalles menores)
import {parse} from 'yaml';
import {z} from 'zod';

const Schema = z.object({
  contexto: z.string().max(4000).optional(),
  reglas: z.string().max(8000).optional(),
  rutas: z.array(z.object({ruta: z.string().min(1).max(250), reglas: z.string().min(1).max(4000)})).max(50).optional(),
  excluir: z.array(z.string().min(1).max(250)).max(50).optional(),
  gravedad_minima: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  perfil: z.enum(['estandar', 'exigente']).optional(),
}).strict();
export type RepoConfig = z.infer<typeof Schema>;

/** Lee el .sancho.yml. Si no es válido, devuelve el error en español para enseñarlo en el panel. */
export function parseRepoConfig(text: string | null): {config: RepoConfig | null; error: string | null} {
  if (!text?.trim()) return {config: null, error: null};
  let raw: unknown;
  try { raw = parse(text); } catch (e) { return {config: null, error: 'El .sancho.yml no es YAML válido: ' + (e instanceof Error ? e.message.split('\n')[0] : 'error de formato')}; }
  const result = Schema.safeParse(raw ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    return {config: null, error: `El .sancho.yml tiene un campo no válido (${issue.path.join('.') || 'raíz'}): ${issue.message}`};
  }
  return {config: result.data, error: null};
}

/** Si una ruta cumple un patrón: `*` dentro de un nombre, `dir/**` para una carpeta entera. */
export function pathMatches(pattern: string, path: string): boolean {
  const p = pattern.replace(/^\//, '').replace(/\/$/, '');
  if (!p) return false;
  if (p.endsWith('/**')) return path.startsWith(p.slice(0, -2));
  const regex = '^' + p.split('**').map(part => part.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$';
  return new RegExp(regex, 'i').test(path);
}

/** Reglas del .sancho.yml que afectan a esta PR: las generales y las de las rutas que toca. */
export function rulesForFiles(config: RepoConfig | null, files: string[]): string | null {
  if (!config) return null;
  const parts: string[] = [];
  if (config.reglas?.trim()) parts.push(config.reglas.trim());
  for (const r of config.rutas || []) {
    const touched = files.filter(f => pathMatches(r.ruta, f));
    if (touched.length) parts.push(`Para \`${r.ruta}\` (en esta PR: ${touched.slice(0, 5).map(f => '`' + f + '`').join(', ')}${touched.length > 5 ? '…' : ''}): ${r.reglas.trim()}`);
  }
  return parts.length ? parts.join('\n\n') : null;
}
