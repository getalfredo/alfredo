<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class SSHKey extends Model
{
    protected $table = 'ssh_keys';

    protected $casts = [
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

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
