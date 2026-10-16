// Muestra qué se envió al modelo en una revisión y qué respondió. Solo por consola, en el servidor:
//   docker compose exec api node dist-server/ai-log.js            → últimas revisiones con registro
//   docker compose exec api node dist-server/ai-log.js <id>       → instrucciones, datos y respuesta
// El contenido puede incluir código de los repositorios revisados (con los secretos ya ocultados).
import {pool} from './db.js';

const runId = process.argv[2];
if (!runId) {
  const {rows} = await pool.query(`SELECT e.run_id, max(e.created_at) at, count(*) calls, p.number, p.title, r.slug
    FROM ai_exchanges e JOIN review_runs rr ON rr.id=e.run_id JOIN pull_requests p ON p.id=rr.pull_request_id JOIN repositories r ON r.id=rr.repository_id
    GROUP BY e.run_id, p.number, p.title, r.slug ORDER BY at DESC LIMIT 20`);
  if (!rows.length) console.log('No hay registros. Se guardan durante AI_EXCHANGE_RETENTION_DAYS días (30 por defecto).');
  for (const r of rows) console.log(`${r.run_id}  ${new Date(r.at).toISOString().slice(0, 16)}  ${r.slug} #${r.number} · ${r.calls} llamadas · ${r.title}`);
} else {
  const {rows} = await pool.query('SELECT kind, model, status, created_at, instructions, input, output FROM ai_exchanges WHERE run_id=$1 ORDER BY created_at', [runId]);
  if (!rows.length) console.log('Esa revisión no tiene registro (no existe, no llamó a la IA o ya se ha borrado).');
  for (const e of rows) {
    const line = '='.repeat(100);
    console.log(`${line}\n${e.kind} · ${e.model} · ${e.status} · ${new Date(e.created_at).toISOString()}\n${line}`);
    console.log(`\n----- INSTRUCCIONES (${e.instructions.length} caracteres) -----\n${e.instructions}`);
    console.log(`\n----- DATOS (${e.input.length} caracteres) -----\n${e.input}`);
    console.log(`\n----- RESPUESTA -----\n${e.output ?? '(sin respuesta)'}\n`);
  }
}
await pool.end();
