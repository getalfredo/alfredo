<?php

namespace App\Services\Projects;

use App\Data\Project;
use App\Enums\ProjectStatus;
use Generator;
use Symfony\Component\Process\Process;

class DockerComposeService
{
    /**
     * Execute a docker compose command and yield output lines.
     *
     * @param  array<int, string>  $args
     * @return Generator<int, string>
     */
    public function execute(Project $project, string $command, array $args = []): Generator
    {
        $this->validateCommand($command);
        $this->validateArgs($args);

        $processArgs = ['docker', 'compose', $command, ...$args];

        $process = new Process($processArgs);
        $process->setWorkingDirectory($project->path);
        $process->setTimeout(config('alfredo.command_timeout', 300));

        $process->start();

        foreach ($process as $type => $data) {
            foreach (explode("\n", $data) as $line) {
                if ($line !== '') {
                    yield $line;
                }
            }
        }

        if (! $process->isSuccessful()) {
            $errorOutput = $process->getErrorOutput();
            if ($errorOutput !== '') {
                yield "Error: {$errorOutput}";
            }
        }
    }

    /**
     * Get the status of a project.
     */
    public function getStatus(string $path): ProjectStatus
    {
        $services = $this->getServices($path);

        if (empty($services)) {
            return ProjectStatus::Unknown;
        }

        $runningCount = 0;
        $totalCount = count($services);

        foreach ($services as $service) {
            if ($this->isServiceRunning($service)) {
                $runningCount++;
            }
        }

        if ($runningCount === 0) {
            return ProjectStatus::Stopped;
        }

        if ($runningCount === $totalCount) {
            return ProjectStatus::Running;
        }

        return ProjectStatus::Partial;
    }

    /**
     * Get all services for a project.
     *
     * @return array<int, array{name: string, status: string, image: string, ports: string}>
     */
    public function getServices(string $path): array
    {
        $process = new Process(['docker', 'compose', 'ps', '--format', 'json', '-a']);
        $process->setWorkingDirectory($path);
        $process->setTimeout(30);

        try {
            $process->run();

            if (! $process->isSuccessful()) {
                return [];
            }

            $output = $process->getOutput();
            $services = [];

            foreach (explode("\n", trim($output)) as $line) {
                if (empty($line)) {
                    continue;
                }

                $data = json_decode($line, true);
                if ($data === null) {
                    continue;
                }

                $services[] = [
                    'name' => $data['Service'] ?? $data['Name'] ?? 'unknown',
                    'status' => $data['State'] ?? $data['Status'] ?? 'unknown',
                    'image' => $data['Image'] ?? '',
                    'ports' => $data['Ports'] ?? $data['Publishers'] ?? '',
                ];
            }

            return $services;
        } catch (\Exception) {
            return [];
        }
    }

    /**
     * Check if a command is allowed.
     */
    public function isCommandAllowed(string $command): bool
    {
        $allowedCommands = config('alfredo.allowed_commands', []);

        return in_array($command, $allowedCommands, true);
    }

    /**
     * Validate that a command is allowed.
     *
     * @throws \InvalidArgumentException
     */
    protected function validateCommand(string $command): void
    {
        if (! $this->isCommandAllowed($command)) {
            throw new \InvalidArgumentException("Command not allowed: {$command}");
        }
    }

    /**
     * Validate command arguments for dangerous patterns.
     *
     * @param  array<int, string>  $args
     *
     * @throws \InvalidArgumentException
     */
    protected function validateArgs(array $args): void
    {
        $dangerousPatterns = [
            '/[;&|`$]/',  // Shell metacharacters
            '/\$\(/',      // Command substitution
            '/`/',         // Backticks
        ];

        foreach ($args as $arg) {
            foreach ($dangerousPatterns as $pattern) {
                if (preg_match($pattern, $arg)) {
                    throw new \InvalidArgumentException("Dangerous argument pattern detected: {$arg}");
                }
            }
        }
    }

    /**
     * Check if a service is running based on its status.
     *
     * @param  array{name: string, status: string, image: string, ports: string}  $service
     */
    protected function isServiceRunning(array $service): bool
    {
        $status = strtolower($service['status']);

        return str_contains($status, 'running') || str_contains($status, 'up');
    }
}
