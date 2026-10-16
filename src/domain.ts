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

export type PublishedFinding={severity:string;title:string;path:string;start_line:number|null;impact:string;recommendation:string;short_title?:string|null;short_impact?:string|null;short_fix?:string|null};

// Recorta a un máximo de caracteres, en una sola línea y sin partir palabras.
export function clip(text:string,max:number):string {
  const flat=String(text||'').replace(/\s+/g,' ').trim();
  if(flat.length<=max)return flat;
  const cut=flat.slice(0,max-1),space=cut.lastIndexOf(' ');
  return (space>max*0.6?cut.slice(0,space):cut).replace(/[\s.,;:]+$/,'')+'…';
}
function firstSentence(text:string):string {const m=String(text||'').match(/^.+?[.!?](?=\s|$)/s);return m?m[0]:String(text||'')}
const SEVERITY_ICON:Record<string,string>={critical:'🔴',high:'🔴',medium:'🟠'};
const SEVERITY_WORD:Record<string,[string,string]>={critical:['crítico','críticos'],high:['alto','altos'],medium:['medio','medios']};
const code=(text:string)=>'`'+text+'`';

// Textos cortos del comentario. Un hallazgo sin campos cortos (anterior a este formato) usa la primera frase de los largos.
export function shortFinding(f:PublishedFinding){
  return {title:clip(f.short_title||f.title,70),impact:clip(f.short_impact||firstSentence(f.impact),160),fix:clip(f.short_fix||firstSentence(f.recommendation),160)};
}

// Enlace al panel. Sus parámetros sirven también de marca para reconocer los comentarios propios sin mostrar texto extra.
export function sanchoLink(base:string,params:Record<string,string>):string {
  const url=new URL(base);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);return url.toString();
}

export function renderInlineComment(f:PublishedFinding,detailUrl:string):string {
  const s=shortFinding(f);
  return `${SEVERITY_ICON[f.severity]||'🟠'} **${s.title}**\n\n${s.impact}\n\n**Arreglo:** ${s.fix} · [Detalle](${detailUrl})`;
}

// Resumen de la PR: índice de hallazgos (ordenados por gravedad, máximo `limit`), sin repetir el texto de los comentarios en línea.
export function renderSummary(input:{findings:PublishedFinding[];limit?:number;filesReviewed:number;commit:string;partial:string|null;reviewUrl:string}):string {
  const all=input.findings,total=all.length,findings=all.slice(0,input.limit??8),hiddenCount=total-findings.length;
  const counts=['critical','high','medium'].map(sev=>{const n=all.filter(x=>x.severity===sev).length;return n?`${n} ${SEVERITY_WORD[sev][n===1?0:1]}`:''}).filter(Boolean).join(', ');
  const footer=`${input.filesReviewed} ${input.filesReviewed===1?'fichero revisado':'ficheros revisados'} · commit ${code(input.commit.slice(0,7))} · [Ver revisión completa](${input.reviewUrl})`;
  const partial=input.partial?`\n\n⚠️ Revisión parcial: ${clip(input.partial,160)}`:'';
  if(!total)return `**Sancho · sin problemas encontrados**${partial}\n\n${footer}`;
  const list=findings.map((f,i)=>`${i+1}. ${SEVERITY_ICON[f.severity]||'🟠'} ${shortFinding(f).title} · ${code((f.path.split('/').pop()||f.path)+(f.start_line?':'+f.start_line:''))}`).join('\n');
  const more=hiddenCount?`\n\nY ${hiddenCount} más en el panel.`:'';
  return `**Sancho · ${total} ${total===1?'problema':'problemas'}**${counts?` (${counts})`:''}\n\n${list}${more}${partial}\n\n${footer}`;
}

export function shouldReviewWebhook(event:string, payload:any):boolean {
  if(event==='pullrequest:created'||event==='pullrequest:updated') return Boolean(payload?.pullrequest && payload.pullrequest.state==='OPEN' && !payload.pullrequest.draft && payload.pullrequest.source?.commit?.hash && payload.pullrequest.destination?.commit?.hash);
  return false;
}

export function addedLineExists(diff:string,file:string,line:number):boolean {
  if(!file||file.startsWith('/')||file.split('/').includes('..')||!Number.isInteger(line)||line<1)return false;
  const sections=diff.split(/^diff --git /m).slice(1);
  for(const section of sections){
    const header=section.slice(0,section.indexOf('\n'));
    if(!header.includes(' b/'+file))continue;
    let current=0;
    for(const row of section.split('\n')){
      const hunk=row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if(hunk){current=Number(hunk[1]);continue}
      if(row.startsWith('+')&&!row.startsWith('+++')){if(current===line)return true;current++}
      else if(row.startsWith(' '))current++;
    }
  }
  return false;
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
