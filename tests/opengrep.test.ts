// Opengrep: qué avisos se quedan como pistas para el modelo.
import {describe, expect, it} from 'vitest';
import {addedLines, opengrepHints, runOpengrep} from '../src/static-analysis.js';

const diff = [
  'diff --git a/app/conv.py b/app/conv.py', '--- a/app/conv.py', '+++ b/app/conv.py', '@@ -1,2 +1,4 @@',
  ' import subprocess', '+def convert(name):', '+    subprocess.run(f"convert {name}", shell=True)', ' # fin',
].join('\n');

describe('opengrep hints', () => {
  const files = addedLines(diff);
  const result = (over: any) => ({path: '/tmp/x/app/conv.py', check_id: 'python.lang.security.audit.subprocess-shell-true', start: {line: 3}, end: {line: 3}, extra: {message: 'Found shell=True.', metadata: {confidence: 'MEDIUM'}}, ...over});
  it('keeps warnings on added lines with medium or high confidence, once per line and rule', () => {
    const hints = opengrepHints([result({}), result({}), result({extra: {message: 'x', metadata: {confidence: 'LOW'}}}), result({start: {line: 1}, end: {line: 1}})], files, '/tmp/x');
    expect(hints).toEqual([{tool: 'opengrep', path: 'app/conv.py', line: 3, rule: 'subprocess-shell-true', message: 'Found shell=True.'}]);
  });
  it('anchors a warning that spans several lines to its first added line', () => {
    expect(opengrepHints([result({start: {line: 1}, end: {line: 3}})], files, '/tmp/x')[0].line).toBe(2);
  });
  it('reports a missing tool instead of failing the review', async () => {
    expect((await runOpengrep(files, async () => ({text: 'x', truncated: false}), 'sancho-no-existe-opengrep')).run.status).toBe('unavailable');
  });
});
