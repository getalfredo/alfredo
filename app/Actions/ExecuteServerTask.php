<?php

namespace App\Actions;

use App\Enums\TaskStatus;
use App\Models\Server;
use App\Models\Task;
use Illuminate\Support\Facades\Process;

class ExecuteServerTask
{
    public function handle(Server $server, Task $task): TaskStatus
    {
        $script = $task->command;

        $process = Process::run(
            command: ['bash', '-c', $script, 'bash', '10', '1'],
            output: function ($type, $output) {
                echo($output);
            }
        );

        ray('done');

        return TaskStatus::Completed;
    }
}
