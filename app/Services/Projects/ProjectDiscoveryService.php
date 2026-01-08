<?php

namespace App\Services\Projects;

use App\Data\Project;
use App\Enums\ProjectStatus;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Symfony\Component\Yaml\Yaml;

class ProjectDiscoveryService
{
    public function __construct(
        protected DockerComposeService $dockerCompose,
    ) {}

    /**
     * Discover all projects from configured directories and manual additions.
     *
     * @return Collection<int, Project>
     */
    public function discover(): Collection
    {
        $projects = collect();

        foreach ($this->getScanDirectories() as $directory) {
            $projects = $projects->merge($this->scanDirectory($directory));
        }

        $projects = $projects->merge($this->loadManualProjects());

        return $projects->unique(fn (Project $project) => $project->path);
    }

    /**
     * Find a single project by its path.
     */
    public function findByPath(string $path): ?Project
    {
        $realPath = realpath($path);
        if ($realPath === false || ! is_dir($realPath)) {
            return null;
        }

        $alfredoYml = $realPath.DIRECTORY_SEPARATOR.'alfredo.yml';
        if (File::exists($alfredoYml)) {
            return $this->createProjectFromConfig($realPath, $alfredoYml);
        }

        $composeFile = $this->findComposeFile($realPath);
        if ($composeFile !== null) {
            return $this->createProjectFromPath($realPath, true);
        }

        return null;
    }

    /**
     * Add a manual project to the JSON storage.
     */
    public function addManualProject(string $path, ?string $name = null): Project
    {
        $realPath = realpath($path);
        if ($realPath === false || ! is_dir($realPath)) {
            throw new \InvalidArgumentException("Path does not exist or is not a directory: {$path}");
        }

        $composeFile = $this->findComposeFile($realPath);
        if ($composeFile === null) {
            throw new \InvalidArgumentException("No docker-compose file found in: {$path}");
        }

        $manualProjects = $this->loadManualProjectsData();

        if (collect($manualProjects)->contains('path', $realPath)) {
            throw new \InvalidArgumentException("Project already exists: {$realPath}");
        }

        $manualProjects[] = [
            'path' => $realPath,
            'name' => $name ?? basename($realPath),
        ];

        $this->saveManualProjectsData($manualProjects);

        return $this->createProjectFromPath($realPath, true, $name);
    }

    /**
     * Remove a manual project from storage.
     */
    public function removeManualProject(string $path): void
    {
        $realPath = realpath($path) ?: $path;
        $manualProjects = $this->loadManualProjectsData();

        $manualProjects = array_values(
            array_filter($manualProjects, fn ($project) => $project['path'] !== $realPath)
        );

        $this->saveManualProjectsData($manualProjects);
    }

    /**
     * Check if a project is a manual project.
     */
    public function isManualProject(string $path): bool
    {
        $realPath = realpath($path) ?: $path;
        $manualProjects = $this->loadManualProjectsData();

        return collect($manualProjects)->contains('path', $realPath);
    }

    /**
     * Parse an alfredo.yml config file.
     *
     * @return array<string, mixed>
     */
    public function parseConfig(string $path): array
    {
        if (! File::exists($path)) {
            return [];
        }

        try {
            $content = File::get($path);

            return Yaml::parse($content) ?? [];
        } catch (\Exception) {
            return [];
        }
    }

    /**
     * Get the status of a project from Docker.
     */
    public function getProjectStatus(string $path): ProjectStatus
    {
        return $this->dockerCompose->getStatus($path);
    }

    /**
     * Scan a directory recursively for alfredo.yml files.
     *
     * @return Collection<int, Project>
     */
    protected function scanDirectory(string $directory): Collection
    {
        $projects = collect();
        $realPath = realpath($directory);

        if ($realPath === false || ! is_dir($realPath)) {
            return $projects;
        }

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($realPath, \RecursiveDirectoryIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getFilename() === 'alfredo.yml') {
                $projectPath = dirname($file->getPathname());
                $project = $this->createProjectFromConfig($projectPath, $file->getPathname());
                if ($project !== null) {
                    $projects->push($project);
                }
            }
        }

        return $projects;
    }

    /**
     * Create a Project from an alfredo.yml config.
     */
    protected function createProjectFromConfig(string $path, string $configPath): ?Project
    {
        $config = $this->parseConfig($configPath);
        $composeFile = $this->findComposeFile($path, $config);

        if ($composeFile === null) {
            return null;
        }

        return new Project(
            path: $path,
            name: $config['name'] ?? basename($path),
            description: $config['description'] ?? null,
            status: $this->dockerCompose->getStatus($path),
            config: $config,
            isManual: false,
        );
    }

    /**
     * Create a Project from a path (for manual projects).
     */
    protected function createProjectFromPath(string $path, bool $isManual, ?string $name = null): Project
    {
        return new Project(
            path: $path,
            name: $name ?? basename($path),
            description: null,
            status: $this->dockerCompose->getStatus($path),
            config: [],
            isManual: $isManual,
        );
    }

    /**
     * Find the docker-compose file in a project directory.
     *
     * @param  array<string, mixed>  $config
     */
    protected function findComposeFile(string $path, array $config = []): ?string
    {
        if (isset($config['compose']['file'])) {
            $file = $path.DIRECTORY_SEPARATOR.$config['compose']['file'];

            return File::exists($file) ? $file : null;
        }

        $possibleFiles = [
            'docker-compose.yml',
            'docker-compose.yaml',
            'compose.yml',
            'compose.yaml',
        ];

        foreach ($possibleFiles as $file) {
            $fullPath = $path.DIRECTORY_SEPARATOR.$file;
            if (File::exists($fullPath)) {
                return $fullPath;
            }
        }

        return null;
    }

    /**
     * Load manual projects from storage.
     *
     * @return Collection<int, Project>
     */
    protected function loadManualProjects(): Collection
    {
        $data = $this->loadManualProjectsData();

        return collect($data)
            ->map(function ($item) {
                $path = $item['path'] ?? '';
                if (! is_dir($path) || $this->findComposeFile($path) === null) {
                    return null;
                }

                return $this->createProjectFromPath($path, true, $item['name'] ?? null);
            })
            ->filter();
    }

    /**
     * Load raw manual projects data from JSON.
     *
     * @return array<int, array{path: string, name: string}>
     */
    protected function loadManualProjectsData(): array
    {
        $file = config('alfredo.manual_projects_file');

        if (! File::exists($file)) {
            return [];
        }

        try {
            $content = File::get($file);
            $data = json_decode($content, true);

            return $data['projects'] ?? [];
        } catch (\Exception) {
            return [];
        }
    }

    /**
     * Save manual projects data to JSON.
     *
     * @param  array<int, array{path: string, name: string}>  $projects
     */
    protected function saveManualProjectsData(array $projects): void
    {
        $file = config('alfredo.manual_projects_file');
        $directory = dirname($file);

        if (! File::isDirectory($directory)) {
            File::makeDirectory($directory, 0755, true);
        }

        File::put($file, json_encode(['projects' => $projects], JSON_PRETTY_PRINT));
    }

    /**
     * Get configured scan directories.
     *
     * @return array<int, string>
     */
    protected function getScanDirectories(): array
    {
        return config('alfredo.scan_directories', []);
    }
}
