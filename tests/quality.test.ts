// Calidad: cómo cuenta cada problema según los votos y lo que pasó con su comentario.
import {describe,expect,it} from 'vitest';
import {qualityReport,verdict,type IssueRow} from '../src/quality.js';

const row=(over:Partial<IssueRow>):IssueRow=>({repository:'api',category:'security',severity:'high',origin:'modelo',prompt_version:'v1',engine:'openai',first_seen:'2026-10-01T10:00:00Z',useful:false,false_positive:false,thread_status:'open',fixed_by_commit:false,...over});

describe('review quality',()=>{
  it('reads the verdict from votes first and from the comment thread after',()=>{
    expect(verdict(row({useful:true}))).toBe('useful');
    expect(verdict(row({thread_status:'resolved',fixed_by_commit:true}))).toBe('useful');
    expect(verdict(row({thread_status:'dismissed'}))).toBe('false_positive');
    expect(verdict(row({false_positive:true,thread_status:'resolved'}))).toBe('false_positive');
    expect(verdict(row({useful:true,thread_status:'dismissed'}))).toBe('useful');
    expect(verdict(row({useful:true,false_positive:true}))).toBe('split');
    expect(verdict(row({}))).toBe('none');
  });
  it('groups by category, origin and prompt version, newest version first',()=>{
    const r=qualityReport([
      row({useful:true}),row({thread_status:'resolved',fixed_by_commit:true}),row({false_positive:true,category:'correctness'}),
      row({origin:'gitleaks',prompt_version:'v2',first_seen:'2026-10-10T10:00:00Z',useful:true}),row({thread_status:'dismissed',prompt_version:'v2',first_seen:'2026-10-11T10:00:00Z'}),
    ]);
    expect(r.totals).toMatchObject({issues:5,useful:3,false_positive:2,no_signal:0,precision:0.6,fixed_by_commit:1,withdrawn:1,open:3});
    expect(r.by_category.map(g=>[g.key,g.issues])).toEqual([['security',4],['correctness',1]]);
    expect(r.by_origin.find(g=>g.key==='gitleaks')).toMatchObject({issues:1,useful:1,precision:1});
    expect(r.by_prompt.map(g=>[g.key,g.issues,g.first_seen])).toEqual([['v2',2,'2026-10-10T10:00:00.000Z'],['v1',3,'2026-10-01T10:00:00.000Z']]);
  });
  it('returns empty totals when there is nothing to measure',()=>{
    expect(qualityReport([]).totals).toMatchObject({issues:0,precision:null});
  });
});
