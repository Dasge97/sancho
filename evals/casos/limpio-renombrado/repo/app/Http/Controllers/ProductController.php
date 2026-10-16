<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductController extends Controller
{
    /**
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

        return response()->json($matches);
    }
}
