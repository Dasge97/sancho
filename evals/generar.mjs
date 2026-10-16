// Genera los casos de evals/casos: un proyecto Laravel mínimo, un cambio por caso y su diff real con git.
// Uso: node evals/generar.mjs evals/casos
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = process.argv[2];
const base = {
  'composer.json': JSON.stringify({name: 'acme/facturas', require: {php: '^8.3', 'laravel/framework': '^11.0'}, autoload: {'psr-4': {'App\\': 'app/'}}}, null, 2) + '\n',
  'routes/api.php': `<?php

use App\\Http\\Controllers\\InvoiceController;
use App\\Http\\Controllers\\OrderController;
use App\\Http\\Controllers\\ProductController;
use App\\Http\\Controllers\\ProfileController;
use Illuminate\\Support\\Facades\\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/invoices', [InvoiceController::class, 'index']);
    Route::get('/invoices/{id}', [InvoiceController::class, 'show']);
    Route::get('/products/search', [ProductController::class, 'search']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::post('/orders/{order}/ship', [OrderController::class, 'ship']);
});
`,
  'app/Models/Invoice.php': `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class Invoice extends Model
{
    protected $fillable = ['number', 'total', 'user_id'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
`,
  'app/Models/User.php': `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Relations\\HasMany;
use Illuminate\\Foundation\\Auth\\User as Authenticatable;

class User extends Authenticatable
{
    // Columnas: id, name, email, password, is_admin, created_at, updated_at.
    protected $guarded = [];

    protected $hidden = ['password'];

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }
}
`,
  'app/Models/Order.php': `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class Order extends Model
{
    protected $fillable = ['status', 'user_id', 'shipped_at'];

    protected $casts = ['shipped_at' => 'datetime'];
}
`,
  'app/Policies/InvoicePolicy.php': `<?php

namespace App\\Policies;

use App\\Models\\Invoice;
use App\\Models\\User;

class InvoicePolicy
{
    public function view(User $user, Invoice $invoice): bool
    {
        return $user->is_admin || $invoice->user_id === $user->id;
    }
}
`,
  'app/Policies/OrderPolicy.php': `<?php

namespace App\\Policies;

use App\\Models\\Order;
use App\\Models\\User;

class OrderPolicy
{
    public function update(User $user, Order $order): bool
    {
        return $user->is_admin || $order->user_id === $user->id;
    }
}
`,
  'app/Http/Resources/InvoiceResource.php': `<?php

namespace App\\Http\\Resources;

use Illuminate\\Http\\Resources\\Json\\JsonResource;

class InvoiceResource extends JsonResource
{
}
`,
  'app/Http/Controllers/Controller.php': `<?php

namespace App\\Http\\Controllers;

use Illuminate\\Foundation\\Auth\\Access\\AuthorizesRequests;

abstract class Controller
{
    use AuthorizesRequests;
}
`,
  'app/Http/Controllers/InvoiceController.php': `<?php

namespace App\\Http\\Controllers;

use App\\Http\\Resources\\InvoiceResource;
use App\\Models\\Invoice;
use Illuminate\\Http\\Request;
use Illuminate\\Http\\Resources\\Json\\AnonymousResourceCollection;

class InvoiceController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return InvoiceResource::collection($request->user()->invoices()->paginate());
    }
}
`,
  'app/Http/Controllers/ProductController.php': `<?php

namespace App\\Http\\Controllers;

use Illuminate\\Http\\JsonResponse;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\DB;

class ProductController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $request->validate(['q' => 'required|string|max:100']);

        $products = DB::table('products')
            ->where('name', 'like', '%'.$request->input('q').'%')
            ->limit(20)
            ->get();

        return response()->json($products);
    }
}
`,
  'app/Http/Controllers/ProfileController.php': `<?php

namespace App\\Http\\Controllers;

use Illuminate\\Http\\JsonResponse;
use Illuminate\\Http\\Request;

class ProfileController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email',
        ]);

        $request->user()->update($data);

        return response()->json($request->user());
    }
}
`,
  'app/Http/Controllers/OrderController.php': `<?php

namespace App\\Http\\Controllers;

use App\\Models\\Order;
use Illuminate\\Http\\JsonResponse;

class OrderController extends Controller
{
    public function ship(Order $order): JsonResponse
    {
        $this->authorize('update', $order);

        if ($order->status === 'paid') {
            $order->update(['status' => 'shipped', 'shipped_at' => now()]);
        }

        return response()->json($order);
    }
}
`,
};

const replace = (file, from, to) => { if (!base[file].includes(from)) throw new Error(`${file}: no encuentro el texto`); return {[file]: base[file].replace(from, to)}; };

const cases = {
  'idor-factura': {
    caso: {titulo: 'Muestra una factura por su id', descripcion: 'Nuevo endpoint que devuelve una factura sin comprobar que es del usuario. La política InvoicePolicy existe pero no se usa.',
      esperados: [{fichero: 'app/Http/Controllers/InvoiceController.php', texto: 'Invoice::findOrFail($id)', tipo: ['authorization', 'security'], nota: 'Cualquier usuario lee facturas ajenas cambiando el id.'}]},
    cambios: replace('app/Http/Controllers/InvoiceController.php', `        return InvoiceResource::collection($request->user()->invoices()->paginate());
    }
`, `        return InvoiceResource::collection($request->user()->invoices()->paginate());
    }

    public function show(int $id): InvoiceResource
    {
        $invoice = Invoice::findOrFail($id);

        return new InvoiceResource($invoice);
    }
`),
  },
  'factura-autorizada': {
    caso: {titulo: 'Muestra una factura por su id, con su política', descripcion: 'El mismo endpoint que idor-factura, pero aplica InvoicePolicy. No hay nada que comentar: mide falsos positivos.', esperados: []},
    cambios: replace('app/Http/Controllers/InvoiceController.php', `        return InvoiceResource::collection($request->user()->invoices()->paginate());
    }
`, `        return InvoiceResource::collection($request->user()->invoices()->paginate());
    }

    public function show(int $id): InvoiceResource
    {
        $invoice = Invoice::findOrFail($id);
        $this->authorize('view', $invoice);

        return new InvoiceResource($invoice);
    }
`),
  },
  'sql-busqueda': {
    caso: {titulo: 'Búsqueda de productos más rápida', descripcion: 'Cambia el query builder por SQL concatenado con la entrada del usuario.',
      esperados: [{fichero: 'app/Http/Controllers/ProductController.php', texto: 'DB::select(', tipo: ['security'], nota: 'Inyección SQL con el parámetro q.'}]},
    cambios: replace('app/Http/Controllers/ProductController.php', `        $products = DB::table('products')
            ->where('name', 'like', '%'.$request->input('q').'%')
            ->limit(20)
            ->get();
`, `        $products = DB::select(
            "SELECT * FROM products WHERE name LIKE '%".$request->input('q')."%' LIMIT 20"
        );
`),
  },
  'asignacion-masiva': {
    caso: {titulo: 'El perfil acepta más campos', descripcion: 'El usuario puede actualizar cualquier columna, incluida is_admin, porque User tiene $guarded = [].',
      esperados: [{fichero: 'app/Http/Controllers/ProfileController.php', texto: '$request->user()->update($request->all());', tipo: ['security', 'authorization'], nota: 'Escalada a administrador enviando is_admin=1.'}]},
    cambios: replace('app/Http/Controllers/ProfileController.php', `        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email',
        ]);

        $request->user()->update($data);
`, `        $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email',
        ]);

        $request->user()->update($request->all());
`),
  },
  'condicion-asignacion': {
    caso: {titulo: 'Simplifica el envío de pedidos', descripcion: 'Un = en lugar de === hace que todos los pedidos se den por pagados y se envíen.',
      esperados: [{fichero: 'app/Http/Controllers/OrderController.php', texto: "if ($order->status = 'paid') {", tipo: ['correctness', 'data_integrity'], nota: 'Envía pedidos sin pagar.'}]},
    cambios: replace('app/Http/Controllers/OrderController.php', `if ($order->status === 'paid') {`, `if ($order->status = 'paid') {`),
  },
  'limpio-renombrado': {
    caso: {titulo: 'Renombra variables y documenta la búsqueda', descripcion: 'Cambio sin efecto en el comportamiento. No hay nada que comentar: mide falsos positivos.', esperados: []},
    cambios: replace('app/Http/Controllers/ProductController.php', `    public function search(Request $request): JsonResponse
    {
        $request->validate(['q' => 'required|string|max:100']);

        $products = DB::table('products')
            ->where('name', 'like', '%'.$request->input('q').'%')
            ->limit(20)
            ->get();

        return response()->json($products);`, `    /**
     * Busca productos por nombre. Devuelve como mucho 20 resultados.
     */
    public function search(Request $request): JsonResponse
    {
        $request->validate(['q' => 'required|string|max:100']);

        $term = $request->input('q');
        $matches = DB::table('products')
            ->where('name', 'like', '%'.$term.'%')
            ->limit(20)
            ->get();

        return response()->json($matches);`),
  },
};

const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8', env: {...process.env, GIT_AUTHOR_NAME: 'eval', GIT_AUTHOR_EMAIL: 'eval@example.org', GIT_COMMITTER_NAME: 'eval', GIT_COMMITTER_EMAIL: 'eval@example.org'}});
const write = (root, files) => { for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), {recursive: true}); fs.writeFileSync(path.join(root, f), t); } };

for (const [name, c] of Object.entries(cases)) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sancho-eval-'));
  write(tmp, base); git(tmp, 'init', '-q'); git(tmp, 'config', 'core.autocrlf', 'false'); git(tmp, 'add', '.'); git(tmp, 'commit', '-qm', 'base');
  write(tmp, c.cambios);
  const diff = git(tmp, 'diff', '--no-color', '--no-ext-diff');
  const dir = path.join(OUT, name);
  fs.rmSync(dir, {recursive: true, force: true});
  write(path.join(dir, 'repo'), {...base, ...c.cambios});
  fs.writeFileSync(path.join(dir, 'cambio.diff'), diff);
  fs.writeFileSync(path.join(dir, 'caso.json'), JSON.stringify(c.caso, null, 2) + '\n');
  fs.rmSync(tmp, {recursive: true, force: true});
  console.log(name, diff.split('\n').length, 'líneas de diff');
}
