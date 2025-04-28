<?php

namespace App\Console\Commands;

use App\Actions\KitchenSink\TestTaskRunner;
use Illuminate\Console\Command;

class TestTaskRunnerCommand extends Command
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
    public function handle(TestTaskRunner $testTaskRunner)
    {
        $this->info('Testing task runner...');

        $testTaskRunner->handle();
    }
}
