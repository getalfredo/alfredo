<?php

namespace App\Http\Controllers\Projects;

use App\Data\Project;
use App\Http\Controllers\Controller;
use App\Http\Requests\Projects\UpdateFileRequest;
use App\Services\Projects\ProjectDiscoveryService;
use App\Services\Projects\ProjectFileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class ProjectFileController extends Controller
{
    public function __construct(
        protected ProjectDiscoveryService $discovery,
        protected ProjectFileService $fileService,
    ) {}

    /**
     * Display a listing of editable files.
     */
    public function index(string $path): Response|RedirectResponse
    {
        $decodedPath = Project::decodePath($path);
        $project = $this->discovery->findByPath($decodedPath);

        if ($project === null) {
            return redirect()->route('projects.index')
                ->with('error', 'Project not found');
        }

        $files = $this->fileService->getEditableFiles($project);

        return Inertia::render('projects/files', [
            'project' => $project->toArray(),
            'files' => $files,
        ]);
    }

    /**
     * Display the specified file.
     */
    public function show(string $path, string $file): JsonResponse|RedirectResponse
    {
        $decodedPath = Project::decodePath($path);
        $project = $this->discovery->findByPath($decodedPath);

        if ($project === null) {
            return response()->json(['error' => 'Project not found'], 404);
        }

        try {
            $content = $this->fileService->getFileContent($project, $file);
            $language = $this->fileService->detectLanguage($file);

            return response()->json([
                'content' => $content,
                'language' => $language,
                'path' => $file,
            ]);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Update the specified file.
     */
    public function update(UpdateFileRequest $request, string $path, string $file): JsonResponse
    {
        $decodedPath = Project::decodePath($path);
        $project = $this->discovery->findByPath($decodedPath);

        if ($project === null) {
            return response()->json(['error' => 'Project not found'], 404);
        }

        try {
            $this->fileService->updateFile($project, $file, $request->validated('content'));

            return response()->json(['success' => true]);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }
}
