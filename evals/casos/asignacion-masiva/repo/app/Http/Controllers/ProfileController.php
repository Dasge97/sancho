<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email',
        ]);

        $request->user()->update($request->all());

        return response()->json($request->user());
    }
}
