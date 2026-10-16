// Análisis estático: lectura del diff, traducción de los informes y `php -l` con el PHP local si existe.
import {describe,expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {addedLines,gitleaksFindings,parsePhpLint,runGitleaks,runPhpLint} from '../src/static-analysis.js';

const diff=[
  'diff --git a/app/Http/Pay.php b/app/Http/Pay.php',
  '--- a/app/Http/Pay.php',
  '+++ b/app/Http/Pay.php',
  '@@ -1,3 +1,4 @@',
  ' <?php',
  '+$key = "sk_live_example";',
  ' if ($a) {',
  '+  if ($b {',
  'diff --git a/new.php b/new.php',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/new.php',
  '@@ -0,0 +1,2 @@',
  '+<?php',
  '++++ esto empieza por tres signos',
  'diff --git a/old.php b/old.php',
  '--- a/old.php',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-<?php',
].join('\n');

describe('static analysis',()=>{
  it('reads the added lines of each file with their new line numbers',()=>{
    const files=addedLines(diff);
    expect(files.map(f=>[f.path,f.created,f.deleted])).toEqual([['app/Http/Pay.php',false,false],['new.php',true,false],['old.php',false,true]]);
    expect(files[0].lines).toEqual([{line:2,text:'$key = "sk_live_example";'},{line:4,text:'  if ($b {'}]);
    expect(files[1].lines.map(l=>l.line)).toEqual([1,2]);
  });
  it('maps gitleaks results back to file and line, once per line, without the secret value',()=>{
    const map=[{path:'a.php',line:10},{path:'b.php',line:3}];
    const out=gitleaksFindings([{RuleID:'stripe-access-token',Description:'Stripe key',StartLine:2,Secret:'REDACTED'},{RuleID:'generic-api-key',StartLine:2},{RuleID:'x',StartLine:9}],map);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({path:'b.php',line:3,severity:'critical',category:'security',title:'Secreto escrito en el código (stripe-access-token)'});
    expect(out[0].evidence).toContain('«Stripe key»');
    expect(JSON.stringify(out)).not.toContain('REDACTED');
  });
  it('parses the php -l error message and line',()=>{
    expect(parsePhpLint('\nParse error: syntax error, unexpected token "{" in Standard input code on line 3\nErrors parsing Standard input code')).toEqual({message:'syntax error, unexpected token "{"',line:3});
    expect(parsePhpLint('No syntax errors detected in Standard input code')).toBeNull();
  });
  it('reports a missing tool instead of failing the review',async()=>{
    expect((await runGitleaks(addedLines(diff),'sancho-no-existe-gitleaks')).run.status).toBe('unavailable');
    expect((await runPhpLint(addedLines(diff),async()=>({text:'<?php',truncated:false}),async()=>null,'sancho-no-existe-php')).run.status).toBe('unavailable');
  });
  const php=process.env.PHP_BIN||'php',hasPhp=spawnSync(php,['-v']).status===0;
  it.skipIf(!hasPhp)('flags a PHP file that stops compiling, and not one that already failed on the destination branch',async()=>{
    const broken='<?php\n$key = 1;\nif ($a) {\n  if ($b {\n}\n',fine='<?php\necho 1;\n';
    const files=addedLines(diff).filter(f=>f.path==='app/Http/Pay.php');
    const now=await runPhpLint(files,async()=>({text:broken,truncated:false}),async()=>({text:fine,truncated:false}),php);
    expect(now.run).toMatchObject({status:'ok',files:1,findings:1});
    expect(now.findings[0]).toMatchObject({path:'app/Http/Pay.php',line:4,severity:'high',category:'correctness'});
    const before=await runPhpLint(files,async()=>({text:broken,truncated:false}),async()=>({text:broken,truncated:false}),php);
    expect(before.findings).toEqual([]);
    expect(before.run.note).toContain('ya no compilaban');
  });
});
