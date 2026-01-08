<?php

namespace App\Http\Controllers\Projects;

use App\Data\Project;
use App\Http\Controllers\Controller;
use App\Http\Requests\Projects\StoreProjectRequest;
use App\Services\Projects\DockerComposeService;
use App\Services\Projects\ProjectDiscoveryService;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class ProjectController extends Controller
{
    public function __construct(
        protected ProjectDiscoveryService $discovery,
        protected DockerComposeService $dockerCompose,
    ) {}

    /**
     * Display a listing of all discovered projects.
     */
    public function index(): Response
    {
        $projects = $this->discovery->discover();

        return Inertia::render('projects/index', [
            'projects' => $projects->map(fn (Project $project) => $project->toArray())->values(),
        ]);
    }

    /**
     * Display the specified project.
     */
    public function show(string $path): Response|RedirectResponse
    {
        $decodedPath = Project::decodePath($path);
        $project = $this->discovery->findByPath($decodedPath);

        if ($project === null) {
            return redirect()->route('projects.index')
                ->with('error', 'Project not found');
        }

        $services = $this->dockerCompose->getServices($project->path);

        return Inertia::render('projects/show', [
            'project' => $project->toArray(),
            'services' => $services,
        ]);
    }

    /**
     * Store a new manual project.
     */
    public function store(StoreProjectRequest $request): RedirectResponse
    {
        try {
            $project = $this->discovery->addManualProject(
                $request->validated('path'),
                $request->validated('name'),
            );

            return redirect()->route('projects.show', $project->encodedPath())
                ->with('success', 'Project added successfully');
        } catch (\InvalidArgumentException $e) {
            return redirect()->back()
                ->withErrors(['path' => $e->getMessage()]);
        }
    }

    /**
     * Remove the specified manual project.
     */
    public function destroy(string $path): RedirectResponse
    {
        $decodedPath = Project::decodePath($path);

        if (! $this->discovery->isManualProject($decodedPath)) {
            return redirect()->route('projects.index')
                ->with('error', 'Only manual projects can be removed');
        }

        $this->discovery->removeManualProject($decodedPath);

        return redirect()->route('projects.index')
            ->with('success', 'Project removed successfully');
    }
}
