<?php

namespace App\Jobs;

use App\Actions\ExecuteServerTask;
use App\Enums\TaskStatus;
use App\Models\Server;
use App\Models\Task;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Queue\Queueable;

class ProcessServerTaskJob implements ShouldQueue
{
    use Queueable, Dispatchable;

    public int $tries = 5;

    /**
     * Create a new job instance.
     */
    public function __construct(
        protected Server $server,
        protected Task   $task,
    )
    {
    }

    /**
     * Execute the job.
     */
    public function handle(ExecuteServerTask $executeServerTask): void
    {
        if($this->task->status === TaskStatus::Cancelled) {
            $this->fail();
        }

        $this->task->update([
            'status' => TaskStatus::Running,
            'started_at' => now(),
        ]);

        $taskStatus = $executeServerTask->handle(
            server: $this->server,
            task: $this->task,
        );

        $this->task->update([
            'status' => $taskStatus,
            'finished_at' => now(),
        ]);

        if(in_array($taskStatus, [
            TaskStatus::Failed,
            TaskStatus::Cancelled,
        ])) {
            $this->fail();
        }
    }
}
