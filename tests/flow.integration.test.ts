// Recorrido webhook → revisión → publicación contra PostgreSQL real, con Bitbucket y OpenAI simulados en fetch.
// Se ejecuta solo con TEST_DATABASE_URL apuntando a una base de datos desechable: borra sus tablas.
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import crypto from 'node:crypto';
import type {Server} from 'node:http';

const databaseUrl=process.env.TEST_DATABASE_URL;
const BB='https://api.bitbucket.org/2.0/repositories/ws/repo';
const WEBHOOK_SECRET='webhook-secret-for-tests';
const diff='diff --git a/src/Controller.php b/src/Controller.php\n--- a/src/Controller.php\n+++ b/src/Controller.php\n@@ -1,2 +1,3 @@\n <?php\n+return $this->json($repo->find($id));\n // fin\n';

describe.skipIf(!databaseUrl)('Bitbucket flow against PostgreSQL',()=>{
  let server:Server,base='',pool:any,processNextJob:()=>Promise<boolean>,repoId='';
  const realFetch=globalThis.fetch;
  const remote:Record<number,any>={};
  const calls:{method:string,url:string,body?:any}[]=[];
  let openaiFails=false,commentId=100;
  // Ficheros .sancho del repositorio simulado (los demás ficheros devuelven PHP de ejemplo).
  const repoFiles:Record<string,string>={};
  // Respuesta de detección que fija una prueba (por ejemplo, el seguimiento de comentarios).
  let detectionOverride:any=null;
  const PROFILE_TEXT='# Ficha de api-facturas\n\n## Autenticación y permisos\n\nLas facturas se protegen con InvoicePolicy; cada factura pertenece a un usuario.\n\n'+'Detalle del proyecto. '.repeat(20);

  const pr=(id:number,source:string)=>({id,title:`PR ${id}`,state:'OPEN',draft:false,author:{display_name:'Ana'},source:{commit:{hash:source}},destination:{commit:{hash:'dest-1'}},links:{html:{href:`https://bitbucket.org/ws/repo/pull-requests/${id}`}}});
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  const openaiResponse=(value:unknown)=>json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:1000,output_tokens:200}});

  async function fakeFetch(input:any,init:any={}){
    const url=String(input),method=init.method||'GET';
    if(url.startsWith(base))return realFetch(input,init);
    calls.push({method,url,body:typeof init.body==='string'?JSON.parse(init.body):init.body instanceof FormData?Object.fromEntries(init.body):undefined});
    if(url==='http://cerebro.test/tasks'){
      // El cerebro simulado: el agente "lee" la política y responde con el esquema pedido.
      const task=JSON.parse(init.body);
      if(task.mode==='profile')return json({ok:true,output:{ficha:PROFILE_TEXT,resumen:'API de facturas en Laravel.'},text:'',numTurns:30,costUsd:0.5,usage:{input_tokens:90000,output_tokens:4000},subscription:true,toolCalls:[{tool:'Read',input:{file_path:'composer.json'}}]});
      const verification=task.instructions.includes('escéptico');
      const output=verification?{results:[{candidate_id:'candidate-0',disposition:'supported',severity:'high',reason:'La política existe pero no se aplica.'}]}:{summary:'Un hallazgo.',candidates:[{candidate_id:'x',path:'src/Controller.php',start_line:2,severity:'high',category:'authorization',title:'Factura ajena accesible por id',scenario:'Cambia el id.',impact:'Lee datos ajenos.',evidence:'find($id) sin authorize; la política InvoicePolicy existe.',recommendation:'Aplicar la política.',short_title:'Factura ajena accesible por id',short_impact:'Un usuario lee facturas de otros cambiando el id.',short_fix:'Llama a `authorize` antes de devolverla.'}]};
      return json({ok:true,output,text:'',numTurns:4,costUsd:0.12,usage:{input_tokens:5000,output_tokens:600},subscription:true,toolCalls:[{tool:'Grep',input:{pattern:'InvoicePolicy'}},{tool:'Read',input:{file_path:'app/Policies/InvoicePolicy.php'}}]});
    }
    if(url==='https://api.openai.com/v1/responses'){
      if(openaiFails)return json({error:{message:'bad request'}},400);
      const body=JSON.parse(init.body);
      if(body.text.format.name==='sancho_detection'&&detectionOverride)return openaiResponse(detectionOverride);
      if(body.text.format.name==='sancho_detection')return openaiResponse({summary:'Un hallazgo.',walkthrough:'Añade la búsqueda de facturas.',changes:[{path:'src/Controller.php',summary:'Devuelve la factura por id.'}],candidates:[{candidate_id:'x',path:'src/Controller.php',start_line:2,severity:'high',category:'authorization',title:'Falta comprobar la propiedad del registro',scenario:'Un usuario cambia el id.',impact:'Lee datos ajenos.',evidence:'find($id) sin política.',recommendation:'Aplicar la política.',short_title:'Factura ajena accesible por id',short_impact:'Un usuario lee facturas de otros cambiando el id.',short_fix:'Llama a `authorize` antes de devolverla.'}]});
      return openaiResponse({results:[{candidate_id:'candidate-0',disposition:'supported',severity:'critical',reason:'Visible en el diff.'}]});
    }
    // Repositorio, rama principal y la PR de la ficha que abre Sancho.
    if(url===BB&&method==='GET')return json({mainbranch:{name:'main'}});
    if(url===BB+'/refs/branches/main')return json({target:{hash:'mainhead123'}});
    if(url.startsWith(BB+'/diffstat/'))return json({values:[{new:{path:'src/Controller.php'},status:'modified'}]});
    if(url===BB+'/src'&&method==='POST')return new Response('',{status:201});
    if(url.startsWith(BB+'/pullrequests?q='))return json({values:[]});
    if(url===BB+'/pullrequests'&&method==='POST')return json({id:99,links:{html:{href:'https://bitbucket.org/ws/repo/pull-requests/99'}}},201);
    const prMatch=url.match(/\/pullrequests\/(\d+)(\/.*)?$/);
    if(prMatch){
      const current=remote[Number(prMatch[1])],rest=prMatch[2]||'';
      if(!current)return json({},404);
      if(rest==='')return json(current);
      if(rest==='/diff')return new Response(diff,{status:200});
      if(rest==='/comments'&&method==='GET')return json({values:[]});
      if(rest.startsWith('/comments'))return json({id:++commentId});
    }
    if(url.startsWith(BB+'/pullrequests?'))return json({values:Object.values(remote)});
    if(url.startsWith(BB+'/src/')){
      const path=decodeURIComponent(url.replace(/^.*\/src\/[^/]+\//,''));
      if(path in repoFiles)return new Response(repoFiles[path],{status:200});
      if(path.startsWith('.sancho'))return json({error:'not found'},404);
      return new Response('<?php\nreturn $this->json($repo->find($id));\n',{status:200});
    }
    return json({error:'unexpected '+url},500);
  }

  async function sendWebhook(event:string,payload:unknown,secret=WEBHOOK_SECRET){
    const body=JSON.stringify(payload);
    const signature='sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex');
    return realFetch(`${base}/api/webhooks/bitbucket/${repoId}`,{method:'POST',headers:{'content-type':'application/json','x-event-key':event,'x-hub-signature':signature},body});
  }
  async function drainQueue(){while(await processNextJob()){}}

  beforeAll(async()=>{
    process.env.DATABASE_URL=databaseUrl;
    process.env.SANCHO_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
    process.env.SESSION_SECRET='test-session-secret';
    process.env.CEREBRO_URL='http://cerebro.test';
    process.env.CEREBRO_TOKEN='cerebro-test-token';
    vi.stubGlobal('fetch',fakeFetch);
    const db=await import('../src/db.js');pool=db.pool;await db.migrate();
    const mod=await import('../src/server.js');processNextJob=mod.processNextJob;
    await new Promise<void>(resolve=>{server=mod.app.listen(0,'127.0.0.1',()=>resolve())});
    const address=server.address();base=`http://127.0.0.1:${typeof address==='object'&&address?address.port:0}`;
    await pool.query('TRUNCATE users,sessions,settings,repositories,webhook_events,jobs,usage_calls,audit_events CASCADE');
    const enc=mod.encrypt;
    await pool.query("INSERT INTO settings(key,value) VALUES('bitbucket_connection',$1),('openai_secret',$2),('model',$3),('review_rules',$4),('review_engine',$5)",[JSON.stringify({workspace:'ws',email:'bot@example.org',secret:enc('bitbucket-token')}),JSON.stringify(enc('sk-test-key-not-real-000000')),JSON.stringify('test-model'),JSON.stringify('No comentes los seeders.'),JSON.stringify('openai')]);
    repoId=(await pool.query("INSERT INTO repositories(remote_uuid,workspace,slug,name,active,webhook_secret) VALUES('{repo-uuid}','ws','repo','repo',true,$1) RETURNING id",[JSON.stringify(enc(WEBHOOK_SECRET))])).rows[0].id;
  });
  afterAll(async()=>{vi.unstubAllGlobals();await new Promise(resolve=>server?.close(resolve));await pool?.end()});
  beforeEach(()=>{calls.length=0;openaiFails=false});

  it('accepts a signed webhook without session or CSRF token and stores the Bitbucket PR id as its number',async()=>{
    remote[42]=pr(42,'src-1');
    const response=await sendWebhook('pullrequest:created',{pullrequest:remote[42]});
    expect(response.status).toBe(202);
    const row=(await pool.query('SELECT p.number,r.publication_status FROM review_runs r JOIN pull_requests p ON p.id=r.pull_request_id')).rows;
    expect(row).toEqual([{number:42,publication_status:'not_requested'}]);
    expect(Number((await pool.query('SELECT count(*) FROM sessions')).rows[0].count)).toBe(0);
  });

  it('rejects a bad signature and ignores a duplicate delivery',async()=>{
    expect((await sendWebhook('pullrequest:created',{pullrequest:remote[42]},'wrong-secret')).status).toBe(401);
    expect(await (await sendWebhook('pullrequest:created',{pullrequest:remote[42]})).json()).toEqual({duplicate:true});
  });

  it('reviews with OpenAI and keeps the result in the panel while auto_publish is off',async()=>{
    await drainQueue();
    const run=(await pool.query("SELECT status,publication_status FROM review_runs")).rows[0];
    expect(run).toEqual({status:'completed',publication_status:'not_requested'});
    expect(Number((await pool.query('SELECT count(*) FROM findings')).rows[0].count)).toBe(1);
    expect(Number((await pool.query("SELECT count(*) FROM usage_calls WHERE status='succeeded'")).rows[0].count)).toBe(2);
    // Lo que llega a OpenAI: instrucciones versionadas con las reglas del equipo, y los datos aparte, con líneas numeradas.
    const detection=calls.find(c=>c.body?.text?.format?.name==='sancho_detection')!;
    expect(detection.body.instructions).toContain('Eres Sancho');
    expect(detection.body.instructions).toContain('No comentes los seeders.');
    expect(detection.body.input).toContain('+L2| return $this->json($repo->find($id));');
    expect(detection.body.input).toContain('=== Fichero: src/Controller.php · cambiado en la PR ===');
    expect(detection.body.input).not.toContain('Eres Sancho');
    // La gravedad que publica es la de la verificación, y el intercambio queda registrado.
    expect((await pool.query('SELECT severity FROM findings')).rows[0].severity).toBe('critical');
    expect((await pool.query('SELECT kind FROM ai_exchanges ORDER BY created_at')).rows.map((r:any)=>r.kind)).toEqual(['sancho_detection','sancho_verification']);
    expect(calls.filter(c=>c.method!=='GET'&&c.url.includes('bitbucket'))).toEqual([]);
  });

  it('publishes inline and summary comments when auto_publish is on, without approve or merge calls',async()=>{
    await pool.query("INSERT INTO settings(key,value) VALUES('auto_publish','true')");
    remote[42]=pr(42,'src-2');
    expect((await sendWebhook('pullrequest:updated',{pullrequest:remote[42]})).status).toBe(202);
    await drainQueue();
    const posts=calls.filter(c=>c.method==='POST'&&c.url.endsWith('/pullrequests/42/comments'));
    expect(posts).toHaveLength(2);
    expect(posts[0].body.inline).toEqual({path:'src/Controller.php',to:2});
    expect(posts[0].body.content.raw.startsWith('🔴 **Factura ajena accesible por id**')).toBe(true);
    expect(posts[0].body.content.raw).toContain('sancho-finding=');
    expect(posts[1].body.content.raw).toContain('sancho-summary=');
    expect(posts[1].body.content.raw).toContain('**Qué hace esta PR.** Añade la búsqueda de facturas.');
    expect(posts[1].body.content.raw).toContain('| `src/Controller.php` | Devuelve la factura por id. |');
    expect(posts.map(p=>p.body.content.raw).join('')).not.toContain('<!--');
    expect(calls.some(c=>/\/(approve|merge|request-changes|decline)\b/.test(c.url))).toBe(false);
    const latest=(await pool.query("SELECT publication_status FROM review_runs WHERE source_sha='src-2'")).rows[0];
    expect(latest.publication_status).toBe('published');
  });

  it('does not re-run a failed review on reconciliation, so a persistent error does not repeat cost',async()=>{
    openaiFails=true;remote[43]=pr(43,'src-43');
    await sendWebhook('pullrequest:created',{pullrequest:remote[43]});
    await drainQueue();
    expect((await pool.query("SELECT r.status FROM review_runs r JOIN pull_requests p ON p.id=r.pull_request_id WHERE p.number=43")).rows).toEqual([{status:'failed'}]);
    const openaiCalls=calls.filter(c=>c.url.includes('openai')).length;
    await pool.query("INSERT INTO jobs(kind,payload) VALUES('reconcile',$1)",[JSON.stringify({repo_id:repoId})]);
    await drainQueue();
    expect(Number((await pool.query("SELECT count(*) FROM review_runs r JOIN pull_requests p ON p.id=r.pull_request_id WHERE p.number=43")).rows[0].count)).toBe(1);
    expect(calls.filter(c=>c.url.includes('openai')).length).toBe(openaiCalls);
  });

  it('reviews with the agent engine: the agent gets the repository checkout, the diff without fixed context and the agent instructions',async()=>{
    await pool.query("INSERT INTO settings(key,value) VALUES('review_engine','\"agent\"') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value");
    openaiFails=false;remote[44]=pr(44,'abc44');
    await sendWebhook('pullrequest:created',{pullrequest:remote[44]});
    await drainQueue();
    const tasks=calls.filter(c=>c.url==='http://cerebro.test/tasks');
    // Primera revisión del repositorio con el agente: antes de revisar, estudia el proyecto y escribe la ficha.
    expect(tasks).toHaveLength(3);
    expect(tasks[0].body.mode).toBe('profile');
    expect(tasks[0].body.checkout.commit).toBe('mainhead123');
    expect(tasks[0].body.instructions).toContain('ficha del proyecto');
    const commit=calls.find(c=>c.url===BB+'/src'&&c.method==='POST')!;
    expect(commit.body.branch).toBe('sancho/ficha-del-proyecto');
    expect(commit.body['.sancho/proyecto.md']).toContain('# Ficha de api-facturas');
    const prCreated=calls.find(c=>c.url===BB+'/pullrequests'&&c.method==='POST')!;
    expect(prCreated.body).toMatchObject({source:{branch:{name:'sancho/ficha-del-proyecto'}},destination:{branch:{name:'main'}},close_source_branch:true});
    expect((await pool.query('SELECT source,commit_sha,pr_url FROM project_profiles')).rows).toEqual([{source:'agent',commit_sha:'mainhead123',pr_url:'https://bitbucket.org/ws/repo/pull-requests/99'}]);
    expect(calls.some(c=>c.url==='https://api.openai.com/v1/responses')).toBe(false);
    const detection=tasks[1].body;
    expect(detection.instructions).toContain('## Ficha del proyecto');
    expect(detection.instructions).toContain('Las facturas se protegen con InvoicePolicy');
    expect(detection.checkout).toEqual({workspace:'ws',slug:'repo',commit:'abc44',email:'bot@example.org',token:'bitbucket-token'});
    expect(detection.model).toBe('claude-opus-5-5');
    expect(detection.instructions).toContain('tienes el repositorio completo');
    expect(detection.instructions).toContain('No comentes los seeders.');
    expect(detection.input).toContain('+L2| return $this->json($repo->find($id));');
    expect(detection.input).not.toContain('<contexto>');
    // Sin lista fija de ficheros: Sancho no lee código del repositorio por su cuenta.
    expect(calls.filter(c=>c.url.includes('/src/abc44/'))).toEqual([]);
    const run=(await pool.query("SELECT r.status,r.coverage FROM review_runs r JOIN pull_requests p ON p.id=r.pull_request_id WHERE p.number=44")).rows[0];
    expect(run.status).toBe('completed');
    expect(run.coverage.engine).toBe('agent');
    expect(run.coverage.context_list).toEqual([{path:'app/Policies/InvoicePolicy.php',reason:'leído por el agente',truncated:false}]);
    expect(run.coverage.agent_searches).toBe(2);
    const usage=(await pool.query("SELECT provider,model,cost_usd FROM usage_calls WHERE provider='claude-agent'")).rows;
    expect(usage).toHaveLength(3);
    expect(usage[0]).toMatchObject({model:'claude-opus-5-5 · suscripción',cost_usd:'0'});
    const exchange=(await pool.query("SELECT tools FROM ai_exchanges WHERE model LIKE 'claude-opus-5-5%' ORDER BY created_at LIMIT 1")).rows[0];
    expect(exchange.tools[1]).toEqual({tool:'Read',input:{file_path:'app/Policies/InvoicePolicy.php'}});
  });

  it('sends the agent the instructions edited in the dashboard',async()=>{
    await pool.query("INSERT INTO prompt_versions(name,content) VALUES('agente','Explora solo la carpeta app/ y lee las políticas antes de opinar.')");
    calls.length=0;remote[45]=pr(45,'abc45');
    await sendWebhook('pullrequest:created',{pullrequest:remote[45]});
    await drainQueue();
    const detection=calls.find(c=>c.url==='http://cerebro.test/tasks')!.body;
    expect(detection.instructions).toContain('Explora solo la carpeta app/ y lee las políticas antes de opinar.');
    expect(detection.instructions).not.toContain('tienes el repositorio completo');
    expect(detection.instructions).toContain('Eres Sancho');
    // Con la ficha ya escrita, no se vuelve a estudiar el repositorio.
    expect(calls.filter(c=>c.url==='http://cerebro.test/tasks').map(c=>c.body.mode)).toEqual(['review','review']);
  });

  it('applies the .sancho.yml of the destination branch and skips the pull requests that Sancho opens',async()=>{
    repoFiles['.sancho.yml']='reglas: |\n  Regla general del yml.\nrutas:\n  - ruta: "src/**"\n    reglas: "Regla solo para src."\n  - ruta: "docs/**"\n    reglas: "Regla que no aplica."\ngravedad_minima: critical\n';
    calls.length=0;remote[46]=pr(46,'abc46');
    await sendWebhook('pullrequest:created',{pullrequest:remote[46]});
    await drainQueue();
    const detection=calls.find(c=>c.url==='http://cerebro.test/tasks')!.body;
    expect(detection.instructions).toContain('Regla general del yml.');
    expect(detection.instructions).toContain('Regla solo para src.');
    expect(detection.instructions).not.toContain('Regla que no aplica.');
    // gravedad_minima: critical descarta el hallazgo alto que confirma la verificación.
    expect(Number((await pool.query("SELECT count(*) FROM findings f JOIN review_runs r ON r.id=f.run_id JOIN pull_requests p ON p.id=r.pull_request_id WHERE p.number=46")).rows[0].count)).toBe(0);
    delete repoFiles['.sancho.yml'];
    const own={...pr(47,'abc47'),source:{branch:{name:'sancho/ficha-del-proyecto'},commit:{hash:'abc47'}}};
    expect((await sendWebhook('pullrequest:created',{pullrequest:own})).status).toBe(202);
    expect(Number((await pool.query('SELECT count(*) FROM pull_requests WHERE number=47')).rows[0].count)).toBe(0);
  });

  it('follows up on open comments and closes in Bitbucket the ones a new commit fixes',async()=>{
    await pool.query("UPDATE settings SET value='\"openai\"' WHERE key='review_engine'");
    const thread=(await pool.query("SELECT t.remote_comment_id FROM finding_threads t JOIN pull_requests p ON p.id=t.pull_request_id WHERE p.number=42 AND t.status='open'")).rows[0];
    expect(thread.remote_comment_id).toBeTruthy();
    detectionOverride={summary:'Corregido.',walkthrough:'Aplica la política.',changes:[],candidates:[],follow_up:[{id:'abierto-1',status:'fixed',reason:'Ahora llama a authorize antes de devolver la factura.'}]};
    calls.length=0;remote[42]=pr(42,'src-3');
    await sendWebhook('pullrequest:updated',{pullrequest:remote[42]});
    await drainQueue();
    detectionOverride=null;
    const detection=calls.find(c=>c.url==='https://api.openai.com/v1/responses')!.body;
    expect(detection.input).toContain('<cambios_desde_la_ultima_revision commit_anterior="src-2">');
    expect(detection.input).toContain('"id": "abierto-1"');
    const reply=calls.find(c=>c.method==='POST'&&c.url.endsWith('/pullrequests/42/comments')&&c.body?.parent)!;
    expect(reply.body.parent).toEqual({id:Number(thread.remote_comment_id)});
    expect(reply.body.content.raw).toContain('Resuelto');
    expect(calls.some(c=>c.method==='POST'&&c.url.endsWith(`/comments/${thread.remote_comment_id}/resolve`))).toBe(true);
    expect((await pool.query("SELECT t.status FROM finding_threads t JOIN pull_requests p ON p.id=t.pull_request_id WHERE p.number=42")).rows[0].status).toBe('resolved');
  });
});
