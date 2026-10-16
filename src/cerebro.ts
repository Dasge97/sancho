// Cerebro: motor de agente de Sancho. Servicio interno (sin puerto publicado) que recibe una
// tarea, prepara una copia del repositorio en el commit pedido y ejecuta un agente del Claude
// Agent SDK sobre ella. El agente decide qué leer con las herramientas del propio SDK.
//
// Modo `review`: solo herramientas de lectura (Read, Grep, Glob) y solo dentro de la copia.
// No ejecuta nada, no escribe y no sale a internet. Es el que usa la V1.
// Más adelante, el modo de corrección usará este mismo motor con herramientas de escritura.
//
// Autenticación del modelo: sin ANTHROPIC_API_KEY, la sesión de suscripción montada en
// CLAUDE_CONFIG_DIR (la del servidor); con ella, facturación por consumo.
// Este contenedor no tiene base de datos ni claves de Sancho: solo lo que necesita el agente.
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {query, type HookCallback} from '@anthropic-ai/claude-agent-sdk';
import {z} from 'zod';

const run = promisify(execFile);
const PORT = Number(process.env.PORT || 8200);
const TOKEN = process.env.CEREBRO_TOKEN || '';
const WORK = process.env.CEREBRO_WORKDIR || '/work';
const CHECKOUT_TTL_MS = 60 * 60_000;

/* ---- Copias de los repositorios ---- */

// Una carpeta por repositorio y commit, reutilizada por las llamadas de una misma revisión.
const checkoutDir = (ws: string, slug: string, commit: string) => path.join(WORK, `${ws}__${slug}__${commit}`.replace(/[^A-Za-z0-9_.-]/g, '_'));
const pending = new Map<string, Promise<string>>();

async function prepareCheckout(c: {workspace: string; slug: string; commit: string; email: string; token: string}): Promise<string> {
  const dir = checkoutDir(c.workspace, c.slug, c.commit);
  try { await fs.access(path.join(dir, '.sancho-ready')); return dir; } catch { /* no está todavía */ }
  if (!pending.has(dir)) pending.set(dir, (async () => {
    await fs.rm(dir, {recursive: true, force: true});
    await fs.mkdir(dir, {recursive: true});
    // Las credenciales van como cabecera en variables de entorno de git: ni en la URL, ni en la
    // línea de órdenes (saldría en los mensajes de error), ni en la configuración del repositorio.
    const auth = 'Authorization: Basic ' + Buffer.from(`${c.email}:${c.token}`).toString('base64');
    const url = `https://bitbucket.org/${encodeURIComponent(c.workspace)}/${encodeURIComponent(c.slug)}.git`;
    const env = {...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: auth};
    try {
      await run('git', ['init', '-q'], {cwd: dir, env});
      await run('git', ['fetch', '-q', '--depth', '1', url, c.commit], {cwd: dir, env, timeout: 180_000, maxBuffer: 10 * 1024 * 1024});
      await run('git', ['-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD'], {cwd: dir, env, timeout: 120_000});
    } catch (e: any) {
      await fs.rm(dir, {recursive: true, force: true});
      const detail = String(e?.stderr || '').split(auth).join('[oculto]').trim().slice(0, 300);
      throw new Error('git_checkout_failed' + (detail ? ': ' + detail : ''));
    }
    // Sin historial ni enlaces simbólicos: el agente no los necesita, y un enlace podría
    // apuntar fuera de la copia (por ejemplo, a la sesión de suscripción).
    await fs.rm(path.join(dir, '.git'), {recursive: true, force: true});
    await run('find', [dir, '-type', 'l', '-delete']);
    await fs.writeFile(path.join(dir, '.sancho-ready'), new Date().toISOString());
    return dir;
  })().finally(() => pending.delete(dir)));
  return pending.get(dir)!;
}

// Borra las copias que llevan más de una hora sin usarse.
async function cleanup() {
  const entries = await fs.readdir(WORK, {withFileTypes: true}).catch(() => []);
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(WORK, e.name);
    const stat = await fs.stat(dir).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > CHECKOUT_TTL_MS && !pending.has(dir)) await fs.rm(dir, {recursive: true, force: true});
  }
}

/* ---- Agente ---- */

const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob'];

// Antes de cada herramienta: la ruta tiene que estar dentro de la copia del repositorio.
function insideCheckout(root: string): HookCallback {
  return async input => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const toolInput = (input.tool_input || {}) as Record<string, unknown>;
    const target = String(toolInput.file_path ?? toolInput.path ?? root);
    const resolved = path.resolve(root, target);
    let real = resolved;
    try { real = await fs.realpath(resolved); } catch { /* aún no existe: vale la ruta resuelta */ }
    const ok = real === root || real.startsWith(root + path.sep);
    return ok ? {} : {hookSpecificOutput: {hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Solo se puede leer dentro del repositorio revisado.'}};
  };
}

const Task = z.object({
  mode: z.literal('review'),
  checkout: z.object({workspace: z.string().min(1), slug: z.string().min(1), commit: z.string().regex(/^[0-9a-f]{7,40}$/i), email: z.string().min(1), token: z.string().min(1)}),
  model: z.string().min(1).max(120),
  instructions: z.string().min(1),
  input: z.string().min(1),
  schema: z.record(z.string(), z.unknown()),
  maxTurns: z.number().int().min(1).max(200).default(40),
  timeoutMs: z.number().int().min(10_000).max(30 * 60_000).default(10 * 60_000),
});

interface ToolCall { tool: string; input: Record<string, unknown> }

async function runTask(task: z.infer<typeof Task>) {
  const root = await fs.realpath(await prepareCheckout(task.checkout));
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), task.timeoutMs);
  const toolCalls: ToolCall[] = [];
  // El agente solo recibe lo imprescindible del entorno: nada de claves de Sancho ni de Bitbucket.
  const env: Record<string, string> = {PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: process.env.HOME || '/home/cerebro'};
  for (const k of ['CLAUDE_CONFIG_DIR', 'ANTHROPIC_API_KEY']) if (process.env[k]) env[k] = process.env[k]!;
  try {
    let result: any = null;
    for await (const message of query({prompt: task.input, options: {
      cwd: root,
      model: task.model,
      systemPrompt: task.instructions,
      tools: READ_ONLY_TOOLS,
      allowedTools: READ_ONLY_TOOLS,
      permissionMode: 'dontAsk',
      settingSources: [],
      maxTurns: task.maxTurns,
      outputFormat: {type: 'json_schema', schema: task.schema},
      abortController: abort,
      env,
      hooks: {PreToolUse: [{hooks: [insideCheckout(root)]}]},
    }})) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) if (block.type === 'tool_use') toolCalls.push({tool: block.name, input: block.input as Record<string, unknown>});
      } else if (message.type === 'result') result = message;
    }
    if (!result) throw new Error('agent_no_result');
    const relative = (p: unknown) => typeof p === 'string' ? path.relative(root, path.resolve(root, p)) || '.' : p;
    return {
      ok: result.subtype === 'success' && !result.is_error,
      error: result.subtype === 'success' ? null : `agent_${result.subtype}`,
      output: result.subtype === 'success' ? (result.structured_output ?? null) : null,
      text: result.subtype === 'success' ? String(result.result || '').slice(0, 20_000) : (result.errors || []).join('; ').slice(0, 2000),
      numTurns: result.num_turns,
      costUsd: result.total_cost_usd,
      usage: result.usage,
      subscription: !env.ANTHROPIC_API_KEY,
      toolCalls: toolCalls.map(c => ({tool: c.tool, input: {...c.input, ...(c.input.file_path ? {file_path: relative(c.input.file_path)} : {}), ...(c.input.path ? {path: relative(c.input.path)} : {})}})),
    };
  } finally {
    clearTimeout(timer);
    // Marca la copia como usada para que la limpieza no la borre en mitad de una revisión.
    await fs.utimes(root, new Date(), new Date()).catch(() => {});
  }
}

/* ---- Servicio HTTP interno ---- */

const app = express();
app.use(express.json({limit: '2mb'}));
app.get('/health', (_req, res) => res.json({ok: true, mode: process.env.ANTHROPIC_API_KEY ? 'api' : 'subscription'}));
app.post('/tasks', async (req, res) => {
  const given = Buffer.from(req.get('authorization') || ''), expected = Buffer.from('Bearer ' + TOKEN);
  if (!TOKEN || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return res.status(401).json({error: 'unauthorized'});
  const parsed = Task.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({error: 'invalid_task'});
  try { res.json(await runTask(parsed.data)); }
  catch (e) {
    const code = e instanceof Error ? e.message : 'agent_failed';
    console.error('cerebro_task_failed', code.slice(0, 300));
    res.status(502).json({error: code.startsWith('git_checkout_failed') ? 'checkout_failed' : 'agent_failed'});
  }
});

await fs.mkdir(WORK, {recursive: true});
setInterval(() => void cleanup(), 10 * 60_000).unref();
app.listen(PORT, () => console.log(`Cerebro listening on ${PORT} (${process.env.ANTHROPIC_API_KEY ? 'clave de API' : 'suscripción'})`));
