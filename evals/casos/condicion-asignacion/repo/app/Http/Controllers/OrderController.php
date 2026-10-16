<?php

namespace App\Http\Controllers;

use App\Models\Order;
use Illuminate\Http\JsonResponse;

class OrderController extends Controller
{
    public function ship(Order $order): JsonResponse
    {
        $this->authorize('update', $order);

        if ($order->status = 'paid') {
            $order->update(['status' => 'shipped', 'shipped_at' => now()]);
        }

        return response()->json($order);
    }
}
