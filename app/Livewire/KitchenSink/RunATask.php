<?php

namespace App\Livewire\KitchenSink;

use App\Actions\KitchenSink\TestTaskRunner;
use App\Models\Task;
use Livewire\Component;

class RunATask extends Component
{
    public function runDummyTask(TestTaskRunner $testTaskRunner)
    {
        $task = $testTaskRunner->handle();

        $this->dispatch('newTaskMonitor', $task->id);
    }

    public function render()
    {
        return view('livewire.kitchen-sink.run-a-task');
    }
}
