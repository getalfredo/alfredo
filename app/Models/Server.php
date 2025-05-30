<?php

namespace App\Models;

use App\Actions\KeyPairGenerator;
use App\Enums\KeyPairType;
use App\Enums\ServerStatus;
use App\Services\KeyPair;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Spatie\Activitylog\Models\Activity;

class Server extends Model
{
    public const int SSH_DEFAULT_PORT = 22;

    use HasFactory;

    public $hidden = [
        'sudo_password',
    ];

    public $casts = [
        'status' => ServerStatus::class,
        'sudo_password' => 'encrypted',
    ];

    protected static function booted()
    {
        static::creating(function (Server $server) {
            /** @var KeyPair $keyGenerator */
            $keyGenerator = (app(KeyPairGenerator::class));

            $key = $keyGenerator->handle(KeyPairType::Ed25519);
            $server->private_key ??= $key->privateKey;
            $server->public_key ??= $key->publicKey;
        });
    }

    public function activity_log()
    {
        return $this->morphMany(Activity::class, 'subject');
    }

    public function spaces()
    {
        return $this->hasMany(Space::class);
    }

    public function run(string|array $tasks): Haystack
    {
        return $this->runServerTasks($tasks);
    }

    public function spacesFolderPath(): Attribute
    {
        // TODO: Make it configurable??
        $spacesFolder = 'spaces';

        return Attribute::make(
            get: fn() => "/home/{$this->username}/{$spacesFolder}"
        );
    }
}
