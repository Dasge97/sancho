<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $fillable = ['status', 'user_id', 'shipped_at'];

    protected $casts = ['shipped_at' => 'datetime'];
}
