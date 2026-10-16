// Calidad de las revisiones a partir de lo que hace el equipo con cada problema publicado.
// Un problema es uno por PR y huella, aunque aparezca en varias revisiones de la misma PR.
// Señal de acierto: alguien lo marcó útil o se arregló. Señal de fallo: falso positivo o Sancho lo
// retiró tras una respuesta. Con votos contrarios, el problema queda «dividido» y no cuenta.
export interface IssueRow {
  repository: string; category: string; severity: string; origin: string;
  prompt_version: string | null; engine: string | null; first_seen: string | Date;
  useful: boolean; false_positive: boolean; thread_status: string | null; fixed_by_commit: boolean;
}
export interface Group { key: string; issues: number; useful: number; false_positive: number; no_signal: number; precision: number | null }
export interface PromptGroup extends Group { engine: string | null; first_seen: string }
export type Verdict = 'useful' | 'false_positive' | 'split' | 'none';

export function verdict(r: IssueRow): Verdict {
  const good = r.useful || r.thread_status === 'resolved', bad = r.false_positive || r.thread_status === 'dismissed';
  // Un voto explícito pesa más que lo que pasó con el hilo.
  if (r.useful && r.false_positive) return 'split';
  if (r.false_positive) return 'false_positive';
  if (r.useful) return 'useful';
  return good && !bad ? 'useful' : bad && !good ? 'false_positive' : 'none';
}

function group(rows: IssueRow[], keyOf: (r: IssueRow) => string): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = keyOf(r), g = map.get(key) || {key, issues: 0, useful: 0, false_positive: 0, no_signal: 0, precision: null};
    const v = verdict(r);
    g.issues++;
    if (v === 'useful') g.useful++; else if (v === 'false_positive') g.false_positive++; else g.no_signal++;
    map.set(key, g);
  }
  for (const g of map.values()) g.precision = g.useful + g.false_positive ? g.useful / (g.useful + g.false_positive) : null;
  return [...map.values()].sort((a, b) => b.issues - a.issues);
}

export function qualityReport(rows: IssueRow[]) {
  const [totals] = group(rows, () => 'total');
  const iso = (d: string | Date) => new Date(d).toISOString();
  // Por versión de las instrucciones: sirve para comparar antes y después de editar un prompt.
  const prompts = new Map<string, {engine: string | null; first: string}>();
  for (const r of rows) {
    const k = r.prompt_version || 'desconocida', seen = prompts.get(k);
    if (!seen || iso(r.first_seen) < seen.first) prompts.set(k, {engine: r.engine, first: iso(r.first_seen)});
  }
  const byPrompt: PromptGroup[] = group(rows, r => r.prompt_version || 'desconocida')
    .map(g => ({...g, engine: prompts.get(g.key)?.engine ?? null, first_seen: prompts.get(g.key)!.first}))
    .sort((a, b) => b.first_seen.localeCompare(a.first_seen));
  return {
    totals: {...(totals || {key: 'total', issues: 0, useful: 0, false_positive: 0, no_signal: 0, precision: null}),
      fixed_by_commit: rows.filter(r => r.fixed_by_commit).length,
      withdrawn: rows.filter(r => r.thread_status === 'dismissed').length,
      open: rows.filter(r => r.thread_status === 'open').length},
    by_category: group(rows, r => r.category),
    by_severity: group(rows, r => r.severity),
    by_origin: group(rows, r => r.origin || 'modelo'),
    by_repository: group(rows, r => r.repository),
    by_prompt: byPrompt,
  };
}
