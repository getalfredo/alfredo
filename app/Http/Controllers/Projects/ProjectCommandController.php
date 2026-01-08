<?php

namespace App\Http\Controllers\Projects;

use App\Data\Project;
use App\Http\Controllers\Controller;
use App\Http\Requests\Projects\ExecuteCommandRequest;
use App\Services\Projects\DockerComposeService;
use App\Services\Projects\ProjectDiscoveryService;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProjectCommandController extends Controller
{
    public function __construct(
        protected ProjectDiscoveryService $discovery,
        protected DockerComposeService $dockerCompose,
    ) {}

    /**
     * Execute a docker compose command with SSE streaming output.
     */
    public function execute(ExecuteCommandRequest $request, string $path, string $command): StreamedResponse
    {
        $decodedPath = Project::decodePath($path);
        $project = $this->discovery->findByPath($decodedPath);

        if ($project === null) {
            return $this->errorResponse('Project not found');
        }

        if (! $this->dockerCompose->isCommandAllowed($command)) {
            return $this->errorResponse("Command not allowed: {$command}");
        }

        $args = $request->validated('args', []);

        return new StreamedResponse(function () use ($project, $command, $args) {
            $this->sendEvent(['type' => 'start', 'command' => $command]);

            try {
                foreach ($this->dockerCompose->execute($project, $command, $args) as $line) {
                    $this->sendEvent(['type' => 'output', 'data' => $line]);

                    if (connection_aborted()) {
                        break;
                    }
                }

                $this->sendEvent(['type' => 'done', 'success' => true]);
            } catch (\Exception $e) {
                $this->sendEvent([
                    'type' => 'error',
                    'message' => $e->getMessage(),
                ]);
                $this->sendEvent(['type' => 'done', 'success' => false]);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
            'Connection' => 'keep-alive',
        ]);
    }

    /**
     * Send an SSE event.
     *
     * @param  array<string, mixed>  $data
     */
    protected function sendEvent(array $data): void
    {
        echo 'data: '.json_encode($data)."\n\n";
        ob_flush();
        flush();
    }

    /**
     * Create an error response as SSE.
     */
    protected function errorResponse(string $message): StreamedResponse
    {
        return new StreamedResponse(function () use ($message) {
            $this->sendEvent(['type' => 'error', 'message' => $message]);
            $this->sendEvent(['type' => 'done', 'success' => false]);
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
        ]);
    }
}
