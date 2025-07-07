<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class APIToken extends Model
{
    protected $table = 'api_tokens';

    protected $casts = [
        'value' => 'encrypted',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            $model->uuid = Str::uuid()->toString();
        });
    }

    public function tokenable(): BelongsTo
    {
        return $this->morphTo();
    }
}
