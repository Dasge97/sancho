// Banco de pruebas de la revisión: pasa los casos etiquetados de evals/casos por la misma detección y
// verificación que el worker (mismas instrucciones, esquemas, diff numerado y contexto) y mide cuánto
// acierta. Llama de verdad a OpenAI y cuesta dinero: unos céntimos por caso.
//
//   OPENAI_API_KEY=… npm run eval -- --modelo gpt-6.1-sol [--caso idor] [--repeticiones 3]
//                                    [--prompts carpeta-con-deteccion.md] [--precios 2,10]
//
// No guarda respuestas completas del proveedor: solo lo que hace falta para la tabla.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gatherContext, reviewData} from './context.js';
import {addedLineText, filterReviewDiff} from './domain.js';
import {buildInstructions, shortHash, type PromptOverrides, type TeamRules} from './prompts.js';
import {DETECTION_SCHEMA, VERIFICATION_SCHEMA} from './schemas.js';

export interface Expected { fichero: string; texto: string; tipo?: string[]; margen?: number; nota?: string }
export interface CaseFile { titulo: string; descripcion?: string; reglas?: string; esperados: Expected[] }
export interface Found { path: string; start_line: number; category: string; severity: string; title: string }
export interface Score { expected: number; hits: number; missed: string[]; extra: Found[]; candidateHits: number }

// Línea de cada problema esperado: la línea añadida del diff que contiene su texto.
export function expectedLines(diff: string, expected: Expected[]): {e: Expected; line: number}[] {
  return expected.map(e => {
    for (let line = 1; line < 5000; line++) {
      const text = addedLineText(diff, e.fichero, line);
      if (text !== null && text.includes(e.texto)) return {e, line};
    }
    throw new Error(`No encuentro «${e.texto}» entre las líneas añadidas de ${e.fichero}`);
  });
}

// Un hallazgo acierta si cae en el mismo fichero, a como mucho `margen` líneas (3 por defecto) y,
// si el caso lo dice, con uno de los tipos esperados. Cada esperado cuenta una sola vez.
export function score(found: Found[], expected: {e: Expected; line: number}[], candidates: Found[] = []): Score {
  const matches = (f: Found, x: {e: Expected; line: number}) => f.path === x.e.fichero && Math.abs(f.start_line - x.line) <= (x.e.margen ?? 3) && (!x.e.tipo?.length || x.e.tipo.includes(f.category));
  const used = new Set<number>(), extra: Found[] = [];
  for (const f of found) {
    const i = expected.findIndex((x, i) => !used.has(i) && matches(f, x));
    if (i >= 0) used.add(i); else extra.push(f);
  }
  return {
    expected: expected.length, hits: used.size, extra,
    missed: expected.filter((_, i) => !used.has(i)).map(x => `${x.e.fichero}:${x.line}`),
    candidateHits: expected.filter(x => candidates.some(f => matches(f, x))).length,
  };
}

async function openai(model: string, key: string, name: string, instructions: string, input: string, schema: unknown) {
  const response = await fetch('https://api.openai.com/v1/responses', {method: 'POST', headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
    body: JSON.stringify({model, instructions, input, text: {format: {type: 'json_schema', name, strict: true, schema}}, max_output_tokens: 16000}), signal: AbortSignal.timeout(240000)});
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI respondió ${response.status}: ${String(body.error?.message || '').slice(0, 200)}`);
  const raw = body.output?.flatMap((x: any) => x.content || []).find((x: any) => x.type === 'output_text')?.text;
  if (!raw || body.status === 'incomplete') throw new Error('Respuesta incompleta de OpenAI');
  return {output: JSON.parse(raw), input_tokens: Number(body.usage?.input_tokens || 0), output_tokens: Number(body.usage?.output_tokens || 0)};
}

function args(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? 'true' : argv[++i];
  return out;
}

async function main() {
  const a = args(process.argv.slice(2));
  const key = process.env.OPENAI_API_KEY, model = a.modelo || process.env.OPENAI_MODEL;
  if (!key || !model) { console.error('Hace falta OPENAI_API_KEY en el entorno y --modelo (o OPENAI_MODEL).'); process.exit(2); }
  const casesDir = a.casos ? path.resolve(a.casos) : fileURLToPath(new URL('../evals/casos/', import.meta.url));
  const repeat = Math.max(1, Math.min(10, Number(a.repeticiones) || 1));
  const [inPrice, outPrice] = (a.precios || process.env.SANCHO_EVAL_PRECIOS || '').split(',').map(Number);
  // Instrucciones alternativas para comparar: una carpeta con deteccion.md y/o verificacion.md.
  const overrides: PromptOverrides = {};
  if (a.prompts) for (const name of ['deteccion', 'verificacion'] as const) { const f = path.join(path.resolve(a.prompts), name + '.md'); if (fs.existsSync(f)) overrides[name] = fs.readFileSync(f, 'utf8'); }
  const names = fs.readdirSync(casesDir).filter(n => fs.existsSync(path.join(casesDir, n, 'caso.json')) && (!a.caso || n.includes(a.caso))).sort();
  if (!names.length) { console.error('No hay casos que coincidan.'); process.exit(2); }

  const rows: any[] = [];
  let tokensIn = 0, tokensOut = 0, version = '';
  console.log(`Modelo ${model} · ${names.length} casos × ${repeat}\n`);
  for (const name of names) {
    const dir = path.join(casesDir, name), caso: CaseFile = JSON.parse(fs.readFileSync(path.join(dir, 'caso.json'), 'utf8'));
    const diff = filterReviewDiff(fs.readFileSync(path.join(dir, 'cambio.diff'), 'utf8'), {}, 60, 65000).diff;
    const expected = expectedLines(diff, caso.esperados || []);
    const repo = path.join(dir, 'repo');
    // El contexto se reúne igual que en el worker, leyendo del repositorio del caso en lugar de Bitbucket.
    const context = await gatherContext(diff, async (p, max) => {
      const file = path.resolve(repo, p);
      if (!file.startsWith(repo + path.sep) || !fs.existsSync(file)) return null;
      const text = fs.readFileSync(file, 'utf8');
      return {text: text.slice(0, max), truncated: text.length > max};
    });
    const rules: TeamRules = {global: caso.reglas};
    const detection = buildInstructions('deteccion', rules, false, overrides), verification = buildInstructions('verificacion', rules, false, overrides);
    version = shortHash(detection + verification);
    const data = reviewData({title: caso.titulo, repository: 'evals/' + name, diff, context: context.text});
    for (let r = 0; r < repeat; r++) {
      const started = Date.now();
      try {
        const det = await openai(model, key, 'sancho_detection', detection, data, DETECTION_SCHEMA);
        const candidates = (Array.isArray(det.output.candidates) ? det.output.candidates : []).slice(0, 40).map((f: any, i: number) => ({...f, candidate_id: 'candidate-' + i}));
        let confirmed: any[] = [], vin = 0, vout = 0;
        if (candidates.length) {
          const ver = await openai(model, key, 'sancho_verification', verification, ['<candidatos>', JSON.stringify(candidates, null, 1), '</candidatos>', '', data].join('\n'), VERIFICATION_SCHEMA);
          const decisions = new Map<string, any>((ver.output.results || []).map((x: any) => [String(x.candidate_id), x]));
          confirmed = candidates.filter((f: any) => decisions.get(f.candidate_id)?.disposition === 'supported').map((f: any) => ({...f, severity: decisions.get(f.candidate_id).severity || f.severity}));
          vin = ver.input_tokens; vout = ver.output_tokens;
        }
        // Mismo filtro que antes de publicar: gravedad válida y línea añadida en el diff.
        const valid = (f: any) => ['medium', 'high', 'critical'].includes(f.severity) /* el banco mide el perfil estándar */ && addedLineText(diff, String(f.path), Number(f.start_line)) !== null;
        const pick = (f: any): Found => ({path: String(f.path), start_line: Number(f.start_line), category: String(f.category), severity: String(f.severity), title: String(f.short_title || f.title).slice(0, 90)});
        const s = score(confirmed.filter(valid).map(pick), expected, candidates.filter(valid).map(pick));
        tokensIn += det.input_tokens + vin; tokensOut += det.output_tokens + vout;
        rows.push({name, run: r + 1, ...s, seconds: Math.round((Date.now() - started) / 1000)});
      } catch (e) {
        rows.push({name, run: r + 1, error: e instanceof Error ? e.message : String(e), expected: expected.length, hits: 0, missed: [], extra: [], candidateHits: 0});
      }
      const last = rows[rows.length - 1];
      console.log(`${last.error ? '✗' : last.missed.length || last.extra.length ? '△' : '✓'} ${name}${repeat > 1 ? ' #' + (r + 1) : ''}: ${last.error ? last.error : `${last.hits}/${last.expected} encontrados${last.extra.length ? ` · ${last.extra.length} de más: ${last.extra.map((f: Found) => `${f.title} (${f.path}:${f.start_line})`).join('; ')}` : ''}${last.candidateHits > last.hits ? ` · la verificación descartó ${last.candidateHits - last.hits} correcto(s)` : ''}`}`);
    }
  }

  const ok = rows.filter(r => !r.error), hits = ok.reduce((s, r) => s + r.hits, 0), exp = ok.reduce((s, r) => s + r.expected, 0), extra = ok.reduce((s, r) => s + r.extra.length, 0);
  const precision = hits + extra ? hits / (hits + extra) : null, recall = exp ? hits / exp : null;
  const f1 = precision && recall ? 2 * precision * recall / (precision + recall) : null;
  const cleanCases = ok.filter(r => r.expected === 0), cleanOk = cleanCases.filter(r => !r.extra.length).length;
  const cost = Number.isFinite(inPrice) && Number.isFinite(outPrice) ? (tokensIn * inPrice + tokensOut * outPrice) / 1_000_000 : null;
  const p = (x: number | null) => x === null ? '—' : `${Math.round(x * 100)} %`;
  console.log(`\nInstrucciones ${version}${a.prompts ? ' (de ' + a.prompts + ')' : ''}`);
  console.log(`Acierto (precisión) ${p(precision)} · Cobertura (recall) ${p(recall)} · F1 ${p(f1)}`);
  console.log(`Casos limpios sin comentarios: ${cleanOk}/${cleanCases.length} · Errores: ${rows.length - ok.length}`);
  console.log(`Tokens ${tokensIn.toLocaleString('es-ES')} de entrada y ${tokensOut.toLocaleString('es-ES')} de salida${cost === null ? ' (pasa --precios entrada,salida por millón para ver el coste)' : ` · ${cost.toFixed(3)} USD`}`);

  // Resultado resumido, para comparar ejecuciones. evals/resultados no se sube a git.
  const outDir = fileURLToPath(new URL('../evals/resultados/', import.meta.url));
  fs.mkdirSync(outDir, {recursive: true});
  const file = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({model, prompt_version: version, repeat, precision, recall, f1, tokens: {input: tokensIn, output: tokensOut}, cost_usd: cost, rows}, null, 1));
  console.log(`Guardado en ${path.relative(process.cwd(), file)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
