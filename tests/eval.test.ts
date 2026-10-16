// Banco de pruebas: la puntuación y que cada caso etiquetado localiza su problema en el diff.
import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {expectedLines,score,type CaseFile,type Found} from '../src/eval.js';
import {filterReviewDiff} from '../src/domain.js';
import {gatherContext} from '../src/context.js';

const dir=path.resolve('evals/casos');
const cases=fs.readdirSync(dir).filter(n=>fs.existsSync(path.join(dir,n,'caso.json')));
const f=(over:Partial<Found>):Found=>({path:'a.php',start_line:10,category:'security',severity:'high',title:'t',...over});

describe('evaluation harness',()=>{
  it('counts a hit within the margin and with an expected type, once per expected problem',()=>{
    const expected=[{e:{fichero:'a.php',texto:'x',tipo:['security']},line:12}];
    expect(score([f({}),f({start_line:13})],expected)).toMatchObject({expected:1,hits:1,missed:[]});
    expect(score([f({}),f({start_line:13})],expected).extra).toHaveLength(1);
    expect(score([f({start_line:16})],expected)).toMatchObject({hits:0,missed:['a.php:12']});
    expect(score([f({category:'performance'})],expected).hits).toBe(0);
    expect(score([],expected,[f({})]).candidateHits).toBe(1);
  });
  it('has labelled cases, clean ones included, and each expected problem is on an added line',async()=>{
    expect(cases.length).toBeGreaterThanOrEqual(6);
    let clean=0;
    for(const name of cases){
      const caso:CaseFile=JSON.parse(fs.readFileSync(path.join(dir,name,'caso.json'),'utf8'));
      const diff=filterReviewDiff(fs.readFileSync(path.join(dir,name,'cambio.diff'),'utf8'),{},60,65000).diff;
      expect(diff,name).toContain('diff --git');
      expect(expectedLines(diff,caso.esperados).length).toBe(caso.esperados.length);
      if(!caso.esperados.length)clean++;
      // El contexto sale del repositorio del caso, como en el worker.
      const repo=path.join(dir,name,'repo');
      const ctx=await gatherContext(diff,async p=>fs.existsSync(path.join(repo,p))?{text:fs.readFileSync(path.join(repo,p),'utf8'),truncated:false}:null);
      expect(ctx.files.length,name).toBeGreaterThan(0);
    }
    expect(clean).toBeGreaterThanOrEqual(2);
  });
});
