<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
