<?php

namespace App\Actions;

use App\Enums\ProcessStatus;
use App\Enums\TaskStatus;
use App\Models\Server;
use App\Models\Task;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;

class ExecuteServerTask
{
    public const TIMEOUT = 15 * 60;

    protected $timeStart;

    protected $currentTime;

    protected $lastWriteAt = 0;

    protected $throttleIntervalMS = 500;

    protected int $counter = 0;

    public bool $hideFromOutput = false;

    public bool $ignoreErrors = false;

    protected Task $task;

    public function hideFromOutput(bool $hideFromOutput = true): static
    {
        $this->hideFromOutput = $hideFromOutput;

        return $this;
    }

    public function ignoreErrors(bool $ignoreErrors = true): static
    {
        $this->ignoreErrors = $ignoreErrors;

        return $this;
    }

    public function handle(Server $server, Task $task): TaskStatus
    {
        $this->task = $task;

        $this->timeStart = hrtime(true);

        $script = $task->command;

        $processResult = Process::timeout(static::TIMEOUT)
            ->run(
                command: ['bash', '-c', $script, 'bash', '10', '1'],
                output: $this->handleOutput(...),
            );

        match ($processResult->exitCode()) {
            0 => $status = TaskStatus::Completed,
            default => $status = TaskStatus::Failed,
        };

        $task->status = $status;
        $task->std_out = $processResult->output();
        $task->std_err = $processResult->errorOutput();

        if ($processResult->exitCode() != 0 && !$this->ignoreErrors) {
            throw new \RuntimeException($processResult->errorOutput());
        }

        return $status;
    }

    protected function incrementLatestCounter(): int
    {
        if (count($this->task->output)) {
            $this->counter++;

            return $this->counter;
        }

        $this->counter = collect($this->task->output)->max('order') + 1;

        return $this->counter;
    }

    protected function handleOutput(string $type, string $output)
    {
        if ($this->hideFromOutput) {
            return;
        }

        $this->currentTime = $this->elapsedTime();

        $this->task->output = collect($this->task->output)->push([
            'type' => $type,
            'output' => $output,
            'timestamp' => hrtime(true),
            'order' => $this->incrementLatestCounter(),
        ]);

        if ($this->isAfterLastThrottle()) {
            // Let's write to database.
            DB::transaction(function () {
                $this->task->save();
                $this->lastWriteAt = $this->currentTime;
            });
        }
    }

    public static function decodeOutput(?array $output = null): string
    {
        if (blank($output)) {
            return '';
        }

        return collect($output)
            ->sortBy(fn($i) => $i['order'])
            ->map(fn($i) => $i['output'])
            ->implode("");
    }

    /**
     * Determines if it's time to write again to database.
     *
     * @return bool
     */
    protected function isAfterLastThrottle()
    {
        // If DB was never written, then we immediately decide we have to write.
        if ($this->lastWriteAt === 0) {
            return true;
        }

        return ($this->currentTime - $this->throttleIntervalMS) > $this->lastWriteAt;
    }

    protected function elapsedTime(): int
    {
        $timeMs = (hrtime(true) - $this->timeStart) / 1_000_000;

        return intval($timeMs);
    }
}
