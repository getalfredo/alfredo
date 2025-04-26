<?php

namespace App\Console\Commands;

use App\Jobs\ProcessServerTaskJob;
use App\Models\Server;
use App\Models\Task;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;

class TestTaskRunner extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:test-task-runner';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Test the task runner';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info('Testing task runner...');

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
    }
}
