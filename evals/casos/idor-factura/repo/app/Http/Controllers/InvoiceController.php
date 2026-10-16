<?php

namespace App\Http\Controllers;

use App\Http\Resources\InvoiceResource;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class InvoiceController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return InvoiceResource::collection($request->user()->invoices()->paginate());
    }

    public function show(int $id): InvoiceResource
    {
        $invoice = Invoice::findOrFail($id);

        return new InvoiceResource($invoice);
    }
}
