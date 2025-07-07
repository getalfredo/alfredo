<?php

namespace App\Models;

use App\Enums\ServerStatus;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Spatie\Activitylog\Models\Activity;

class Server extends Model
{
    public const int SSH_DEFAULT_PORT = 22;

    public const string DEFAULT_SPACES_DIRECTORY = 'spaces';

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
            $server->spaces_directory ??= static::DEFAULT_SPACES_DIRECTORY;
        });
    }

    public function activity_log()
    {
        return $this->morphMany(Activity::class, 'subject');
    }

    public function run(string|array $tasks): Haystack
    {
        return $this->runServerTasks($tasks);
    }

    public function spacesFolderPath(): Attribute
    {
        return Attribute::make(
            get: fn() => "/home/{$this->username}/{$this->spaces_directory}"
        );
    }
}
