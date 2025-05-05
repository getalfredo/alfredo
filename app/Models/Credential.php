<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Credential extends Model
{
    public static string $typeAttr = 'type';

    protected $casts = [
        'value' => 'encrypted',
        'username' => 'encrypted',
        'password' => 'encrypted',
        'private_key' => 'encrypted',
        'public_key' => 'encrypted',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            $model->uuid = Str::uuid()->toString();
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
