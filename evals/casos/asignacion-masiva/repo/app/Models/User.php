<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;

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
