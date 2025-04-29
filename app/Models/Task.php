<?php

namespace App\Models;

use App\Enums\TaskStatus;
use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'status' => TaskStatus::class,
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
        'scheduled_for' => 'datetime',
        'environment_variables' => 'json',
        'metadata' => 'json',
        'output' => 'json',
        'std_out' => 'json',
        'std_err' => 'json',
    ];

}
