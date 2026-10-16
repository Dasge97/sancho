import 'dotenv/config';
import 'express-async-errors';
import express from 'express'; import session from 'express-session'; import PgSession from 'connect-pg-simple'; import helmet from 'helmet'; import rateLimit from 'express-rate-limit'; import bcrypt from 'bcryptjs'; import crypto from 'node:crypto'; import path from 'node:path'; import {fileURLToPath,pathToFileURL} from 'node:url'; import {z} from 'zod';
import {pool,migrate} from './db.js';
import {annotateDiff,changedFiles,gatherContext} from './context.js';
import {parseRepoConfig,rulesForFiles,type RepoConfig} from './repo-config.js';
import {buildInstructions,defaultPrompt,PROMPT_NAMES,shortHash,type PromptName,type PromptOverrides} from './prompts.js';
import {findingFingerprint,hmacSha256,safeEqual,webhookEventKey,renderSummary,renderInlineComment,sanchoLink,clip,addedLineExists,filterReviewDiff,redactSecretsFromText,normalizePullRequest,isSessionlessPath,shouldAutoPublish} from './domain.js';
const app=express(), PgStore=PgSession(session), port=Number(process.env.PORT||3000), prod=process.env.NODE_ENV==='production',secureCookie=process.env.SESSION_COOKIE_SECURE?process.env.SESSION_COOKIE_SECURE==='true':prod;
app.disable('x-powered-by'); if(prod)app.set('trust proxy',1); app.use(helmet({contentSecurityPolicy:false,strictTransportSecurity:secureCookie?undefined:false})); app.use('/api/webhooks/bitbucket',express.raw({type:'application/json',limit:'256kb'})); app.use(express.json({limit:'256kb'}));
const sessionMiddleware=session({store:new PgStore({pool,tableName:'sessions',createTableIfMissing:false}),secret:process.env.SESSION_SECRET||'development-only-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:secureCookie,maxAge:12*60*60*1000}});
// Webhooks y health no usan sesión: así no crean filas en sessions ni exigen token CSRF.
app.use((req,res,next)=>isSessionlessPath(req.path)?next():sessionMiddleware(req,res,next));
app.use((req,res,next)=>{ if(isSessionlessPath(req.path))return next(); const s=req.session as typeof req.session & {csrf?:string}; if(!s.csrf)s.csrf=crypto.randomBytes(24).toString('hex'); res.setHeader('x-csrf-token',s.csrf); next(); });
const adminOnly=(req:express.Request,res:express.Response,next:express.NextFunction)=>{const u=(req.session as any).user;if(!u)return res.status(401).json({error:'Inicia sesión'});if(u.role!=='admin')return res.status(403).json({error:'Se requiere rol administrador'});next()};
const signedIn=(req:express.Request,res:express.Response,next:express.NextFunction)=>{if(!(req.session as any).user)return res.status(401).json({error:'Inicia sesión'});next()};
app.use('/api',(req,res,next)=>{if(['GET','HEAD','OPTIONS'].includes(req.method)||req.path==='/auth/login'||isSessionlessPath(req.baseUrl+req.path))return next(); const s=(req.session as any).csrf;if(!s||req.get('x-csrf-token')!==s)return res.status(403).json({error:'Token CSRF inválido'});next()});
const loginLimit=rateLimit({windowMs:15*60_000,limit:10,standardHeaders:true,legacyHeaders:false});
app.get('/health/live',(_req,res)=>res.json({ok:true})); app.get('/health/ready',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true})}catch{res.status(503).json({ok:false})}});
app.post('/api/auth/login',loginLimit,async(req,res)=>{const parsed=z.object({email:z.string().email(),password:z.string().min(1)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Credenciales no válidas'});const {rows}=await pool.query('SELECT id,email,password_hash,role,active FROM users WHERE email=$1',[parsed.data.email.toLowerCase()]);const u=rows[0];if(!u||!u.active||!await bcrypt.compare(parsed.data.password,u.password_hash))return res.status(401).json({error:'Correo o contraseña no válidos'});req.session.regenerate(err=>{if(err)return res.status(500).json({error:'No se pudo crear sesión'});(req.session as any).user={id:u.id,email:u.email,role:u.role};(req.session as any).csrf=crypto.randomBytes(24).toString('hex');res.setHeader('x-csrf-token',(req.session as any).csrf);req.session.save(e=>e?res.status(500).json({error:'No se pudo guardar sesión'}):res.json({id:u.id,email:u.email,role:u.role}))})});
app.post('/api/auth/logout',signedIn,(req,res)=>req.session.destroy(()=>res.status(204).end())); app.get('/api/me',signedIn,(req,res)=>res.json((req.session as any).user));
app.get('/api/dashboard',signedIn,async(_req,res)=>{const [runs,usage,jobs]=await Promise.all([pool.query("SELECT r.id,r.status,r.summary,r.created_at,p.number,p.title,p.url,repo.name repository FROM review_runs r JOIN pull_requests p ON p.id=r.pull_request_id JOIN repositories repo ON repo.id=r.repository_id ORDER BY r.created_at DESC LIMIT 8"),pool.query("SELECT COALESCE(sum(cost_usd),0) cost,count(*) calls FROM usage_calls WHERE date_trunc('month',created_at)=date_trunc('month',now())"),pool.query("SELECT count(*) FILTER(WHERE status='queued') queued,count(*) FILTER(WHERE status='running') running FROM jobs")]);res.json({reviews:runs.rows,usage:usage.rows[0],jobs:jobs.rows[0]})});
app.get('/api/users',adminOnly,async(_req,res)=>res.json((await pool.query('SELECT id,email,role,active,created_at FROM users ORDER BY created_at')).rows));
app.post('/api/users',adminOnly,async(req,res)=>{const p=z.object({email:z.string().email(),role:z.enum(['admin','member'])}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'Datos no válidos'});const token=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(token).digest('hex');try{const {rows}=await pool.query('INSERT INTO users(email,password_hash,role,active) VALUES($1,$2,$3,false) RETURNING id,email,role',[p.data.email.toLowerCase(),'!pending!',p.data.role]);await pool.query("INSERT INTO account_tokens(user_id,token_hash,purpose,expires_at) VALUES($1,$2,'activation',now()+interval '24 hours')",[rows[0].id,hash]);await audit((req.session as any).user.id,'user.created',rows[0].id);res.status(201).json({...rows[0],activation_token:token})}catch{res.status(409).json({error:'Ya existe una cuenta con ese correo'})}});
app.post('/api/users/:id/reset-link',adminOnly,async(req,res)=>{const user=await pool.query('SELECT id FROM users WHERE id=$1',[req.params.id]);if(!user.rows[0])return res.status(404).json({error:'Cuenta no encontrada'});const token=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(token).digest('hex');await pool.query("INSERT INTO account_tokens(user_id,token_hash,purpose,expires_at) VALUES($1,$2,'reset',now()+interval '30 minutes')",[req.params.id,hash]);await pool.query("DELETE FROM sessions WHERE sess->'user'->>'id'=$1",[req.params.id]);await audit((req.session as any).user.id,'user.reset_issued',req.params.id);res.json({reset_token:token,expires_in_minutes:30})});
app.post('/api/auth/activate',async(req,res)=>{const p=z.object({token:z.string(),password:z.string().min(12)}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'Enlace o contraseña no válidos'});const hash=crypto.createHash('sha256').update(p.data.token).digest('hex');const c=await pool.connect();try{await c.query('BEGIN');const {rows}=await c.query("SELECT user_id FROM account_tokens WHERE token_hash=$1 AND purpose IN ('activation','reset') AND used_at IS NULL AND expires_at>now() FOR UPDATE",[hash]);if(!rows[0]){await c.query('ROLLBACK');return res.status(400).json({error:'Enlace inválido o caducado'})}await c.query('UPDATE users SET password_hash=$1,active=true WHERE id=$2',[await bcrypt.hash(p.data.password,12),rows[0].user_id]);await c.query('UPDATE account_tokens SET used_at=now() WHERE token_hash=$1',[hash]);await c.query("DELETE FROM sessions WHERE sess->'user'->>'id'=$1",[rows[0].user_id]);await c.query('COMMIT');res.json({ok:true})}catch{await c.query('ROLLBACK');res.status(500).json({error:'No se pudo activar la cuenta'})}finally{c.release()}});
app.patch('/api/users/:id',adminOnly,async(req,res)=>{const p=z.object({role:z.enum(['admin','member']).optional(),active:z.boolean().optional()}).safeParse(req.body);if(!p.success||(!p.data.role&&p.data.active===undefined))return res.status(422).json({error:'Datos no válidos'});const {rows}=await pool.query('SELECT id,role,active FROM users WHERE id=$1',[req.params.id]);if(!rows[0])return res.status(404).json({error:'Cuenta no encontrada'});if(rows[0].role==='admin'&&rows[0].active&&(p.data.role==='member'||p.data.active===false)){const n=await pool.query("SELECT count(*) FROM users WHERE role='admin' AND active");if(Number(n.rows[0].count)<=1)return res.status(409).json({error:'No se puede desactivar el último administrador'})}const vals=[p.data.role??rows[0].role,p.data.active??rows[0].active,req.params.id];await pool.query('UPDATE users SET role=$1,active=$2 WHERE id=$3',vals);if(!vals[1])await pool.query("DELETE FROM sessions WHERE sess->'user'->>'id'=$1",[req.params.id]);await audit((req.session as any).user.id,'user.updated',req.params.id);res.json({ok:true})});
app.get('/api/repositories',signedIn,async(_req,res)=>res.json((await pool.query('SELECT id,remote_uuid,workspace,slug,name,active,config,updated_at,webhook_id FROM repositories ORDER BY name')).rows));
app.patch('/api/repositories/:id',adminOnly,async(req,res)=>{const p=z.object({active:z.boolean(),expected_updated_at:z.string().optional(),config:z.record(z.string(),z.unknown()).optional()}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'Datos no válidos'});const {rows}=await pool.query('UPDATE repositories SET active=$1,config=COALESCE($2,config),updated_at=now() WHERE id=$3 AND ($4::timestamptz IS NULL OR updated_at=$4) RETURNING id,active,updated_at',[p.data.active,p.data.config?JSON.stringify(p.data.config):null,req.params.id,p.data.expected_updated_at||null]);if(!rows[0])return res.status(409).json({error:'Configuración modificada o repositorio inexistente'});res.json(rows[0])});
// Reglas de un repositorio: de qué va el proyecto, qué vigilar o ignorar y rutas que no se revisan.
// Se guardan en repositories.config y se añaden a las instrucciones del modelo en cada revisión.
app.put('/api/repositories/:id/rules',adminOnly,async(req,res)=>{const p=z.object({context:z.string().max(4000),rules:z.string().max(8000),exclusions:z.array(z.string().min(1).max(250)).max(50)}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'Datos no válidos: revisa la longitud de los textos y las rutas excluidas.'});const {rows}=await pool.query("UPDATE repositories SET config=config||$1::jsonb,updated_at=now() WHERE id=$2 RETURNING id,config",[JSON.stringify(p.data),req.params.id]);if(!rows[0])return res.status(404).json({error:'Repositorio no encontrado'});await audit((req.session as any).user.id,'repository.rules.updated',req.params.id);res.json(rows[0])});
// Ficha del proyecto de un repositorio: la activa, las últimas versiones y si se está generando.
app.get('/api/repositories/:id/profile',signedIn,async(req,res)=>{
  const repo=(await pool.query('SELECT id FROM repositories WHERE id=$1',[req.params.id])).rows[0];if(!repo)return res.status(404).json({error:'Repositorio no encontrado'});
  const {rows}=await pool.query('SELECT p.id,p.content,p.summary,p.source,p.commit_sha,p.pr_url,p.created_at,u.email actor FROM project_profiles p LEFT JOIN users u ON u.id=p.created_by WHERE p.repository_id=$1 ORDER BY p.created_at DESC LIMIT 15',[repo.id]);
  const failed=(await pool.query("SELECT 1 FROM jobs WHERE kind='profile' AND status='failed' AND payload->>'repo_id'=$1 AND created_at>coalesce((SELECT max(created_at) FROM project_profiles WHERE repository_id=$2),'-infinity')",[repo.id,repo.id])).rowCount!>0;
  res.json({active:rows[0]||null,history:rows,generating:await profileJobPending(repo.id),failed,publish_pr:await setting('profile_publish_pr')!==false,agent_available:!!CEREBRO_URL});
});
app.put('/api/repositories/:id/profile',adminOnly,async(req,res)=>{
  const p=z.object({content:z.string().min(200).max(40000)}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'La ficha tiene que tener entre 200 y 40 000 caracteres.'});
  const repo=(await pool.query('SELECT * FROM repositories WHERE id=$1',[req.params.id])).rows[0];if(!repo)return res.status(404).json({error:'Repositorio no encontrado'});
  const conn=await setting('bitbucket_connection');const real=!repo.remote_uuid.startsWith('sim:')&&conn;
  const saved=await saveProfile(repo,real?bbAuth(conn):null,p.data.content.trim(),{source:'edited',userId:(req.session as any).user.id});
  await audit((req.session as any).user.id,'repository.profile.updated',repo.id);
  res.json({ok:true,pr_url:saved.prUrl,pr_error:saved.prError?'No se pudo actualizar la PR de la ficha en Bitbucket. La ficha sí se ha guardado.':null});
});
app.post('/api/repositories/:id/profile/regenerate',adminOnly,async(req,res)=>{
  const repo=(await pool.query('SELECT id,remote_uuid FROM repositories WHERE id=$1',[req.params.id])).rows[0];if(!repo)return res.status(404).json({error:'Repositorio no encontrado'});
  if(!CEREBRO_URL)return res.status(409).json({error:'El motor de agente no está instalado: la ficha la escribe el agente de Claude.'});
  if(repo.remote_uuid.startsWith('sim:'))return res.status(409).json({error:'Los repositorios de ejemplo no tienen código que estudiar.'});
  await enqueueProfile(repo.id,'pedido desde el panel');await audit((req.session as any).user.id,'repository.profile.requested',repo.id);
  res.status(202).json({queued:true});
});
// El .sancho.yml de la rama principal, para enseñarlo en el panel con sus errores si los tiene.
app.get('/api/repositories/:id/repo-config',signedIn,async(req,res)=>{
  const repo=(await pool.query('SELECT * FROM repositories WHERE id=$1',[req.params.id])).rows[0];if(!repo)return res.status(404).json({error:'Repositorio no encontrado'});
  if(repo.remote_uuid.startsWith('sim:'))return res.json({found:false,text:null,error:null,branch:null});
  const conn=await setting('bitbucket_connection');if(!conn)return res.status(409).json({error:'Configura la conexión con Bitbucket'});
  try{const auth=bbAuth(conn),head=await mainHead(repo,auth),file=await fetchRepoFile(repo,auth,head.hash,'.sancho.yml',20000);const parsed=parseRepoConfig(file?.text??null);res.json({found:!!file,text:file?.text??null,error:parsed.error,branch:head.branch})}
  catch{res.status(502).json({error:'No se pudo leer el repositorio en Bitbucket'})}
});
app.get('/api/reviews',signedIn,async(_req,res)=>res.json((await pool.query('SELECT r.*,p.number,p.title,p.url,repo.name repository FROM review_runs r JOIN pull_requests p ON p.id=r.pull_request_id JOIN repositories repo ON repo.id=r.repository_id ORDER BY r.created_at DESC LIMIT 100')).rows));
app.get('/api/reviews/:id',signedIn,async(req,res)=>{const run=await pool.query('SELECT r.*,p.number,p.title,p.url,repo.name repository FROM review_runs r JOIN pull_requests p ON p.id=r.pull_request_id JOIN repositories repo ON repo.id=r.repository_id WHERE r.id=$1',[req.params.id]);if(!run.rows[0])return res.status(404).json({error:'Revisión no encontrada'});const [findings,usage]=await Promise.all([pool.query('SELECT * FROM findings WHERE run_id=$1 ORDER BY severity,path,start_line',[req.params.id]),pool.query('SELECT provider,model,input_tokens,output_tokens,cost_usd,status,created_at FROM usage_calls WHERE run_id=$1',[req.params.id])]);res.json({run:run.rows[0],findings:findings.rows,usage:usage.rows})});
app.post('/api/repositories/:id/reviews',signedIn,async(req,res)=>{const p=z.object({number:z.number().int().positive(),publish:z.boolean().default(false),idempotency_key:z.string().min(8)}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'Datos no válidos'});const repo=await pool.query('SELECT * FROM repositories WHERE id=$1',[req.params.id]);if(!repo.rows[0]||!repo.rows[0].active)return res.status(404).json({error:'Repositorio no conectado o pausado'});if(p.data.publish&&(req.session as any).user.role!=='admin')return res.status(403).json({error:'Solo administración puede solicitar publicación'});const result=await createReview(repo.rows[0],p.data.number,'manual',p.data.publish,(req.session as any).user.id+':'+req.params.id+':'+p.data.idempotency_key);if(result.error)return res.status(404).json(result);res.status(result.created?202:200).json(result)});
app.get('/api/usage',signedIn,async(_req,res)=>{const {rows}=await pool.query("SELECT date_trunc('day',created_at) AS usage_day,model,count(*) calls,sum(input_tokens) input_tokens,sum(output_tokens) output_tokens,sum(cost_usd) cost_usd,count(*) FILTER(WHERE cost_usd IS NULL) unknown_cost_calls FROM usage_calls WHERE created_at>=date_trunc('month',now()) GROUP BY 1,2 ORDER BY 1 DESC");const totals=await pool.query("SELECT COALESCE(sum(cost_usd),0) known_cost,count(*) FILTER(WHERE cost_usd IS NULL) unknown_cost_calls FROM usage_calls WHERE created_at>=date_trunc('month',now())");const budget=await pool.query("SELECT value FROM settings WHERE key='monthly_budget_usd'");const limit=budget.rows[0]?.value??null,known=Number(totals.rows[0].known_cost);res.json({monthly_budget_usd:limit,monthly_known_cost:known,unknown_cost_calls:Number(totals.rows[0].unknown_cost_calls),budget_warning:limit!==null&&known>=Number(limit)*0.8,over_budget:limit!==null&&known>=Number(limit),warning_only:true,days:rows})});
// Instrucciones de la IA editables desde el panel. Cada cambio es una versión nueva; una versión
// con contenido nulo significa «volver al original de prompts/». La activa es la más reciente.
async function activePrompts():Promise<PromptOverrides>{const {rows}=await pool.query('SELECT DISTINCT ON (name) name,content FROM prompt_versions ORDER BY name,created_at DESC');return Object.fromEntries(rows.map(r=>[r.name,r.content]))}
const promptLabels:Record<PromptName,string>={deteccion:'Detección',verificacion:'Verificación',agente:'Agente',ficha:'Ficha del proyecto'};
app.get('/api/prompts',adminOnly,async(_req,res)=>{
  const {rows}=await pool.query("SELECT p.id,p.name,p.content,p.created_at,u.email actor,row_number() OVER (PARTITION BY p.name ORDER BY p.created_at DESC) n FROM prompt_versions p LEFT JOIN users u ON u.id=p.created_by");
  res.json(PROMPT_NAMES.map(name=>{const history=rows.filter(r=>r.name===name&&r.n<=15).sort((a,b)=>Number(a.n)-Number(b.n));const active=history[0];return {name,label:promptLabels[name],original:defaultPrompt(name),content:active?.content??defaultPrompt(name),customized:!!active?.content,updated_at:active?.created_at??null,updated_by:active?.actor??null,history:history.map(h=>({id:h.id,created_at:h.created_at,actor:h.actor,content:h.content}))}}));
});
app.put('/api/prompts/:name',adminOnly,async(req,res)=>{
  const name=req.params.name as PromptName;if(!PROMPT_NAMES.includes(name))return res.status(404).json({error:'Instrucción no encontrada'});
  const p=z.object({content:z.string().max(40000).nullable()}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'El texto no es válido o pasa de 40 000 caracteres.'});
  const content=p.data.content?.trim()||null;
  if(content&&content.length<200)return res.status(422).json({error:'Las instrucciones son demasiado cortas: escribe al menos 200 caracteres.'});
  // Guardar el texto original es lo mismo que restaurarlo.
  const value=content&&content===defaultPrompt(name).trim()?null:content;
  await pool.query('INSERT INTO prompt_versions(name,content,created_by) VALUES($1,$2,$3)',[name,value,(req.session as any).user.id]);
  await audit((req.session as any).user.id,value?'prompt.updated':'prompt.reset',name);
  res.json({ok:true,customized:!!value});
});
// Estado del motor de agente, para el panel: si está configurado y si responde.
app.get('/api/engine',adminOnly,async(_req,res)=>{let agent:any={configured:!!CEREBRO_URL,reachable:false,mode:null};if(CEREBRO_URL){try{const r=await fetch(CEREBRO_URL.replace(/\/$/,'')+'/health',{signal:AbortSignal.timeout(5000)});const b:any=await r.json();agent={configured:true,reachable:r.ok,mode:b.mode||null}}catch{}}res.json({engine:await reviewEngine(),agent,agent_model:await setting('agent_model')||'claude-opus-5-5'})});
// Los secretos no salen nunca, ni cifrados: de OpenAI solo si hay clave; de Bitbucket, workspace y correo.
app.get('/api/settings',adminOnly,async(_req,res)=>{const {rows}=await pool.query("SELECT key,value,version,updated_at FROM settings WHERE key<>'bitbucket_secret'");res.json(rows.map(r=>r.key==='openai_secret'?{...r,value:{configured:true}}:r.key==='bitbucket_connection'?{...r,value:{configured:true,workspace:r.value?.workspace,email:r.value?.email}}:r))});
app.put('/api/settings',adminOnly,async(req,res)=>{const p=z.object({monthly_budget_usd:z.number().nonnegative().nullable().optional(),model:z.string().min(1).max(120).optional(),language:z.string().max(20).optional(),min_severity:z.enum(['medium','high','critical']).optional(),input_price_per_million:z.number().nonnegative().nullable().optional(),output_price_per_million:z.number().nonnegative().nullable().optional(),auto_publish:z.boolean().optional(),profile_publish_pr:z.boolean().optional(),review_rules:z.string().max(8000).optional(),review_engine:z.enum(['agent','openai']).optional(),agent_model:z.string().min(1).max(120).optional(),review_exclusions:z.array(z.string().min(1).max(250)).max(50).optional()}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'Datos no válidos'});for(const [k,v] of Object.entries(p.data))await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,version=settings.version+1,updated_at=now()',[k,JSON.stringify(v)]);await audit((req.session as any).user.id,'settings.updated','global');res.json({ok:true})});
app.put('/api/settings/openai-secret',adminOnly,async(req,res)=>{const p=z.object({api_key:z.string().min(20)}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'Clave no válida'});try{const encrypted=encrypt(p.data.api_key);await pool.query("INSERT INTO settings(key,value) VALUES('openai_secret',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,version=settings.version+1,updated_at=now()",[JSON.stringify(encrypted)]);await audit((req.session as any).user.id,'openai.secret.rotated','global');res.json({configured:true,masked:'••••••••'+p.data.api_key.slice(-4)})}catch{res.status(503).json({error:'Falta SANCHO_ENCRYPTION_KEY de 32 bytes'})}});
app.post('/api/settings/test-openai',adminOnly,async(_req,res)=>{const key=await getSecret('openai_secret');if(!key)return res.status(409).json({error:'Configura primero la clave API'});const model=await setting('model');if(!model)return res.status(409).json({error:'Configura explícitamente un modelo compatible'});try{const result=await callOpenAI(model,key,{instructions:'Responde solo con el objeto JSON pedido.',input:'Devuelve el objeto JSON con ok=true.'},null,'sancho_compatibility_check',{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false});if(result.ok!==true)return res.status(502).json({ok:false,error:'El modelo no respetó la salida estructurada'});res.json({ok:true,model,structured_output:true})}catch{res.status(502).json({ok:false,error:'El modelo no aceptó la salida estructurada solicitada'})}});
app.post('/api/connections',adminOnly,async(req,res)=>{const p=z.object({workspace:z.string().min(1),email:z.string().email(),api_token:z.string().min(1)}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'Datos no válidos'});try{const secret=encrypt(p.data.api_token);await pool.query("INSERT INTO settings(key,value) VALUES('bitbucket_connection',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,version=settings.version+1,updated_at=now()",[JSON.stringify({workspace:p.data.workspace,email:p.data.email,secret})]);await audit((req.session as any).user.id,'bitbucket.connection.saved','global');res.json({saved:true,verified:false,message:'Credencial guardada; ejecuta la prueba de conexión'})}catch{res.status(503).json({error:'Falta SANCHO_ENCRYPTION_KEY de 32 bytes'})}});
app.post('/api/connections/test',adminOnly,async(_req,res)=>{try{const c=await setting('bitbucket_connection');if(!c)return res.status(409).json({error:'Configura la conexión'});const token=decrypt(c.secret);const r=await fetch(`https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(c.workspace)}?pagelen=1`,{headers:{Authorization:`Basic ${Buffer.from(`${c.email}:${token}`).toString('base64')}`},signal:AbortSignal.timeout(15_000)});if(!r.ok)return res.status(502).json({ok:false,status:r.status,error:'Bitbucket rechazó la conexión'});const body:any=await r.json();res.json({ok:true,workspace:c.workspace,repository_count:body.size??null})}catch{res.status(502).json({ok:false,error:'No se pudo probar Bitbucket'})}});
app.post('/api/connections/sync',adminOnly,async(_req,res)=>{try{const c=await setting('bitbucket_connection');if(!c)return res.status(409).json({error:'Configura la conexión'});const token=decrypt(c.secret),auth=`Basic ${Buffer.from(`${c.email}:${token}`).toString('base64')}`;let url=`https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(c.workspace)}?pagelen=100`;let count=0;for(let page=0;url&&page<20;page++){const r=await fetch(url,{headers:{Authorization:auth},signal:AbortSignal.timeout(20_000)});if(!r.ok)return res.status(502).json({error:`Bitbucket rechazó la sincronización (${r.status})`});const b:any=await r.json();for(const x of b.values||[]){await pool.query('INSERT INTO repositories(remote_uuid,workspace,slug,name) VALUES($1,$2,$3,$4) ON CONFLICT(remote_uuid) DO UPDATE SET workspace=EXCLUDED.workspace,slug=EXCLUDED.slug,name=EXCLUDED.name',[x.uuid,c.workspace,x.slug,x.name]);count++}url=b.next||'';if(url&&!url.startsWith('https://api.bitbucket.org/2.0/'))throw new Error('Origen de paginación no permitido')}res.json({synchronized:count,active:false})}catch{res.status(502).json({error:'No se pudieron sincronizar los repositorios'})}});
app.post('/api/repositories/:id/webhook',adminOnly,async(req,res)=>{
  const publicBase=process.env.PUBLIC_BASE_URL;
  if(!publicBase||!publicBase.startsWith('https://'))return res.status(409).json({error:'Configura PUBLIC_BASE_URL con HTTPS antes de instalar webhooks'});
  const repo=(await pool.query('SELECT * FROM repositories WHERE id=$1',[req.params.id])).rows[0];
  if(!repo)return res.status(404).json({error:'Repositorio no encontrado'});
  if(repo.remote_uuid.startsWith('sim:'))return res.status(409).json({error:'El simulador no instala webhooks externos'});
  const conn=await setting('bitbucket_connection');if(!conn)return res.status(409).json({error:'Configura la conexión Bitbucket'});
  const token=decrypt(conn.secret),auth=`Basic ${Buffer.from(`${conn.email}:${token}`).toString('base64')}`;
  const secret=crypto.randomBytes(32).toString('base64url'),callback=`${publicBase.replace(/\/$/,'')}/api/webhooks/bitbucket/${repo.id}`;
  const base=`https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.slug)}/hooks`;
  try{
    const method=repo.webhook_id?'PUT':'POST',url=repo.webhook_id?`${base}/${encodeURIComponent(repo.webhook_id)}`:base;
    const response=await fetch(url,{method,headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({description:'Sancho PR Reviewer',url:callback,active:true,secret,events:['repo:push','pullrequest:created','pullrequest:updated','pullrequest:fulfilled','pullrequest:rejected'] }),signal:AbortSignal.timeout(20000)});
    if(!response.ok)return res.status(502).json({error:`Bitbucket no permitió instalar el webhook (${response.status}). Comprueba los permisos de administración del repositorio.`});
    const hook:any=await response.json();
    await pool.query('UPDATE repositories SET webhook_id=$1,webhook_secret=$2,updated_at=now() WHERE id=$3',[hook.uuid||hook.id,JSON.stringify(encrypt(secret)),repo.id]);
    await audit((req.session as any).user.id,'repository.webhook.configured',repo.id);
    res.json({configured:true,webhook_id:hook.uuid||hook.id,callback_url:callback});
  }catch{res.status(502).json({error:'No se pudo instalar el webhook'})}
});
app.post('/api/webhooks/bitbucket/:connectionId',async(req,res)=>{
  const row=(await pool.query('SELECT * FROM repositories WHERE id=$1 AND active=true',[req.params.connectionId])).rows[0];if(!row)return res.status(404).end();
  if(!row.webhook_secret)return res.status(503).end();let secret:string;try{secret=decrypt(JSON.parse(row.webhook_secret))}catch{return res.status(503).end()}
  const raw=req.body as Buffer,signature=req.get('x-hub-signature')||'';if(!safeEqual(signature,hmacSha256(secret,raw)))return res.status(401).end();
  let payload:any;try{payload=JSON.parse(raw.toString())}catch{return res.status(400).end()}
  const event=req.get('x-event-key')||'unknown',key=webhookEventKey(event,raw);
  try{await pool.query('INSERT INTO webhook_events(event_key) VALUES($1)',[key])}catch{return res.status(202).json({duplicate:true})}
  try{
    if(event==='repo:push'){await pool.query("INSERT INTO jobs(kind,payload) VALUES('reconcile',$1)",[JSON.stringify({repo_id:row.id,webhook_key:key})])}
    else if((event==='pullrequest:created'||event==='pullrequest:updated')&&payload.pullrequest?.source?.commit?.hash&&payload.pullrequest?.destination?.commit?.hash){
      const pr=payload.pullrequest;await enqueue(row,pr,pr.source.commit.hash,pr.destination.commit.hash,'webhook',shouldAutoPublish(await setting('auto_publish'),normalizePullRequest(pr)),key)
    }else if(['pullrequest:fulfilled','pullrequest:rejected','pullrequest:deleted'].includes(event)&&payload.pullrequest?.id){
      const number=Number(payload.pullrequest.id);await pool.query("UPDATE pull_requests SET state='CLOSED' WHERE repository_id=$1 AND number=$2",[row.id,number]);await pool.query("UPDATE jobs SET status='cancelled' WHERE status='queued' AND payload->>'repo_id'=$1 AND (payload->>'number')::int=$2",[row.id,number])
    }
    await pool.query('UPDATE webhook_events SET processed=true WHERE event_key=$1',[key]);return res.status(202).json({accepted:true});
  }catch(e){await pool.query('DELETE FROM webhook_events WHERE event_key=$1',[key]);console.error('webhook_processing_failed',row.id,event,e instanceof Error?e.message:'unknown');return res.status(503).json({error:'No se pudo aceptar el evento; Bitbucket puede reintentarlo'})}
});
async function createReview(repo:any,number:number,trigger:string,publish=false,idempotencyKey?:string){
  let pr:any;
  if(repo.remote_uuid.startsWith('sim:'))pr=(await pool.query('SELECT * FROM pull_requests WHERE repository_id=$1 AND number=$2',[repo.id,number])).rows[0];
  else{
    const conn=await setting('bitbucket_connection');if(!conn)return {error:'Configura la conexión Bitbucket'};
    const auth='Basic '+Buffer.from(conn.email+':'+decrypt(conn.secret)).toString('base64');
    const url='https://api.bitbucket.org/2.0/repositories/'+encodeURIComponent(repo.workspace)+'/'+encodeURIComponent(repo.slug)+'/pullrequests/'+number;
    const response=await fetch(url,{headers:{Authorization:auth},signal:AbortSignal.timeout(20000)});if(!response.ok)return {error:'Bitbucket no pudo consultar esa PR ('+response.status+')'};
    pr=await response.json();
  }
  if(!pr)return {error:'Pull request no encontrada'};
  const {source_sha:src,destination_sha:dst}=normalizePullRequest(pr);
  if(!src||!dst)return {error:'Bitbucket no devolvió los dos commits de la PR'};
  const result=await enqueue(repo,pr,src,dst,trigger,publish,idempotencyKey);return {id:result.id,status:result.status,created:result.created};
}
async function enqueue(repo:any,remotePr:any,src:string,dst:string,trigger:string,publish=false,idempotencyKey?:string){
  const pr=normalizePullRequest(remotePr);if(!pr.number)throw new Error('pull_request_number_missing');
  // Las PR que abre el propio Sancho (la ficha del proyecto) no se revisan.
  if(pr.source_branch.startsWith('sancho/'))return {id:null,status:'skipped',created:false};
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query('INSERT INTO pull_requests(repository_id,number,title,author,source_sha,destination_sha,state,draft,url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(repository_id,number) DO UPDATE SET title=EXCLUDED.title,source_sha=EXCLUDED.source_sha,destination_sha=EXCLUDED.destination_sha,state=EXCLUDED.state,draft=EXCLUDED.draft,url=EXCLUDED.url',[repo.id,pr.number,pr.title,pr.author,src,dst,pr.state,pr.draft,pr.url]);
    const prId=(await c.query('SELECT id FROM pull_requests WHERE repository_id=$1 AND number=$2',[repo.id,pr.number])).rows[0].id;
    await c.query("UPDATE review_runs SET status='superseded',publication_status=CASE WHEN publication_status='not_requested' THEN publication_status ELSE 'stale' END,superseded_by=NULL WHERE pull_request_id=$1 AND (source_sha<>$2 OR destination_sha<>$3) AND status IN ('queued','analyzing','completed','partial')",[prId,src,dst]);
    await c.query("UPDATE jobs SET status='cancelled' WHERE status='queued' AND kind='review' AND payload->>'repo_id'=$1 AND (payload->>'number')::int=$2 AND payload->>'run_id' IN (SELECT id::text FROM review_runs WHERE pull_request_id=$3 AND status='superseded')",[repo.id,pr.number,prId]);
    if(pr.state!=='OPEN'||pr.draft){
      await c.query("UPDATE jobs SET status='cancelled' WHERE status='queued' AND payload->>'repo_id'=$1 AND (payload->>'number')::int=$2",[repo.id,pr.number]);
      await c.query("UPDATE review_runs SET status='cancelled' WHERE pull_request_id=$1 AND status='queued'",[prId]);
      await c.query('COMMIT');return {id:null,status:'cancelled',created:false};
    }
    // Manual: se puede repetir una revisión fallida. Webhook y reconciliación: una revisión fallida para los mismos commits
    // no se relanza sola, para no repetir gasto cada 10 minutos; solo se vuelve a revisar si la PR estaba en borrador (cancelled).
    const existing=trigger==='manual'&&idempotencyKey
      ?await c.query("SELECT id,status FROM review_runs WHERE idempotency_key=$1 OR (pull_request_id=$2 AND source_sha=$3 AND destination_sha=$4 AND status IN ('queued','analyzing','ready_to_publish','publishing')) ORDER BY (idempotency_key=$1) DESC,created_at DESC LIMIT 1",[idempotencyKey,prId,src,dst])
      :await c.query("SELECT id,status FROM review_runs WHERE pull_request_id=$1 AND source_sha=$2 AND destination_sha=$3 AND status<>'cancelled' ORDER BY generation DESC LIMIT 1",[prId,src,dst]);
    if(existing.rows[0]){await c.query('COMMIT');return {id:existing.rows[0].id,status:existing.rows[0].status,created:false}}
    const gen=await c.query('SELECT COALESCE(max(generation),0)+1 generation FROM review_runs WHERE pull_request_id=$1 AND source_sha=$2 AND destination_sha=$3',[prId,src,dst]);
    const ins=await c.query("INSERT INTO review_runs(repository_id,pull_request_id,source_sha,destination_sha,generation,status,coverage,idempotency_key,publication_status) VALUES($1,$2,$3,$4,$5,'queued',$6,$7,$8) RETURNING id,status",[repo.id,prId,src,dst,gen.rows[0].generation,JSON.stringify({trigger}),trigger==='manual'?idempotencyKey:null,publish?'pending':'not_requested']);
    await c.query("UPDATE review_runs SET superseded_by=$1 WHERE pull_request_id=$2 AND status='superseded' AND superseded_by IS NULL AND (source_sha<>$3 OR destination_sha<>$4)",[ins.rows[0].id,prId,src,dst]);
    await c.query("INSERT INTO jobs(kind,payload) VALUES('review',$1)",[JSON.stringify({run_id:ins.rows[0].id,repo_id:repo.id,number:pr.number,publish})]);
    await c.query('COMMIT');return {...ins.rows[0],created:true};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
app.post('/api/findings/:id/feedback',signedIn,async(req,res)=>{const p=z.object({vote:z.enum(['useful','false_positive']),reason:z.string().max(1000).optional()}).safeParse(req.body);if(!p.success)return res.status(422).json({error:'Datos no válidos'});const f=await pool.query('SELECT id FROM findings WHERE id=$1',[req.params.id]);if(!f.rows[0])return res.status(404).json({error:'Hallazgo no encontrado'});await pool.query('INSERT INTO feedback(finding_id,user_id,vote,reason) VALUES($1,$2,$3,$4) ON CONFLICT(finding_id,user_id) DO UPDATE SET vote=EXCLUDED.vote,reason=EXCLUDED.reason',[req.params.id,(req.session as any).user.id,p.data.vote,p.data.reason||null]);res.json({ok:true})});
app.get('/api/audit',adminOnly,async(_req,res)=>res.json((await pool.query('SELECT a.id,u.email actor,a.action,a.object_type,a.object_id,a.details,a.created_at FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 200')).rows));
app.use('/api',(err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error('api_error',err instanceof Error?'request_failed':'unknown');res.status(500).json({error:'Error interno'})});
const __dirname=path.dirname(fileURLToPath(import.meta.url)),staticDir=path.resolve(__dirname,'../dist');app.use(express.static(staticDir));app.get('*',(_req,res)=>res.sendFile(path.join(staticDir,'index.html')));
async function audit(actor:string,action:string,object:string){await pool.query('INSERT INTO audit_events(actor_id,action,object_type,object_id) VALUES($1,$2,$3,$4)',[actor,action,'configuration',object])}
function encrypt(value:string){const raw=process.env.SANCHO_ENCRYPTION_KEY;if(!raw)throw new Error('missing key');const key=Buffer.from(raw,'base64');if(key.length!==32)throw new Error('bad key');const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(value,'utf8'),c.final()]);return {iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')}} function decrypt(v:any){const key=Buffer.from(process.env.SANCHO_ENCRYPTION_KEY||'','base64'),d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(v.iv,'base64'));d.setAuthTag(Buffer.from(v.tag,'base64'));return Buffer.concat([d.update(Buffer.from(v.data,'base64')),d.final()]).toString('utf8')} async function setting(k:string){const x=await pool.query('SELECT value FROM settings WHERE key=$1',[k]);return x.rows[0]?.value}async function getSecret(k:string){const v=await setting(k);if(!v)return null;try{return decrypt(v)}catch{return null}}
// Toma y procesa un trabajo de la cola. Devuelve false si no había ninguno listo.
export async function processNextJob():Promise<boolean>{
  const c=await pool.connect();let job:any;
  try{await c.query('BEGIN');
    // Dos llamadas al agente pueden tardar hasta 20 minutos; un bloqueo más antiguo indica un worker caído.
    await c.query("UPDATE jobs SET status='queued',locked_at=NULL,run_after=now() WHERE status='running' AND locked_at<now()-interval '45 minutes'");
    const q=await c.query("SELECT * FROM jobs WHERE status='queued' AND run_after<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");
    if(q.rows[0]){job=q.rows[0];job.attempts+=1;await c.query("UPDATE jobs SET status='running',locked_at=now(),attempts=attempts+1 WHERE id=$1",[job.id]);if(job.kind==='review')await c.query("UPDATE review_runs SET status='analyzing' WHERE id=$1 AND status IN ('queued','analyzing')",[job.payload.run_id]);}
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  if(!job)return false;
  if(job.kind==='publish')await publishRun(job);else if(job.kind==='reconcile')await reconcileJob(job);else if(job.kind==='profile')await profileJob(job);else await runReview(job);
  return true;
}
async function worker(){
  while(true){
    try{if(!await processNextJob()){await scheduleReconciliation();await new Promise(r=>setTimeout(r,1000))}}
    catch(e){console.error('worker_error',e instanceof Error?e.message:'unknown');await new Promise(r=>setTimeout(r,2000))}
  }
}
let lastReconcileScheduled=0;
async function scheduleReconciliation(){
  if(Date.now()-lastReconcileScheduled<600000)return;lastReconcileScheduled=Date.now();
  await pool.query("DELETE FROM ai_exchanges WHERE created_at<now()-($1*interval '1 day')",[Math.max(AI_EXCHANGE_RETENTION_DAYS,0)]);
  const repos=await pool.query("SELECT id FROM repositories WHERE active=true AND remote_uuid NOT LIKE 'sim:%' ORDER BY updated_at LIMIT 30");
  for(const repo of repos.rows)await pool.query("INSERT INTO jobs(kind,payload) SELECT 'reconcile',$1 WHERE NOT EXISTS(SELECT 1 FROM jobs WHERE kind='reconcile' AND status IN ('queued','running') AND payload->>'repo_id'=$2)",[JSON.stringify({repo_id:repo.id}),repo.id]);
}
async function reconcileJob(job:any){
  try{
    const repo=(await pool.query('SELECT * FROM repositories WHERE id=$1 AND active=true',[job.payload.repo_id])).rows[0];if(!repo){await pool.query("UPDATE jobs SET status='cancelled' WHERE id=$1",[job.id]);return}
    if(repo.remote_uuid.startsWith('sim:')){await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);return}
    const conn=await setting('bitbucket_connection');if(!conn)throw new Error('bitbucket_not_configured');const auth='Basic '+Buffer.from(conn.email+':'+decrypt(conn.secret)).toString('base64');
    let url='https://api.bitbucket.org/2.0/repositories/'+encodeURIComponent(repo.workspace)+'/'+encodeURIComponent(repo.slug)+'/pullrequests?state=OPEN&pagelen=50';
    for(let page=0;url&&page<5;page++){
      const response=await fetch(url,{headers:{Authorization:auth},signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('bitbucket_'+response.status);const body:any=await response.json();
      const autoPublish=await setting('auto_publish');
      for(const pr of body.values||[]){const n=normalizePullRequest(pr);if(n.source_sha&&n.destination_sha)await enqueue(repo,pr,n.source_sha,n.destination_sha,'reconcile',shouldAutoPublish(autoPublish,n),undefined)}
      url=body.next||'';if(url&&!url.startsWith('https://api.bitbucket.org/2.0/'))throw new Error('bitbucket_pagination_origin')
    }
    await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id])
  }catch(e){const code=e instanceof Error?e.message:'reconcile_failed';if(job.attempts<3){await pool.query("UPDATE jobs SET status='queued',locked_at=NULL,run_after=now()+($2*interval '1 second') WHERE id=$1",[job.id,60*job.attempts]);return}await pool.query("UPDATE jobs SET status='failed' WHERE id=$1",[job.id]);console.error('reconciliation_failed',job.payload.repo_id,code)}
}
// En modelos con razonamiento, los tokens de razonamiento cuentan dentro de este límite.
const OPENAI_MAX_OUTPUT_TOKENS=Number(process.env.OPENAI_MAX_OUTPUT_TOKENS||16000);
// Registro de lo enviado al modelo y lo que respondió, por revisión. Solo se consulta por consola
// (dist-server/ai-log.js) y se borra a los AI_EXCHANGE_RETENTION_DAYS días; con 0 no se guarda.
// El diff y el contexto llegan aquí con los secretos ya ocultados.
const AI_EXCHANGE_RETENTION_DAYS=Number(process.env.AI_EXCHANGE_RETENTION_DAYS??30);
async function recordExchange(runId:string|null,kind:string,model:string,instructions:string,input:string,output:string|null,status:string,tools:unknown[]=[]){
  if(!runId||AI_EXCHANGE_RETENTION_DAYS<=0)return;
  await pool.query('INSERT INTO ai_exchanges(run_id,kind,model,instructions,input,output,status,tools) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[runId,kind,model,instructions,input,output,status,JSON.stringify(tools)]).catch(e=>console.error('ai_exchange_not_recorded',e instanceof Error?e.message:'unknown'));
}
async function callOpenAI(model:string,key:string,prompt:{instructions:string;input:string},runId:string|null,schemaName:string,schema:any){
  let response:Response;
  try{response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,instructions:prompt.instructions,input:prompt.input,text:{format:{type:'json_schema',name:schemaName,strict:true,schema}},max_output_tokens:OPENAI_MAX_OUTPUT_TOKENS}),signal:AbortSignal.timeout(180000)})}
  catch{await pool.query("INSERT INTO usage_calls(run_id,provider,model,cost_usd,status) VALUES($1,'openai',$2,NULL,'network_error')",[runId,model]);await recordExchange(runId,schemaName,model,prompt.instructions,prompt.input,null,'network_error');throw new Error('openai_network_error')}
  let body:any;try{body=await response.json()}catch{body={}}
  const usage=body.usage||{};
  const [inputPrice,outputPrice]=await Promise.all([setting('input_price_per_million'),setting('output_price_per_million')]);const priced=usage.input_tokens!=null&&usage.output_tokens!=null&&inputPrice!=null&&outputPrice!=null;const cost=priced?(Number(usage.input_tokens)*Number(inputPrice)+Number(usage.output_tokens)*Number(outputPrice))/1_000_000:null;
  await pool.query("INSERT INTO usage_calls(run_id,provider,model,input_tokens,output_tokens,cost_usd,status) VALUES($1,'openai',$2,$3,$4,$5,$6)",[runId,model,usage.input_tokens??null,usage.output_tokens??null,cost,response.ok?'succeeded':'http_'+response.status]);
  const raw=body.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==='output_text')?.text;
  await recordExchange(runId,schemaName,model,prompt.instructions,prompt.input,raw??(body.error?.message?String(body.error.message).slice(0,2000):null),response.ok?(body.status||'completed'):'http_'+response.status);
  if(!response.ok)throw new Error('openai_'+response.status);
  if(!raw||body.status==='incomplete')throw new Error('openai_incomplete');
  try{return JSON.parse(raw)}catch{throw new Error('openai_invalid_json')}
}
// Motor de agente (servicio cerebro, src/cerebro.ts). El agente lee el repositorio por su cuenta
// con las herramientas del Claude Agent SDK. Se usa cuando el ajuste review_engine es 'agent', o
// por defecto si CEREBRO_URL está configurado.
const CEREBRO_URL=process.env.CEREBRO_URL||'';
async function reviewEngine():Promise<'agent'|'openai'>{const chosen=await setting('review_engine');if(chosen==='agent'||chosen==='openai')return chosen;return CEREBRO_URL?'agent':'openai'}
async function callAgent(runId:string|null,schemaName:string,task:{checkout:any;model:string;instructions:string;input:string;schema:any;mode?:'review'|'profile';maxTurns?:number;timeoutMs?:number}){
  let response:Response;const timeoutMs=task.timeoutMs??600000;
  try{response=await fetch(CEREBRO_URL.replace(/\/$/,'')+'/tasks',{method:'POST',headers:{Authorization:'Bearer '+(process.env.CEREBRO_TOKEN||''),'Content-Type':'application/json'},body:JSON.stringify({mode:'review',maxTurns:40,...task,timeoutMs}),signal:AbortSignal.timeout(timeoutMs+60000)})}
  catch{throw new Error('cerebro_network_error')}
  const body:any=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error==='checkout_failed'?'cerebro_checkout_failed':'cerebro_'+response.status);
  // Por suscripción no se factura por consumo: el coste conocido es 0 y se marca en el modelo.
  const label=task.model+(body.subscription?' · suscripción':'');
  await pool.query("INSERT INTO usage_calls(run_id,provider,model,input_tokens,output_tokens,cost_usd,status) VALUES($1,'claude-agent',$2,$3,$4,$5,$6)",[runId,label,body.usage?.input_tokens??null,body.usage?.output_tokens??null,body.subscription?0:(body.costUsd??null),body.ok?'succeeded':(body.error||'agent_failed')]);
  await recordExchange(runId,schemaName,label,task.instructions,task.input,body.output?JSON.stringify(body.output,null,1):(body.text||null),body.ok?`completed · ${body.numTurns} turnos`:(body.error||'agent_failed'),body.toolCalls||[]);
  if(!body.ok||!body.output)throw new Error(body.error||'agent_no_output');
  return {output:body.output,toolCalls:(body.toolCalls||[]) as {tool:string;input:any}[]};
}
// Lee un fichero del repositorio en un commit concreto, hasta maxBytes. null si no existe o no se puede leer.
async function fetchRepoFile(repo:any,auth:string,commit:string,path:string,maxBytes:number):Promise<{text:string;truncated:boolean}|null>{
  const url='https://api.bitbucket.org/2.0/repositories/'+encodeURIComponent(repo.workspace)+'/'+encodeURIComponent(repo.slug)+'/src/'+encodeURIComponent(commit)+'/'+path.split('/').map(encodeURIComponent).join('/');
  try{
    const response=await fetch(url,{headers:{Authorization:auth},signal:AbortSignal.timeout(12000),redirect:'manual'});if(!response.ok)return null;
    const reader=response.body?.getReader();if(!reader)return null;
    const chunks:Uint8Array[]=[];let size=0,truncated=false;
    while(true){const part=await reader.read();if(part.done)break;chunks.push(part.value);size+=part.value.byteLength;if(size>maxBytes){truncated=true;await reader.cancel();break}}
    return {text:Buffer.concat(chunks).toString('utf8').slice(0,maxBytes),truncated};
  }catch{return null}
}

/* ---- Ficha del proyecto ----
   El agente estudia el repositorio entero (rama principal) y escribe una ficha que se añade a las
   instrucciones de cada revisión. Se guarda por versiones en project_profiles, se edita en el panel
   y, si está activado, Sancho la propone como PR con .sancho/proyecto.md. Si el equipo la cambia en
   el repositorio, esa versión se importa. */
const PROFILE_BRANCH='sancho/ficha-del-proyecto',PROFILE_PATH='.sancho/proyecto.md',PROFILE_MAX_AGE_DAYS=14;
const bbAuth=(conn:any)=>'Basic '+Buffer.from(conn.email+':'+decrypt(conn.secret)).toString('base64');
const bbRepoUrl=(repo:any)=>'https://api.bitbucket.org/2.0/repositories/'+encodeURIComponent(repo.workspace)+'/'+encodeURIComponent(repo.slug);
const contentHash=(text:string)=>crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n').trim()).digest('hex');
async function mainHead(repo:any,auth:string):Promise<{branch:string;hash:string}>{
  const r=await fetch(bbRepoUrl(repo),{headers:{Authorization:auth},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('bitbucket_'+r.status);
  const branch=String(((await r.json()) as any).mainbranch?.name||'main');
  const b=await fetch(bbRepoUrl(repo)+'/refs/branches/'+encodeURIComponent(branch),{headers:{Authorization:auth},signal:AbortSignal.timeout(20000)});if(!b.ok)throw new Error('bitbucket_'+b.status);
  return {branch,hash:String(((await b.json()) as any).target?.hash||'')};
}
const activeProfile=async(repoId:string)=>(await pool.query('SELECT * FROM project_profiles WHERE repository_id=$1 ORDER BY created_at DESC LIMIT 1',[repoId])).rows[0]||null;
async function profileJobPending(repoId:string){return (await pool.query("SELECT 1 FROM jobs WHERE kind='profile' AND status IN ('queued','running') AND payload->>'repo_id'=$1",[repoId])).rowCount!>0}
async function enqueueProfile(repoId:string,reason:string){if(!await profileJobPending(repoId))await pool.query("INSERT INTO jobs(kind,payload) VALUES('profile',$1)",[JSON.stringify({repo_id:repoId,reason})])}

// Propone la ficha como PR: un commit con .sancho/proyecto.md en la rama de Sancho y, si no hay ya
// una PR abierta desde esa rama, una PR nueva hacia la rama principal. Nunca la fusiona.
async function publishProfilePr(repo:any,auth:string,content:string):Promise<string|null>{
  const form=new FormData();
  form.append('message','Sancho: ficha del proyecto');form.append('branch',PROFILE_BRANCH);form.append(PROFILE_PATH,content.trim()+'\n');
  const commit=await fetch(bbRepoUrl(repo)+'/src',{method:'POST',headers:{Authorization:auth},body:form,signal:AbortSignal.timeout(30000)});
  if(!commit.ok)throw new Error('bitbucket_profile_commit_'+commit.status);
  const q=encodeURIComponent(`source.branch.name="${PROFILE_BRANCH}" AND state="OPEN"`);
  const open=await fetch(bbRepoUrl(repo)+'/pullrequests?q='+q,{headers:{Authorization:auth},signal:AbortSignal.timeout(20000)});
  const existing=open.ok?((await open.json()) as any).values?.[0]:null;
  if(existing)return existing.links?.html?.href||null;
  const {branch}=await mainHead(repo,auth);
  const created=await fetch(bbRepoUrl(repo)+'/pullrequests',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({
    title:'Sancho: ficha del proyecto',close_source_branch:true,source:{branch:{name:PROFILE_BRANCH}},destination:{branch:{name:branch}},
    description:'Sancho ha estudiado el repositorio y ha escrito esta ficha en `'+PROFILE_PATH+'`. La lee antes de cada revisión para entender cómo funciona el proyecto.\n\nRevísala y corrige lo que no sea cierto: puedes editarla aquí o en el panel de Sancho. Al fusionarla, el equipo podrá mantenerla junto al código; si la cambiáis en el repositorio, Sancho usará vuestra versión.'})});
  if(!created.ok)throw new Error('bitbucket_profile_pr_'+created.status);
  return ((await created.json()) as any).links?.html?.href||null;
}
async function saveProfile(repo:any,auth:string|null,content:string,data:{source:'agent'|'edited';commit?:string|null;summary?:string|null;userId?:string|null}){
  const row=(await pool.query('INSERT INTO project_profiles(repository_id,commit_sha,content,summary,source,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[repo.id,data.commit||null,content,data.summary||null,data.source,data.userId||null])).rows[0];
  let prUrl:string|null=null,prError:string|null=null;
  if(auth&&await setting('profile_publish_pr')!==false){try{prUrl=await publishProfilePr(repo,auth,content)}catch(e){prError=e instanceof Error?e.message:'pr_failed';console.error('profile_pr_failed',repo.id,prError)}}
  if(prUrl)await pool.query('UPDATE project_profiles SET pr_url=$1 WHERE id=$2',[prUrl,row.id]);
  return {id:row.id,prUrl,prError};
}
async function generateProfile(repo:any,reason:string){
  const conn=await setting('bitbucket_connection');if(!conn)throw new Error('bitbucket_not_configured');
  if(!CEREBRO_URL)throw new Error('cerebro_not_configured');
  const auth=bbAuth(conn),head=await mainHead(repo,auth),overrides=await activePrompts();
  const instructions=(overrides.ficha?.trim()?overrides.ficha:defaultPrompt('ficha')).trim();
  const input=['Repositorio: '+repo.workspace+'/'+repo.slug,'Rama principal: '+head.branch+' @ '+head.hash,'Motivo: '+reason,'','Estudia el repositorio y escribe su ficha.'].join('\n');
  const schema={type:'object',additionalProperties:false,properties:{ficha:{type:'string'},resumen:{type:'string'}},required:['ficha','resumen']};
  const r=await callAgent(null,'sancho_profile',{mode:'profile',checkout:{workspace:repo.workspace,slug:repo.slug,commit:head.hash,email:conn.email,token:decrypt(conn.secret)},model:String(await setting('agent_model')||'claude-opus-5-5'),instructions,input,schema,maxTurns:120,timeoutMs:1200000});
  const content=redactSecretsFromText(String(r.output.ficha||'')).text.slice(0,40000).trim();
  if(content.length<200)throw new Error('profile_too_short');
  return saveProfile(repo,auth,content,{source:'agent',commit:head.hash,summary:String(r.output.resumen||'').slice(0,500)});
}
// Ficha que usa una revisión. Si .sancho/proyecto.md de la rama de destino no coincide con ninguna
// versión conocida, es una edición del equipo en el repositorio: se importa y manda.
async function profileForReview(repo:any,auth:string,destCommit:string){
  const file=await fetchRepoFile(repo,auth,destCommit,PROFILE_PATH,40000);
  if(file?.text.trim()){
    const known=(await pool.query('SELECT content FROM project_profiles WHERE repository_id=$1',[repo.id])).rows.some(r=>contentHash(r.content)===contentHash(file.text));
    if(!known)await pool.query("INSERT INTO project_profiles(repository_id,commit_sha,content,summary,source) VALUES($1,$2,$3,'Importada de '||$4::text||' en el repositorio','edited')",[repo.id,destCommit,file.text.trim(),PROFILE_PATH]);
  }
  return activeProfile(repo.id);
}
async function profileJob(job:any){
  try{
    const repo=(await pool.query('SELECT * FROM repositories WHERE id=$1',[job.payload.repo_id])).rows[0];if(!repo){await pool.query("UPDATE jobs SET status='cancelled' WHERE id=$1",[job.id]);return}
    await generateProfile(repo,String(job.payload.reason||'actualización'));
    await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);
  }catch(e){const code=e instanceof Error?e.message:'profile_failed';if(job.attempts<2&&/network|_5\d\d|_429/.test(code)){await pool.query("UPDATE jobs SET status='queued',locked_at=NULL,run_after=now()+interval '5 minutes' WHERE id=$1",[job.id]);return}await pool.query("UPDATE jobs SET status='failed' WHERE id=$1",[job.id]);console.error('profile_failed',job.payload.repo_id,code)}
}

async function runReview(job:any){
  const {run_id,repo_id,number,publish}=job.payload;
  try{
    const repo=(await pool.query('SELECT * FROM repositories WHERE id=$1',[repo_id])).rows[0];if(!repo||!repo.active)throw new Error('repository_paused');
    const pr=(await pool.query('SELECT p.*,r.source_sha run_source_sha,r.destination_sha run_destination_sha FROM pull_requests p JOIN review_runs r ON r.pull_request_id=p.id WHERE r.id=$1',[run_id])).rows[0];if(!pr)throw new Error('pull_request_missing');
    let diff='',source='simulator',rawTruncated=false;
    if(repo.remote_uuid.startsWith('sim:'))diff="diff --git a/src/Example.php b/src/Example.php\n--- a/src/Example.php\n+++ b/src/Example.php\n@@ -1,0 +1,1 @@\n+public function show(Request $request, int $id): JsonResponse { return $this->json($this->repository->find($id)); }";
    else{
      const conn=await setting('bitbucket_connection');if(!conn)throw new Error('bitbucket_not_configured');const token=decrypt(conn.secret),auth='Basic '+Buffer.from(conn.email+':'+token).toString('base64');
      const endpoint='https://api.bitbucket.org/2.0/repositories/'+encodeURIComponent(repo.workspace)+'/'+encodeURIComponent(repo.slug)+'/pullrequests/'+number;
      const current=await fetch(endpoint,{headers:{Authorization:auth},signal:AbortSignal.timeout(20000)});if(!current.ok)throw new Error('bitbucket_'+current.status);const remote:any=await current.json();
      if(remote.state!=='OPEN'||remote.draft||remote.source?.commit?.hash!==pr.run_source_sha||remote.destination?.commit?.hash!==pr.run_destination_sha){await pool.query("UPDATE review_runs SET status='superseded',publication_status='stale',error_code='snapshot_changed',finished_at=now() WHERE id=$1",[run_id]);await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);return}
      const r=await fetch(endpoint+'/diff',{headers:{Authorization:auth},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('bitbucket_'+r.status);const rawDiff=await r.text();rawTruncated=Buffer.byteLength(rawDiff,'utf8')>350000;diff=rawDiff.slice(0,350000);source='bitbucket';
      const confirm=await fetch(endpoint,{headers:{Authorization:auth},signal:AbortSignal.timeout(20000)});if(!confirm.ok)throw new Error('bitbucket_'+confirm.status);const after:any=await confirm.json();if(after.source?.commit?.hash!==pr.run_source_sha||after.destination?.commit?.hash!==pr.run_destination_sha){await pool.query("UPDATE review_runs SET status='superseded',publication_status='stale',error_code='snapshot_changed',finished_at=now() WHERE id=$1",[run_id]);await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);return}
    }
    // Configuración del propio repositorio (.sancho.yml de la rama de destino) y ficha del proyecto.
    // La primera revisión de un repositorio con el agente genera la ficha antes de revisar.
    let repoCfg:{config:RepoConfig|null;error:string|null}={config:null,error:null},profile:any=null;const profileNotes:string[]=[];
    if(source==='bitbucket'){
      const auth=bbAuth(await setting('bitbucket_connection'));
      repoCfg=parseRepoConfig((await fetchRepoFile(repo,auth,pr.run_destination_sha,'.sancho.yml',20000))?.text??null);
      profile=await profileForReview(repo,auth,pr.run_destination_sha);
      if(!profile&&CEREBRO_URL&&await reviewEngine()==='agent'){
        try{await generateProfile(repo,'primera revisión del repositorio');profile=await activeProfile(repo.id)}
        catch(e){console.error('profile_failed',repo.id,e instanceof Error?e.message:'unknown');profileNotes.push('No se pudo generar la ficha del proyecto; esta revisión se ha hecho sin ella.')}
      }else if(profile?.source==='agent'&&Date.now()-new Date(profile.created_at).getTime()>PROFILE_MAX_AGE_DAYS*86400000)await enqueueProfile(repo.id,`la ficha tiene más de ${PROFILE_MAX_AGE_DAYS} días`);
    }
    const filtered=filterReviewDiff(diff,{...(repo.config||{}),exclusions:[...(await setting('review_exclusions')||[]),...(repo.config?.exclusions||[]),...(repoCfg.config?.excluir||[])]},60,65000);diff=filtered.diff;
    // Motor: el agente (cerebro) lee el repositorio por su cuenta; con OpenAI, Sancho reúne el contexto.
    const engine=source==='bitbucket'?await reviewEngine():'openai',agentMode=engine==='agent';
    const conn=source==='bitbucket'?await setting('bitbucket_connection'):null;
    let context:{text:string;files:{path:string;reason:string;truncated:boolean}[];redacted:number;partial:boolean}={text:'',files:[],redacted:0,partial:false};
    if(source==='bitbucket'&&!agentMode){const auth='Basic '+Buffer.from(conn.email+':'+decrypt(conn.secret)).toString('base64');context=await gatherContext(filtered.diff,(path,max)=>fetchRepoFile(repo,auth,pr.run_source_sha,path,max))}
    // Datos para el modelo: van en `input`, separados de las instrucciones y marcados como no confiables.
    const dataBlocks=['<pull_request>','Título: '+pr.title,'Repositorio: '+repo.workspace+'/'+repo.slug,'</pull_request>','','<diff>',annotateDiff(diff),'</diff>',...(agentMode?[]:['','<contexto>',context.text||'(sin ficheros de contexto)','</contexto>'])].join('\n');
    const rules={global:await setting('review_rules'),projectContext:repo.config?.context,repository:repo.config?.rules,profile:profile?.content,repoFileContext:repoCfg.config?.contexto,repoFileRules:rulesForFiles(repoCfg.config,changedFiles(diff))};
    const overrides=await activePrompts();
    const detectionInstructions=buildInstructions('deteccion',rules,agentMode,overrides),verificationInstructions=buildInstructions('verificacion',rules,agentMode,overrides);
    const openai=agentMode?null:await getSecret('openai_secret'),model=agentMode?String(await setting('agent_model')||'claude-opus-5-5'):await setting('model');let candidates:any[]=[],confirmed:any[]=[],summary='Análisis completado sin hallazgos confirmados.',walkthrough:string|null=null,changes:{path:string;summary:string}[]=[];
    const coverage:any={source,engine,files_considered:filtered.files,excluded_files:filtered.excluded,truncated:rawTruncated||filtered.truncated||context.partial,context_files:context.files.length,context_list:context.files,redacted_lines:filtered.redactedLines+context.redacted,project_code_executed:false,prompt_version:shortHash(detectionInstructions+verificationInstructions),limitations:[]};if(rawTruncated||filtered.truncated||context.partial)coverage.limitations.push('Se alcanzó un límite de tamaño o lectura; el análisis puede estar incompleto.');
    // Una pregunta al modelo, por el motor que toque. Devuelve la respuesta y, con el agente, qué herramientas usó.
    const agentCalls:{tool:string;input:any}[]=[];
    const ask=async(kind:string,instructions:string,input:string,schema:any)=>{
      if(!agentMode)return callOpenAI(model,openai!,{instructions,input},run_id,kind,schema);
      const r=await callAgent(run_id,kind,{checkout:{workspace:repo.workspace,slug:repo.slug,commit:pr.run_source_sha,email:conn.email,token:decrypt(conn.secret)},model,instructions,input,schema});
      agentCalls.push(...r.toolCalls);return r.output;
    };
    if(!diff){coverage.limitations.push('No hay archivos elegibles para revisar tras aplicar exclusiones y límites.')}
    else if(agentMode||(openai&&model)){
      const detectionSchema={type:'object',additionalProperties:false,required:['summary','walkthrough','changes','candidates'],properties:{summary:{type:'string'},walkthrough:{type:'string'},changes:{type:'array',items:{type:'object',additionalProperties:false,required:['path','summary'],properties:{path:{type:'string'},summary:{type:'string'}}}},candidates:{type:'array',items:{type:'object',additionalProperties:false,properties:{candidate_id:{type:'string'},path:{type:'string'},start_line:{type:'integer'},severity:{type:'string',enum:['medium','high','critical']},category:{type:'string',enum:['security','authorization','correctness','data_integrity','performance','compatibility','other']},title:{type:'string'},scenario:{type:'string'},impact:{type:'string'},evidence:{type:'string'},recommendation:{type:'string'},short_title:{type:'string'},short_impact:{type:'string'},short_fix:{type:'string'}},required:['candidate_id','path','start_line','severity','category','title','scenario','impact','evidence','recommendation','short_title','short_impact','short_fix']}}}};
      const verificationSchema={type:'object',additionalProperties:false,properties:{results:{type:'array',items:{type:'object',additionalProperties:false,properties:{candidate_id:{type:'string'},disposition:{type:'string',enum:['supported','rejected','insufficient_context']},severity:{type:'string',enum:['medium','high','critical']},reason:{type:'string'}},required:['candidate_id','disposition','severity','reason']}}},required:['results']};
      const detection=await ask('sancho_detection',detectionInstructions,dataBlocks,detectionSchema);
      summary=String(detection.summary||summary);
      walkthrough=clip(String(detection.walkthrough||''),1200)||null;
      changes=(Array.isArray(detection.changes)?detection.changes:[]).filter((c:any)=>c&&c.path&&c.summary).slice(0,25).map((c:any)=>({path:String(c.path).slice(0,300),summary:clip(String(c.summary),160)}));
      candidates=Array.isArray(detection.candidates)?detection.candidates.slice(0,40).map((f:any,i:number)=>({...f,candidate_id:'candidate-'+i})):[];
      if(candidates.length){
        const verify=await ask('sancho_verification',verificationInstructions,['<candidatos>',JSON.stringify(candidates,null,1),'</candidatos>','',dataBlocks].join('\n'),verificationSchema);
        // Solo se publican los confirmados, con la gravedad que da la verificación.
        const decisions=new Map<string,any>((verify.results||[]).map((x:any)=>[String(x.candidate_id),x]));
        confirmed=candidates.filter((f:any)=>decisions.get(String(f.candidate_id))?.disposition==='supported').map((f:any)=>({...f,severity:decisions.get(String(f.candidate_id)).severity||f.severity}));
      }
      if(agentMode){
        // Qué leyó el agente: los ficheros que abrió y cuántas búsquedas hizo.
        const read=[...new Set(agentCalls.filter(c=>c.tool==='Read'&&c.input?.file_path).map(c=>String(c.input.file_path)))];
        coverage.context_list=read.map(p=>({path:p,reason:'leído por el agente',truncated:false}));coverage.context_files=read.length;
        coverage.agent_searches=agentCalls.filter(c=>c.tool!=='Read').length;
      }
    }else{
      coverage.limitations.push('No se llamó a la IA. Configura en Ajustes el motor de revisión: el agente de Claude o una clave y un modelo de OpenAI.');
      if(source==='simulator')confirmed=[{candidate_id:'sim-auth-1',path:'src/Example.php',start_line:1,severity:'high',category:'authorization',title:'La consulta no verifica la propiedad del registro',scenario:'Un usuario autenticado puede cambiar el identificador solicitado y recibir un registro ajeno.',impact:'Exposición de datos de otra persona.',evidence:'find($id) recupera el registro sin política de acceso visible en el diff.',recommendation:'Aplicar la política de autorización antes de devolver el recurso.',short_title:'Registro ajeno accesible por su id',short_impact:'Un usuario autenticado puede leer registros de otras personas cambiando el id.',short_fix:'Aplica la política de autorización antes de devolver el registro.'}];

    }
    const min=String(repoCfg.config?.gravedad_minima||await setting('min_severity')||'medium'),rank:any={medium:1,high:2,critical:3};let accepted=0;
    // Qué ficha y qué .sancho.yml se han usado, para el detalle de la revisión.
    coverage.profile=profile?{source:profile.source,created_at:profile.created_at,commit:profile.commit_sha}:null;
    coverage.repo_config={found:!!repoCfg.config,error:repoCfg.error};
    if(repoCfg.error)coverage.limitations.push(repoCfg.error+' Se ha revisado sin él.');
    coverage.limitations.push(...profileNotes);
    for(const f of confirmed){const file=String(f.path||''),line=Number(f.start_line),safeFile=!!file&&!file.includes('..')&&!/vendor|node_modules|\.env|secret|credential/i.test(file);
      if(!safeFile||!['medium','high','critical'].includes(f.severity)||rank[f.severity]<rank[min]||!f.title||!f.evidence||!Number.isInteger(line)||line<1||(!repo.remote_uuid.startsWith('sim:')&&!addedLineExists(diff,file,line)))continue;
      const fp=findingFingerprint(repo.id,number,{path:file,category:String(f.category||'other'),title:String(f.title)});
      await pool.query("INSERT INTO findings(run_id,fingerprint,path,start_line,severity,category,title,scenario,impact,evidence,recommendation,verified,short_title,short_impact,short_fix) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13,$14) ON CONFLICT(run_id,fingerprint) DO NOTHING",[run_id,fp,file,line,f.severity,String(f.category||'other'),String(f.title).slice(0,300),String(f.scenario||'').slice(0,2000),String(f.impact||'').slice(0,1000),String(f.evidence).slice(0,2000),String(f.recommendation||'').slice(0,1000),f.short_title?clip(f.short_title,70):null,f.short_impact?clip(f.short_impact,160):null,f.short_fix?clip(f.short_fix,160):null]);accepted++}
    // Sin llamada a OpenAI (simulador) el resumen por defecto diría «sin hallazgos» aunque los haya.
    if(!candidates.length&&accepted)summary=accepted===1?'Se ha confirmado un problema.':`Se han confirmado ${accepted} problemas.`;
    const finalStatus=coverage.truncated||!diff?'partial':'completed';
    await pool.query('UPDATE review_runs SET status=$1,summary=$2,coverage=$3,model=$4,finished_at=now(),publication_status=$5,walkthrough=$7,changes=$8 WHERE id=$6',[finalStatus,summary,JSON.stringify({...coverage,findings_received:candidates.length,findings_accepted:accepted}),model||'simulator',publish?'pending':'not_requested',run_id,walkthrough,JSON.stringify(changes)]);
    await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);
    if(publish){const prRow=(await pool.query('SELECT pull_request_id FROM review_runs WHERE id=$1',[run_id])).rows[0];const opKey='summary:'+run_id;const ins=await pool.query("INSERT INTO publication_operations(run_id,op_key,operation,status,payload) VALUES($1,$2,'summary_update','pending',$3) ON CONFLICT(op_key) DO NOTHING RETURNING id",[run_id,opKey,JSON.stringify({run_id})]);const pending=await pool.query('SELECT f.id,f.fingerprint FROM findings f LEFT JOIN finding_threads t ON t.pull_request_id=$2 AND t.fingerprint=f.fingerprint WHERE f.run_id=$1 AND t.id IS NULL',[run_id,prRow.pull_request_id]);for(const f of pending.rows){await pool.query("INSERT INTO publication_operations(run_id,op_key,operation,status,payload) VALUES($1,$2,'inline_create','pending',$3) ON CONFLICT(op_key) DO NOTHING",[run_id,'finding:'+prRow.pull_request_id+':'+f.fingerprint,JSON.stringify({finding_id:f.id,fingerprint:f.fingerprint})])}if(ins.rows[0])await pool.query("INSERT INTO jobs(kind,payload) VALUES('publish',$1)",[JSON.stringify({run_id,operation_id:ins.rows[0].id})])}
  }catch(e){
    const code=e instanceof Error?e.message:'review_failed',transient=/network|^openai_(429|5\d\d)|^bitbucket_(429|5\d\d)$/.test(code);
    if(transient&&job.attempts<3){const delay=30*Math.pow(2,job.attempts-1);await pool.query("UPDATE jobs SET status='queued',locked_at=NULL,run_after=now()+($2*interval '1 second') WHERE id=$1",[job.id,delay]);await pool.query("UPDATE review_runs SET status='queued',error_code=$1 WHERE id=$2",[code.slice(0,100),run_id]);return}
    await pool.query("UPDATE review_runs SET status='failed',publication_status=CASE WHEN $1 THEN 'failed' ELSE publication_status END,error_code=$2,summary='No se pudo completar el análisis; no equivale a una revisión sin hallazgos.',finished_at=now() WHERE id=$3",[Boolean(publish),code.slice(0,100),run_id]);await pool.query("UPDATE jobs SET status='failed' WHERE id=$1",[job.id]);console.error('review_failed',run_id,code);
  }
}
async function publishRun(job:any){
  const runId=job.payload.run_id,client=await pool.connect();let lockKey='';
  try{
    const result=await client.query('SELECT r.id,r.status,r.source_sha,r.destination_sha,r.summary,r.coverage,r.walkthrough,r.changes,r.repository_id,r.pull_request_id,p.number,p.state,p.draft,p.url,p.summary_comment_id,repo.workspace,repo.slug,repo.active,repo.remote_uuid FROM review_runs r JOIN pull_requests p ON p.id=r.pull_request_id JOIN repositories repo ON repo.id=r.repository_id WHERE r.id=$1',[runId]);
    if(!result.rows[0])throw new Error('publication_run_missing');const row=result.rows[0];lockKey=row.repository_id+':'+row.number;await client.query('SELECT pg_advisory_lock(hashtext($1))',[lockKey]);
    if(!row.active||row.state!=='OPEN'||row.draft){await pool.query("UPDATE review_runs SET publication_status='stale' WHERE id=$1",[runId]);await pool.query("UPDATE publication_operations SET status='stale',updated_at=now() WHERE run_id=$1",[runId]);await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);return}
    if(row.remote_uuid.startsWith('sim:')){await pool.query("UPDATE review_runs SET publication_status='simulated' WHERE id=$1",[runId]);await pool.query("UPDATE publication_operations SET status='simulated',updated_at=now() WHERE run_id=$1",[runId]);await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);return}
    const conn=await setting('bitbucket_connection');if(!conn)throw new Error('bitbucket_not_configured');const token=decrypt(conn.secret),auth='Basic '+Buffer.from(conn.email+':'+token).toString('base64');
    const base='https://api.bitbucket.org/2.0/repositories/'+encodeURIComponent(row.workspace)+'/'+encodeURIComponent(row.slug)+'/pullrequests/'+row.number;
    const current=await fetch(base,{headers:{Authorization:auth},signal:AbortSignal.timeout(20000)});if(!current.ok)throw new Error('bitbucket_'+current.status);const remote:any=await current.json();
    if(remote.state!=='OPEN'||remote.draft||remote.source?.commit?.hash!==row.source_sha||remote.destination?.commit?.hash!==row.destination_sha){await pool.query("UPDATE review_runs SET status='superseded',publication_status='stale' WHERE id=$1",[runId]);await pool.query("UPDATE publication_operations SET status='stale',updated_at=now() WHERE run_id=$1",[runId]);await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);return}
    const findings=(await pool.query("SELECT id,fingerprint,severity,category,title,path,start_line,evidence,impact,recommendation,short_title,short_impact,short_fix FROM findings WHERE run_id=$1 AND verified=true ORDER BY CASE severity WHEN 'critical' THEN 3 WHEN 'high' THEN 2 ELSE 1 END DESC,path,start_line",[runId])).rows;
    // Los enlaces apuntan al panel; sin PUBLIC_BASE_URL, a la propia PR. Sus parámetros son la marca de los comentarios propios.
    const linkBase=process.env.PUBLIC_BASE_URL?process.env.PUBLIC_BASE_URL.replace(/\/$/,'')+'/':(row.url||'https://bitbucket.org/');
    const commentsUrl=base+'/comments';let remoteComments:any[]=[];let next=commentsUrl;
    for(let page=0;next&&page<10;page++){const r=await fetch(next,{headers:{Authorization:auth},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('bitbucket_'+r.status);const body:any=await r.json();remoteComments.push(...(body.values||[]));next=body.next||'';if(next&&!next.startsWith('https://api.bitbucket.org/2.0/'))throw new Error('bitbucket_pagination_origin')}
    for(const finding of findings.slice(0,8)){
      const thread=await pool.query('SELECT id,remote_comment_id FROM finding_threads WHERE pull_request_id=$1 AND fingerprint=$2',[row.pull_request_id,finding.fingerprint]);
      if(thread.rows[0]?.remote_comment_id)continue;
      // Acepta también la marca HTML de comentarios publicados con el formato anterior.
      const remoteMatch=remoteComments.find((x:any)=>{const text=String(x.content?.raw||'');return text.includes('sancho-finding='+finding.fingerprint)||text.includes('<!-- sancho-finding:'+finding.fingerprint+' -->')});
      let commentId=remoteMatch?.id?String(remoteMatch.id):null;
      if(!commentId){
        const check=await fetch(base,{headers:{Authorization:auth},signal:AbortSignal.timeout(20000)});if(!check.ok)throw new Error('bitbucket_'+check.status);const latest:any=await check.json();
        if(!row.active||latest.state!=='OPEN'||latest.draft||latest.source?.commit?.hash!==row.source_sha||latest.destination?.commit?.hash!==row.destination_sha){await pool.query("UPDATE review_runs SET status='superseded',publication_status='stale' WHERE id=$1",[runId]);await pool.query("UPDATE publication_operations SET status='stale',updated_at=now() WHERE run_id=$1",[runId]);await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);return}
        const raw=renderInlineComment(finding,sanchoLink(linkBase,{review:runId,'sancho-finding':finding.fingerprint}));
        const posted=await fetch(commentsUrl,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({content:{raw},inline:{path:finding.path,to:Number(finding.start_line)}}),signal:AbortSignal.timeout(20000)});
        if(!posted.ok)throw new Error('bitbucket_'+posted.status);const body:any=await posted.json();commentId=String(body.id);
        remoteComments.push({id:commentId,content:{raw}});
      }
      await pool.query("INSERT INTO finding_threads(pull_request_id,fingerprint,remote_comment_id,latest_run_id) VALUES($1,$2,$3,$4) ON CONFLICT(pull_request_id,fingerprint) DO UPDATE SET remote_comment_id=COALESCE(finding_threads.remote_comment_id,EXCLUDED.remote_comment_id),latest_run_id=EXCLUDED.latest_run_id,status='open',updated_at=now()",[row.pull_request_id,finding.fingerprint,commentId,runId]);
      await pool.query("UPDATE publication_operations SET status='published',remote_id=$2,error_code=NULL,updated_at=now() WHERE op_key=$1",['finding:'+row.pull_request_id+':'+finding.fingerprint,commentId]);
    }
    let existingId=row.summary_comment_id;
    if(!existingId){const hit=remoteComments.find((x:any)=>{const text=String(x.content?.raw||'');return text.includes('sancho-summary='+runId)||text.includes('<!-- sancho-summary:'+runId+' -->')});if(hit)existingId=String(hit.id)}
    const limitations:string[]=row.coverage?.limitations||[];
    const content=renderSummary({findings,walkthrough:row.walkthrough,changes:row.changes||[],filesReviewed:Number(row.coverage?.files_considered||0),commit:row.source_sha,partial:limitations.length?limitations.join(' '):null,reviewUrl:sanchoLink(linkBase,{review:runId,'sancho-summary':runId})});
    const check=await fetch(base,{headers:{Authorization:auth},signal:AbortSignal.timeout(20000)});if(!check.ok)throw new Error('bitbucket_'+check.status);const latest:any=await check.json();
    if(!row.active||latest.state!=='OPEN'||latest.draft||latest.source?.commit?.hash!==row.source_sha||latest.destination?.commit?.hash!==row.destination_sha){await pool.query("UPDATE review_runs SET status='superseded',publication_status='stale' WHERE id=$1",[runId]);await pool.query("UPDATE publication_operations SET status='stale',updated_at=now() WHERE run_id=$1",[runId]);await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);return}
    const response=await fetch(existingId?commentsUrl+'/'+encodeURIComponent(existingId):commentsUrl,{method:existingId?'PUT':'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({content:{raw:content}}),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('bitbucket_'+response.status);const posted:any=await response.json();const remoteId=String(posted.id||existingId);
    await pool.query('UPDATE pull_requests SET summary_comment_id=$1 WHERE id=$2',[remoteId,row.pull_request_id]);await pool.query("UPDATE review_runs SET publication_status='published' WHERE id=$1",[runId]);await pool.query("UPDATE publication_operations SET status='published',remote_id=COALESCE(remote_id,$2),error_code=NULL,updated_at=now() WHERE run_id=$1",[runId,remoteId]);await pool.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]);
  }catch(e){
    const code=e instanceof Error?e.message:'publication_failed';
    if(job.attempts<3){const delay=20*Math.pow(2,job.attempts-1);await pool.query("UPDATE jobs SET status='queued',locked_at=NULL,run_after=now()+($2*interval '1 second') WHERE id=$1",[job.id,delay]);await pool.query("UPDATE publication_operations SET status='pending',attempts=attempts+1,error_code=$1,updated_at=now() WHERE run_id=$2",[code.slice(0,100),runId]);return}
    await pool.query("UPDATE jobs SET status='failed' WHERE id=$1",[job.id]);await pool.query("UPDATE publication_operations SET status='failed',attempts=attempts+1,error_code=$1,updated_at=now() WHERE run_id=$2",[code.slice(0,100),runId]);await pool.query("UPDATE review_runs SET publication_status='partial' WHERE id=$1",[runId]);console.error('publication_failed',runId,code);
  }finally{if(lockKey)await client.query('SELECT pg_advisory_unlock(hashtext($1))',[lockKey]).catch(()=>{});client.release()}
}

async function start(){await migrate();if(process.env.WORKER_ONLY!=='true')app.listen(port,()=>console.log(`Sancho API listening on ${port}`));if(process.env.WORKER_ONLY==='true'||process.env.RUN_WORKER==='true')void worker()}
export {app,encrypt};
// Solo arranca al ejecutarse como programa; las pruebas importan app y processNextJob sin abrir puerto ni worker.
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)void start();
