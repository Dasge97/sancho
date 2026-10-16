// Contexto para JavaScript, TypeScript y Python: qué módulos del proyecto se leen junto a los cambiados.
import {describe, expect, it} from 'vitest';
import {gatherContext, isReadableSource, jsCandidates, jsImports, pyCandidates, pyImports, relatedFiles} from '../src/context.js';

describe('JavaScript and TypeScript context', () => {
  const route = "import express from 'express';\nimport {requireAuth} from '../middleware/auth';\nconst db = require('./db.js');\nimport type {User} from '@/types/user';\n";
  it('keeps only project imports and resolves them to candidate files', () => {
    expect(jsImports(route)).toEqual(['../middleware/auth', './db.js', '@/types/user']);
    expect(jsCandidates('src/routes/invoices.ts', '../middleware/auth').slice(0, 3)).toEqual(['src/middleware/auth.ts', 'src/middleware/auth.tsx', 'src/middleware/auth.js']);
    expect(jsCandidates('src/routes/invoices.ts', './db.js')).toEqual(['src/routes/db.js']);
    expect(jsCandidates('src/routes/invoices.ts', '@/types/user')[0]).toBe('src/types/user.ts');
    expect(jsCandidates('index.js', '../../fuera')).toEqual([]);
  });
  it('reads the first candidate that exists', async () => {
    const files: Record<string, string> = {'src/routes/invoices.ts': route, 'src/middleware/auth.js': 'module.exports = {requireAuth}', 'src/routes/db.js': 'db'};
    const diff = 'diff --git a/src/routes/invoices.ts b/src/routes/invoices.ts\n--- a/src/routes/invoices.ts\n+++ b/src/routes/invoices.ts\n@@ -1 +1,2 @@\n x\n+y\n';
    const ctx = await gatherContext(diff, async p => p in files ? {text: files[p], truncated: false} : null);
    expect(ctx.files.map(f => f.path)).toEqual(['src/routes/invoices.ts', 'src/middleware/auth.js', 'src/routes/db.js']);
  });
});

describe('Python context', () => {
  const views = 'from django.shortcuts import get_object_or_404\nfrom .models import Invoice\nfrom . import permissions, serializers\nfrom billing.utils import money\nimport billing.tasks\n';
  it('resolves relative and absolute imports inside the repository', () => {
    const imports = pyImports(views);
    expect(imports.map(i => [i.level, i.module])).toEqual([[0, 'django.shortcuts'], [1, 'models'], [1, ''], [0, 'billing.utils'], [0, 'billing.tasks']]);
    expect(pyCandidates('billing/views.py', imports[1])).toEqual(['billing/models.py', 'billing/models/__init__.py']);
    expect(pyCandidates('billing/views.py', imports[2])).toEqual(['billing/permissions.py', 'billing/permissions/__init__.py', 'billing/serializers.py', 'billing/serializers/__init__.py']);
    expect(pyCandidates('billing/views.py', imports[3])).toContain('src/billing/utils.py');
  });
  it('adds the urls and models of a changed Django view', () => {
    const related = relatedFiles([{path: 'billing/views.py', content: 'def x(): pass\n'}], []).map(r => r.path);
    expect(related).toEqual(['billing/urls.py', 'billing/models.py', 'billing/permissions.py']);
  });
  it('reads source files of the new languages and skips minified bundles', () => {
    expect(['a.ts', 'b.tsx', 'c.mjs', 'd.vue', 'e.py', 'package.json'].every(isReadableSource)).toBe(true);
    expect(isReadableSource('public/app.min.js')).toBe(false);
  });
});
