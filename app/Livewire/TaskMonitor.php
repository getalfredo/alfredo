<?php

namespace App\Livewire;

use App\Enums\TaskStatus;
use App\Models\Task;
use Livewire\Attributes\Locked;
use Livewire\Attributes\On;
use Livewire\Component;

class TaskMonitor extends Component
{
    public bool $header = true;

    #[Locked]
    public $taskId;

    protected Task $task;

    public $isPollingActive = false;

    public $pollingMs = 1200;

    public function hydrateTask()
    {
        $this->task = Task::find($this->taskId);
    }

    #[On('newTaskMonitor')]
    public function newTaskMonitor($taskId)
    {
        $this->taskId = $taskId;

        $this->hydrateTask();

        $this->isPollingActive = true;
    }

    public function polling(): void
    {
        $this->hydrateTask();

        if ($this->isFinished()) {
            $this->isPollingActive = false;
        }
    }

    protected function isFinished(): bool
    {
        return in_array(
            needle: $this->task->status,
            haystack: [
                TaskStatus::Failed,
                TaskStatus::Cancelled,
                TaskStatus::Completed,
                TaskStatus::Timeout,
            ]);
    }

    public function render()
    {
        return view('livewire.task-monitor');
    }
}
