<?php

namespace App\Livewire\KitchenSink;

use App\Actions\KitchenSink\TestTaskRunner;
use App\Models\Task;
use Livewire\Component;

class RunATask extends Component
{
    public Task $task;

    public function runDummyTask(TestTaskRunner $testTaskRunner)
    {
        
    }

    public function render()
    {
        return view('livewire.kitchen-sink.run-a-task');
    }
}
