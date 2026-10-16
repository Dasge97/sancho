import {describe, expect, it} from 'vitest';
import {annotateDiff, changedFiles, classToPath, gatherContext, phpUses, psr4Map, relatedFiles} from '../src/context.js';
import {buildInstructions} from '../src/prompts.js';

const diff = [
  'diff --git a/app/Http/Controllers/InvoiceController.php b/app/Http/Controllers/InvoiceController.php',
  '--- a/app/Http/Controllers/InvoiceController.php',
  '+++ b/app/Http/Controllers/InvoiceController.php',
  '@@ -10,3 +10,4 @@ class InvoiceController',
  '     public function show(Invoice $invoice)',
  '-        return $invoice;',
  '+        $this->authorize(\'view\', $invoice);',
  '+        return $invoice->load(\'lines\');',
  '     }',
  'diff --git a/old.php b/old.php',
  '--- a/old.php',
  '+++ /dev/null',
  '@@ -1,1 +0,0 @@',
  '-<?php',
].join('\n');

const controller = `<?php
namespace App\\Http\\Controllers;

use App\\Models\\Invoice;
use Illuminate\\Http\\Request;
use function strlen;

class InvoiceController extends Controller {}`;
const composer = JSON.stringify({autoload: {'psr-4': {'App\\': 'app/'}}, 'autoload-dev': {'psr-4': {'Tests\\': 'tests/'}}});

describe('diff annotated with new-file line numbers', () => {
  it('numbers added and context lines and marks deleted ones', () => {
    const out = annotateDiff(diff).split('\n');
    expect(out).toContain(' L10|     public function show(Invoice $invoice)');
    expect(out).toContain('-     |         return $invoice;');
    expect(out).toContain("+L11|         $this->authorize('view', $invoice);");
    expect(out).toContain("+L12|         return $invoice->load('lines');");
    expect(out).toContain(' L13|     }');
  });
  it('lists only files that still exist after the PR', () => {
    expect(changedFiles(diff)).toEqual(['app/Http/Controllers/InvoiceController.php']);
  });
});

describe('related files from PHP imports and the composer autoload', () => {
  const map = psr4Map(composer);
  it('reads class imports, skipping functions and constants', () => {
    expect(phpUses(controller)).toEqual(['App\\Models\\Invoice', 'Illuminate\\Http\\Request']);
  });
  it('resolves project classes and ignores vendor ones', () => {
    expect(classToPath('App\\Models\\Invoice', map)).toBe('app/Models/Invoice.php');
    expect(classToPath('Illuminate\\Http\\Request', map)).toBeNull();
    expect(psr4Map('not json')).toEqual([]);
  });
  it('adds the model, its Laravel policy and the route files for a changed controller', () => {
    const related = relatedFiles([{path: 'app/Http/Controllers/InvoiceController.php', content: controller}], map).map(r => r.path);
    expect(related).toEqual(['app/Models/Invoice.php', 'app/Policies/InvoicePolicy.php', 'routes/web.php', 'routes/api.php', 'config/routes.yaml', 'config/packages/security.yaml']);
  });
});

describe('context gathering', () => {
  const files: Record<string, string> = {
    'app/Http/Controllers/InvoiceController.php': controller,
    'composer.json': composer,
    'app/Models/Invoice.php': '<?php\nclass Invoice { protected $fillable = [];\n  private $apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456"; }',
    'routes/web.php': "<?php\nRoute::get('/invoices/{invoice}', [InvoiceController::class, 'show']);",
  };
  const fetch = async (path: string, max: number) => path in files ? {text: files[path].slice(0, max), truncated: files[path].length > max} : null;

  it('includes changed and related files with their reason, numbered and with secrets hidden', async () => {
    const ctx = await gatherContext(diff, fetch);
    expect(ctx.files.map(f => f.path)).toEqual(['app/Http/Controllers/InvoiceController.php', 'app/Models/Invoice.php', 'routes/web.php']);
    expect(ctx.files[1].reason).toContain('App\\Models\\Invoice');
    expect(ctx.text).toContain('=== Fichero: routes/web.php · rutas de la aplicación (Laravel) ===');
    expect(ctx.text).toContain('   2| Route::get');
    expect(ctx.text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(ctx.redacted).toBe(1);
    expect(ctx.partial).toBe(false);
  });
  it('marks the context as partial when a file is cut or the total limit is reached', async () => {
    const cut = await gatherContext(diff, fetch, {changedFiles: 8, changedBytes: 20, relatedFiles: 8, relatedBytes: 12_000, totalChars: 60_000});
    expect(cut.partial).toBe(true);
    expect(cut.files[0].truncated).toBe(true);
    const tiny = await gatherContext(diff, fetch, {changedFiles: 8, changedBytes: 16_000, relatedFiles: 8, relatedBytes: 12_000, totalChars: 300});
    expect(tiny.partial).toBe(true);
  });
});

describe('instructions sent to the model', () => {
  it('load the versioned template and add team rules only when there are some', () => {
    const plain = buildInstructions('deteccion');
    expect(plain).toContain('Eres Sancho');
    expect(plain).not.toContain('Reglas y contexto del equipo');
    const withRules = buildInstructions('deteccion', {global: 'No comentes los seeders.', projectContext: 'API de facturas.', repository: 'Los administradores ven todo.'});
    expect(withRules).toContain('### De qué va este proyecto\n\nAPI de facturas.');
    expect(withRules).toContain('No comentes los seeders.');
    expect(withRules).toContain('Los administradores ven todo.');
    expect(buildInstructions('verificacion')).toContain('escéptico');
  });
  it('use the version edited in the dashboard instead of the original, and the original when it is reset', () => {
    const edited = buildInstructions('deteccion', {global: 'Regla.'}, true, {deteccion: 'Instrucciones propias de detección.', agente: null});
    expect(edited.startsWith('Instrucciones propias de detección.')).toBe(true);
    expect(edited).not.toContain('Eres Sancho');
    expect(edited).toContain('tienes el repositorio completo');
    expect(edited).toContain('Regla.');
    expect(buildInstructions('deteccion', {}, false, {deteccion: '   '})).toContain('Eres Sancho');
  });
});
