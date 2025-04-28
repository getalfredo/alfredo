<?php

namespace App\Actions\KitchenSink;

use App\Jobs\ProcessServerTaskJob;
use App\Models\Server;
use App\Models\Task;

class TestTaskRunner
{
    public function handle(): Task
    {
        $script = <<<'BASH'
DURATION=${1:-8}
INTERVAL=${2:-1}

start_time=$(date +%s)
counter=1

while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))

    if [ $elapsed -ge $DURATION ]; then
        break
    fi

    echo $counter
    counter=$((counter + 1))
    sleep $INTERVAL
done
BASH;

        $server = Server::first();

        $task = Task::create([
            'name' => 'Test Task',
            'command' => $script,
            'working_directory' => null,
            'timeout' => 60,
            'attempts' => 0,
            'max_attempts' => 5,
        ]);

        ProcessServerTaskJob::dispatch($server, $task);

        return $task;
    }
}
