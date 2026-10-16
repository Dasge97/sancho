import {describe,expect,it} from 'vitest';
import {findingFingerprint,hmacSha256,safeEqual,shouldReviewWebhook,webhookEventKey,renderSummary,addedLineExists,filterReviewDiff,redactSecretsFromText,normalizePullRequest,isSessionlessPath,shouldAutoPublish,renderInlineComment,sanchoLink,clip,cleanSuggestion,addedLineText} from '../src/domain.js';

describe('webhook security and idempotency contracts',()=>{
  it('authenticates the exact raw body and compares signatures safely',()=>{
    const body=Buffer.from('{"action":"created"}');
    const signature=hmacSha256('test-secret',body);
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(safeEqual(signature,hmacSha256('test-secret',body))).toBe(true);
    expect(safeEqual(signature,hmacSha256('test-secret',Buffer.from('{}')))).toBe(false);
    expect(hmacSha256("It's a Secret to Everybody",'Hello World!')).toBe('sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9');
  });
  it('deduplicates identical deliveries but separates event types',()=>{
    const body='{"id":1}';
    expect(webhookEventKey('pullrequest:updated',body)).toBe(webhookEventKey('pullrequest:updated',body));
    expect(webhookEventKey('pullrequest:updated',body)).not.toBe(webhookEventKey('pullrequest:created',body));
  });
  it('only schedules open, prepared pull request events with fixed commits',()=>{
    const payload={pullrequest:{state:'OPEN',draft:false,source:{commit:{hash:'a'}},destination:{commit:{hash:'b'}}}};
    expect(shouldReviewWebhook('pullrequest:updated',payload)).toBe(true);
    expect(shouldReviewWebhook('pullrequest:updated',{pullrequest:{...payload.pullrequest,draft:true}})).toBe(false);
    expect(shouldReviewWebhook('repo:push',payload)).toBe(false);
  });
  it('makes finding fingerprints stable across whitespace and case changes in titles',()=>{
    expect(findingFingerprint('repo',4,{path:'src/A.php',category:'auth',title:'Missing owner check'})).toBe(findingFingerprint('repo',4,{path:'src/A.php',category:'auth',title:'missing owner check'}));
  });
  it('accepts only changed line locations in a diff',()=>{
    const diff='diff --git a/src/A.php b/src/A.php\n--- a/src/A.php\n+++ b/src/A.php\n@@ -2,1 +2,2 @@\n existing\n+new line';
    expect(addedLineExists(diff,'src/A.php',3)).toBe(true);
    expect(addedLineExists(diff,'src/A.php',2)).toBe(false);
    expect(addedLineExists(diff,'../secret.php',3)).toBe(false);
  });
  it('filters excluded files and redacts secrets before provider input',()=>{
    const input='diff --git a/.env b/.env\n+API_KEY="this-is-a-private-value"\ndiff --git a/src/A.php b/src/A.php\n+password="this-is-another-secret"';
    const filtered=filterReviewDiff(input,{});
    expect(filtered.diff).not.toContain('.env');
    expect(filtered.diff).not.toContain('this-is-another-secret');
    expect(filtered.redactedLines).toBe(1);
    const clean=redactSecretsFromText('token="12345678901234567890"');
    expect(clean.text).not.toContain('12345678901234567890');
  });
  const finding={severity:'high',title:'Inyección SQL mediante el parámetro de búsqueda en el controlador',path:'app/Http/Controllers/InvoiceController.php',start_line:28,impact:'Permite eludir el filtro. Texto largo que solo va al panel.',recommendation:'Usar parámetros enlazados. Más detalle.',short_title:'Inyección SQL en la búsqueda',short_impact:'q va tal cual al SQL; se leen facturas ajenas.',short_fix:'Usa parámetros enlazados.'};
  it('renders short inline comments with the marker hidden in the detail link',()=>{
    const link=sanchoLink('https://sancho.test/',{review:'run-1','sancho-finding':'abc'});
    const raw=renderInlineComment({...finding,category:'security'},link);
    expect(raw).toBe([
      '| 🟠 **Alto** | Seguridad · `InvoiceController.php:28` |','| --- | --- |',
      '| **Problema** | Inyección SQL en la búsqueda |','| **Por qué importa** | q va tal cual al SQL; se leen facturas ajenas. |','| **Arreglo** | Usa parámetros enlazados. |',
      '','**[🔍 Ver detalle](https://sancho.test/?review=run-1&sancho-finding=abc)** &nbsp;·&nbsp; **[👍 Me ha servido](https://sancho.test/?review=run-1&sancho-finding=abc&votar=util)** &nbsp;·&nbsp; **[👎 Es un falso positivo](https://sancho.test/?review=run-1&sancho-finding=abc&votar=falso)**',
    ].join('\n'));
    expect(raw).not.toContain('<!--');
    // Hallazgos anteriores sin campos cortos: primera frase de los textos largos.
    const old=renderInlineComment({...finding,short_title:null,short_impact:null,short_fix:null},link);
    expect(old).toContain('| **Por qué importa** | Permite eludir el filtro. |');
    expect(old).toContain('| **Arreglo** | Usar parámetros enlazados. |');
    // Una barra vertical en el texto no rompe la tabla.
    expect(renderInlineComment({...finding,short_fix:'Usa a | b.'},link)).toContain('| **Arreglo** | Usa a \\| b. |');
  });
  it('renders the summary as an index without repeating comment bodies',()=>{
    const summary=renderSummary({findings:[finding,{...finding,severity:'medium',short_title:'Otro',start_line:40}],filesReviewed:2,commit:'abcdef1234',partial:null,reviewUrl:'https://sancho.test/?review=run-1&sancho-summary=run-1'});
    expect(summary).toBe([
      '### Sancho · 2 problemas por revisar','','| 🔴 Críticos | 🟠 Altos | 🟡 Medios | ✅ Resueltos |','| :---: | :---: | :---: | :---: |','| 0 | **1** | **1** | 0 |','',
      '1. 🟠 **Inyección SQL en la búsqueda** · `InvoiceController.php:28`','2. 🟡 **Otro** · `InvoiceController.php:40`','',
      '<sub>2 ficheros revisados · commit `abcdef1` · [Ver la revisión completa](https://sancho.test/?review=run-1&sancho-summary=run-1)</sub>',
    ].join('\n'));
    expect(summary).not.toContain('eludir');
    expect(renderSummary({findings:[],filesReviewed:1,commit:'abcdef1',partial:'Límite de tamaño alcanzado.',reviewUrl:'https://s.test/'})).toBe('### Sancho · sin problemas encontrados\n\n⚠️ Revisión parcial: Límite de tamaño alcanzado.\n\n<sub>1 fichero revisado · commit `abcdef1` · [Ver la revisión completa](https://s.test/)</sub>');
    // Sin problemas pendientes pero con comentarios ya arreglados: el contador lo dice.
    expect(renderSummary({findings:[],resolved:2,filesReviewed:1,commit:'abcdef1',partial:null,reviewUrl:'https://s.test/'})).toContain('| 0 | 0 | 0 | **2** |');
    const many=Array.from({length:10},(_,i)=>({...finding,start_line:i+1}));
    expect(renderSummary({findings:many,filesReviewed:1,commit:'abcdef1',partial:null,reviewUrl:'https://s.test/'})).toContain('| 0 | **10** | 0 | 0 |');
    expect(renderSummary({findings:many,filesReviewed:1,commit:'abcdef1',partial:null,reviewUrl:'https://s.test/'})).toContain('Y 2 más en el panel.');
  });
  it('clips long model text to one line without cutting words',()=>{
    expect(clip('uno dos\ntres',50)).toBe('uno dos tres');
    expect(clip('palabra '.repeat(20),30)).toBe('palabra palabra palabra…');
    expect(clip('palabra '.repeat(20),30).length).toBeLessThanOrEqual(30);
  });
});

describe('Bitbucket Cloud payloads and publication policy',()=>{
  // Forma reducida de GET /2.0/repositories/{ws}/{repo}/pullrequests/{id} y del campo pullrequest de los webhooks.
  const bitbucketPr={id:42,title:'Añade endpoint',state:'OPEN',draft:false,author:{display_name:'Ana'},source:{commit:{hash:'abc123'}},destination:{commit:{hash:'def456'}},links:{html:{href:'https://bitbucket.org/ws/repo/pull-requests/42'}}};
  it('reads the pull request number from Bitbucket id',()=>{
    const pr=normalizePullRequest(bitbucketPr);
    expect(pr).toMatchObject({number:42,title:'Añade endpoint',author:'Ana',source_sha:'abc123',destination_sha:'def456',state:'OPEN',draft:false});
    expect(normalizePullRequest({number:7,source_sha:'s',destination_sha:'d',author:'Equipo'}).number).toBe(7);
    expect(normalizePullRequest({title:'sin número'}).number).toBeNull();
  });
  it('exempts only webhooks and health checks from session and CSRF',()=>{
    expect(isSessionlessPath('/api/webhooks/bitbucket/1')).toBe(true);
    expect(isSessionlessPath('/health/ready')).toBe(true);
    expect(isSessionlessPath('/api/users')).toBe(false);
    expect(isSessionlessPath('/api/auth/login')).toBe(false);
  });
  it('publishes automatic reviews only when auto_publish is explicitly enabled',()=>{
    const open={state:'OPEN',draft:false};
    expect(shouldAutoPublish(undefined,open)).toBe(false);
    expect(shouldAutoPublish(false,open)).toBe(false);
    expect(shouldAutoPublish(true,open)).toBe(true);
    expect(shouldAutoPublish(true,{state:'OPEN',draft:true})).toBe(false);
    expect(shouldAutoPublish(true,{state:'MERGED',draft:false})).toBe(false);
  });
});

describe('PR summary with walkthrough and changes',()=>{
  it('explains the PR and lists the changes per file before the problems',()=>{
    const summary=renderSummary({findings:[],filesReviewed:2,commit:'abcdef1234',partial:null,reviewUrl:'https://s.test/',walkthrough:'Añade la búsqueda de facturas.',changes:[{path:'app/A.php',summary:'Nuevo método search | con filtro.'},{path:'routes/web.php',summary:'Ruta /invoices/search.'}]});
    expect(summary.startsWith('### Sancho · sin problemas encontrados\n\n**Qué hace esta PR.** Añade la búsqueda de facturas.')).toBe(true);
    expect(summary).toContain('| Fichero | Qué cambia |');
    expect(summary).toContain('| `app/A.php` | Nuevo método search \\| con filtro. |');
    const many=Array.from({length:18},(_,i)=>({path:`f${i}.php`,summary:'Cambio.'}));
    expect(renderSummary({findings:[],filesReviewed:18,commit:'abcdef1',partial:null,reviewUrl:'https://s.test/',changes:many})).toContain('Y 3 ficheros más en el panel.');
  });
});

describe('code suggestions',()=>{
  const diff='diff --git a/app/A.php b/app/A.php\n--- a/app/A.php\n+++ b/app/A.php\n@@ -1,2 +1,3 @@\n <?php\n+    return $this->json($repo->find($id));\r\n // fin\n';
  it('reads the text of an added line and nothing else',()=>{
    expect(addedLineText(diff,'app/A.php',2)).toBe('    return $this->json($repo->find($id));');
    expect(addedLineText(diff,'app/A.php',1)).toBeNull();
    expect(addedLineText(diff,'app/B.php',2)).toBeNull();
  });
  it('keeps a real change with its indentation and drops fences, no-ops and long or nested blocks',()=>{
    const fix='    $invoice = $repo->find($id);\n    $this->authorize(\'view\', $invoice);\n    return $this->json($invoice);';
    expect(cleanSuggestion(diff,'app/A.php',2,fix)).toBe(fix);
    expect(cleanSuggestion(diff,'app/A.php',2,'```php\n'+fix+'\n```')).toBe(fix);
    expect(cleanSuggestion(diff,'app/A.php',2,'return $this->json($repo->find($id));')).toBeNull();
    expect(cleanSuggestion(diff,'app/A.php',2,'')).toBeNull();
    expect(cleanSuggestion(diff,'app/A.php',2,'a\n```\nb')).toBeNull();
    expect(cleanSuggestion(diff,'app/A.php',2,Array(16).fill('x();').join('\n'))).toBeNull();
    expect(cleanSuggestion(diff,'app/A.php',1,fix)).toBeNull();
    expect(cleanSuggestion(diff,'app/A.php',2,undefined)).toBeNull();
  });
  it('adds the suggestion block at the end of the inline comment',()=>{
    const raw=renderInlineComment({severity:'high',title:'T',path:'app/A.php',start_line:2,impact:'I',recommendation:'R',suggestion:'    return 1;'},'https://sancho.test/#/x');
    // La sugerencia va justo después de la tabla, antes de los enlaces.
    expect(raw).toContain('| **Arreglo** | R |\n\n```suggestion\n    return 1;\n```\n\n**[🔍 Ver detalle]');
  });
});
