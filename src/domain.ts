import crypto from 'node:crypto';

export function hmacSha256(secret: string, body: Buffer | string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function webhookEventKey(event: string, body: Buffer | string): string {
  return crypto.createHash('sha256').update(event).update(':').update(body).digest('hex');
}

export function findingFingerprint(repositoryId: string, prNumber: number, finding: {path:string;category:string;title:string}): string {
  const title = finding.title.toLowerCase().replace(/\W+/g, ' ').trim();
  return crypto.createHash('sha256').update(`${repositoryId}:${prNumber}:${finding.path}:${finding.category}:${title}`).digest('hex');
}

export type PublishedFinding={severity:string;title:string;path:string;start_line:number|null;impact:string;recommendation:string;short_title?:string|null;short_impact?:string|null;short_fix?:string|null;suggestion?:string|null;category?:string|null};

// Recorta a un máximo de caracteres, en una sola línea y sin partir palabras.
export function clip(text:string,max:number):string {
  const flat=String(text||'').replace(/\s+/g,' ').trim();
  if(flat.length<=max)return flat;
  const cut=flat.slice(0,max-1),space=cut.lastIndexOf(' ');
  return (space>max*0.6?cut.slice(0,space):cut).replace(/[\s.,;:]+$/,'')+'…';
}
function firstSentence(text:string):string {const m=String(text||'').match(/^.+?[.!?](?=\s|$)/s);return m?m[0]:String(text||'')}
const code=(text:string)=>'`'+text+'`';

// Textos cortos del comentario. Un hallazgo sin campos cortos (anterior a este formato) usa la primera frase de los largos.
export function shortFinding(f:PublishedFinding){
  return {title:clip(f.short_title||f.title,70),impact:clip(f.short_impact||firstSentence(f.impact),160),fix:clip(f.short_fix||firstSentence(f.recommendation),160)};
}

// Enlace al panel. Sus parámetros sirven también de marca para reconocer los comentarios propios sin mostrar texto extra.
export function sanchoLink(base:string,params:Record<string,string>):string {
  const url=new URL(base);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);return url.toString();
}

// Formato de los comentarios (formato B): gravedad con su color, una tabla con el problema, por qué
// importa y el arreglo, la sugerencia de código y tres enlaces al panel (detalle y los dos votos).
const SEVERITY_LABEL:Record<string,[string,string,string]>={critical:['🔴','Crítico','Críticos'],high:['🟠','Alto','Altos'],medium:['🟡','Medio','Medios'],low:['🔵','Menor','Menores']};
const CATEGORY_LABEL:Record<string,string>={security:'Seguridad',authorization:'Autorización',correctness:'Funcionamiento',data_integrity:'Integridad de datos',performance:'Rendimiento',compatibility:'Compatibilidad',other:'Otro'};
// Una celda de tabla en una línea y sin barras verticales sueltas.
const cell=(t:string)=>String(t||'').replace(/\|/g,'\\|').replace(/\s+/g,' ').trim();

export function renderInlineComment(f:PublishedFinding,detailUrl:string):string {
  const s=shortFinding(f),[icon,word]=SEVERITY_LABEL[f.severity]||SEVERITY_LABEL.medium;
  const where=code((f.path.split('/').pop()||f.path)+(f.start_line?':'+f.start_line:''));
  const vote=(v:string)=>{const u=new URL(detailUrl);u.searchParams.set('votar',v);return u.toString()};
  const table=[`| ${icon} **${word}** | ${cell(CATEGORY_LABEL[f.category||'']||'Problema')} · ${where} |`,'| --- | --- |',
    `| **Problema** | ${cell(s.title)} |`,`| **Por qué importa** | ${cell(s.impact)} |`,`| **Arreglo** | ${cell(s.fix)} |`].join('\n');
  // Con sugerencia, Bitbucket muestra el cambio propuesto sobre la línea comentada.
  const suggestion=f.suggestion?`\n\n\`\`\`suggestion\n${f.suggestion}\n\`\`\``:'';
  const links=`**[🔍 Ver detalle](${detailUrl})** &nbsp;·&nbsp; **[👍 Me ha servido](${vote('util')})** &nbsp;·&nbsp; **[👎 Es un falso positivo](${vote('falso')})**`;
  return `${table}${suggestion}\n\n${links}`;
}

// Tabla de cambios por fichero del resumen (como mucho `limit` filas). Las barras verticales del
// texto se escapan para no romper la tabla de Markdown.
function changesTable(changes:{path:string;summary:string}[],limit=15):string {
  if(!changes.length)return '';
  const cell=(t:string)=>t.replace(/\|/g,'\\|').replace(/\s+/g,' ').trim();
  const rows=changes.slice(0,limit).map(c=>`| ${code(cell(c.path))} | ${cell(c.summary)} |`).join('\n');
  const more=changes.length>limit?`\n\nY ${changes.length-limit} ficheros más en el panel.`:'';
  return `| Fichero | Qué cambia |\n| --- | --- |\n${rows}${more}`;
}

// Resumen de la PR: qué hace, qué cambia por fichero y el índice de problemas (ordenados por
// gravedad, máximo `limit`), sin repetir el texto de los comentarios en línea.
export function renderSummary(input:{findings:PublishedFinding[];limit?:number;filesReviewed:number;commit:string;partial:string|null;reviewUrl:string;walkthrough?:string|null;changes?:{path:string;summary:string}[];resolved?:number}):string {
  const all=input.findings,total=all.length,findings=all.slice(0,input.limit??8),hiddenCount=total-findings.length,resolved=input.resolved||0;
  const footer=`<sub>${input.filesReviewed} ${input.filesReviewed===1?'fichero revisado':'ficheros revisados'} · commit ${code(input.commit.slice(0,7))} · [Ver la revisión completa](${input.reviewUrl})</sub>`;
  const partial=input.partial?`\n\n⚠️ Revisión parcial: ${clip(input.partial,160)}`:'';
  const about=[input.walkthrough?.trim()?`**Qué hace esta PR.** ${input.walkthrough.trim()}`:'',changesTable(input.changes||[])].filter(Boolean).join('\n\n');
  const aboutBlock=about?`\n\n${about}`:'';
  // Contador por gravedad, y cuántos comentarios anteriores se han arreglado ya en la PR.
  const n=(sev:string)=>all.filter(x=>x.severity===sev).length;
  // La columna de detalles menores solo sale con el perfil exigente, cuando los hay.
  const cols:[string,number][]=[['🔴 Críticos',n('critical')],['🟠 Altos',n('high')],['🟡 Medios',n('medium')],...(n('low')?[['🔵 Menores',n('low')] as [string,number]]:[]),['✅ Resueltos',resolved]];
  const counter=total||resolved?`\n\n| ${cols.map(c=>c[0]).join(' | ')} |\n| ${cols.map(()=>':---:').join(' | ')} |\n| ${cols.map(c=>c[1]?`**${c[1]}**`:'0').join(' | ')} |`:'';
  if(!total)return `### Sancho · sin problemas encontrados${counter}${aboutBlock}${partial}\n\n${footer}`;
  const list=findings.map((f,i)=>`${i+1}. ${(SEVERITY_LABEL[f.severity]||SEVERITY_LABEL.medium)[0]} **${shortFinding(f).title}** · ${code((f.path.split('/').pop()||f.path)+(f.start_line?':'+f.start_line:''))}`).join('\n');
  const more=hiddenCount?`\n\nY ${hiddenCount} más en el panel.`:'';
  return `### Sancho · ${total} ${total===1?'problema':'problemas'} por revisar${counter}${aboutBlock}\n\n${list}${more}${partial}\n\n${footer}`;
}

export function shouldReviewWebhook(event:string, payload:any):boolean {
  if(event==='pullrequest:created'||event==='pullrequest:updated') return Boolean(payload?.pullrequest && payload.pullrequest.state==='OPEN' && !payload.pullrequest.draft && payload.pullrequest.source?.commit?.hash && payload.pullrequest.destination?.commit?.hash);
  return false;
}

export const addedLineExists=(diff:string,file:string,line:number):boolean=>addedLineText(diff,file,line)!==null;

// Sugerencia de código para la línea comentada: el texto que la sustituye. Se descarta si no cambia
// nada, si es larga o si trae bloques de código que romperían el comentario.
export function cleanSuggestion(diff:string,file:string,line:number,raw:unknown):string|null {
  const original=addedLineText(diff,file,line);
  if(original===null||typeof raw!=='string')return null;
  const text=raw.replace(/\r\n/g,'\n').replace(/^\s*```[a-z]*\n/i,'').replace(/\n```\s*$/,'').replace(/\s+$/,'');
  if(!text.trim()||text.includes('```')||text.length>1500||text.split('\n').length>15)return null;
  if(text.trim()===original.trim())return null;
  return text;
}

// Texto de una línea añadida del diff (sin el «+»), o null si esa línea no es una línea añadida.
export function addedLineText(diff:string,file:string,line:number):string|null {
  if(!file||file.startsWith('/')||file.split('/').includes('..')||!Number.isInteger(line)||line<1)return null;
  const sections=diff.split(/^diff --git /m).slice(1);
  for(const section of sections){
    const header=section.slice(0,section.indexOf('\n'));
    if(!header.includes(' b/'+file))continue;
    let current=0;
    for(const row of section.split('\n')){
      const hunk=row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if(hunk){current=Number(hunk[1]);continue}
      if(row.startsWith('+')&&!row.startsWith('+++')){if(current===line)return row.slice(1).replace(/\r$/,'');current++}
      else if(row.startsWith(' '))current++;
    }
  }
  return null;
}

export function filterReviewDiff(diff:string,config:Record<string,unknown>={},maxFiles=60,maxBytes=90000){
  const sections=diff.split(/^diff --git /m).slice(1),excluded:string[]=[],included:string[]=[];let bytes=0,truncated=false,redactedLines=0;
  const patterns=Array.isArray(config.exclusions)?config.exclusions.filter((x):x is string=>typeof x==='string'&&x.length<250):[];
  const excludedPath=(path:string)=>{
    const p=path.replace(/^b\//,'').replace(/^a\//,'').toLowerCase(),base=p.split('/').pop()||p;
    if(/(^|\/)(vendor|node_modules|\.git|dist|build|coverage|cache|storage\/logs)(\/|$)/.test(p)||/^\.env(?:\.|$)/.test(base)||/\.(pem|key|p12|pfx|keystore)$/.test(base)||base==='id_rsa')return true;
    return patterns.some(pattern=>{const normalized=pattern.replace(/^\//,'').replace(/\/$/,'');if(!normalized)return false;if(normalized.endsWith('/**'))return p.startsWith(normalized.slice(0,-2));const regex='^'+normalized.split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$';try{return new RegExp(regex,'i').test(p)}catch{return false}});
  };
  for(const section of sections){
    const header=section.slice(0,section.indexOf('\n')),match=header.match(/ b\/(.+)$/);if(!match)continue;const file=match[1];
    if(excludedPath(file)){excluded.push(file);continue}
    if(included.length>=maxFiles){truncated=true;excluded.push(file);continue}
    const redacted=redactDiffSection(section);redactedLines+=redacted.redacted;
    const piece='diff --git '+redacted.text;
    if(bytes+Buffer.byteLength(piece,'utf8')>maxBytes){truncated=true;excluded.push(file);continue}
    included.push(piece);bytes+=Buffer.byteLength(piece,'utf8');
  }
  return {diff:included.join('\n'),files:included.length,excluded,redactedLines,truncated};
}

function redactDiffSection(section:string){
  let privateKey=false,redacted=0;
  const text=section.split('\n').map(line=>{
    if(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(line)){privateKey=true;redacted++;return line[0]==='+'?'+[REDACTED PRIVATE KEY]':'[REDACTED PRIVATE KEY]'}
    if(privateKey){if(/-----END [A-Z0-9 ]*PRIVATE KEY-----/.test(line))privateKey=false;if(line.startsWith('+')&&!line.startsWith('+++')){redacted++;return '+[REDACTED PRIVATE KEY]'}return line}
    const added=line.startsWith('+')&&!line.startsWith('+++'),content=added?line.slice(1):line;
    const sensitive=/(?:api[_-]?key|access[_-]?token|\btoken|client[_-]?secret|password|passwd|secret)\s*[:=]\s*['"][^'"]{8,}['"]|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9_-]{24,}\b/i.test(content);
    if(sensitive){redacted++;return added?'+[REDACTED SECRET]':'[REDACTED SECRET]'}return line;
  }).join('\n');
  return {text,redacted};
}

export function redactSecretsFromText(text:string){
  let privateKey=false,redacted=0;
  const value=text.split('\n').map(line=>{
    if(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(line)){privateKey=true;redacted++;return '[REDACTED PRIVATE KEY]'}
    if(privateKey){if(/-----END [A-Z0-9 ]*PRIVATE KEY-----/.test(line))privateKey=false;redacted++;return '[REDACTED PRIVATE KEY]'}
    if(/(?:api[_-]?key|access[_-]?token|\btoken|client[_-]?secret|password|passwd|secret)\s*[:=]\s*['"][^'"]{8,}['"]|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9_-]{24,}\b/i.test(line)){redacted++;return '[REDACTED SECRET]'}return line;
  }).join('\n');
  return {text:value,redacted};
}

// Bitbucket Cloud identifica la PR con `id`; las filas locales y el simulador usan `number`.
export function normalizePullRequest(pr:any){
  const number=Number(pr?.number??pr?.id);
  return {
    number:Number.isInteger(number)&&number>0?number:null,
    title:String(pr?.title||`PR #${number}`),
    author:String(pr?.author?.display_name||pr?.author||'desconocido'),
    source_sha:pr?.source?.commit?.hash||pr?.source_sha||null,
    source_branch:String(pr?.source?.branch?.name||''),
    destination_sha:pr?.destination?.commit?.hash||pr?.destination_sha||null,
    state:String(pr?.state||'OPEN'),
    draft:Boolean(pr?.draft),
    url:String(pr?.links?.html?.href||pr?.url||'')
  };
}

// Rutas que no llevan sesión ni token CSRF: las llama Bitbucket o un balanceador, no el panel.
export function isSessionlessPath(path:string):boolean {
  return path.startsWith('/api/webhooks/')||path.startsWith('/health/');
}

// Las revisiones automáticas (webhook o reconciliación) solo publican si un administrador activó auto_publish.
export function shouldAutoPublish(autoPublish:unknown,pr:{state:string;draft:boolean}):boolean {
  return autoPublish===true&&pr.state==='OPEN'&&!pr.draft;
}
