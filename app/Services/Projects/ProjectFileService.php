<?php

namespace App\Services\Projects;

use App\Data\Project;
use Illuminate\Support\Facades\File;
use Symfony\Component\Finder\Finder;

class ProjectFileService
{
    /**
     * Extension to Monaco language mapping.
     *
     * @var array<string, string>
     */
    protected array $languageMap = [
        'yml' => 'yaml',
        'yaml' => 'yaml',
        'json' => 'json',
        'js' => 'javascript',
        'ts' => 'typescript',
        'tsx' => 'typescript',
        'jsx' => 'javascript',
        'php' => 'php',
        'py' => 'python',
        'rb' => 'ruby',
        'go' => 'go',
        'rs' => 'rust',
        'sh' => 'shell',
        'bash' => 'shell',
        'zsh' => 'shell',
        'md' => 'markdown',
        'html' => 'html',
        'htm' => 'html',
        'css' => 'css',
        'scss' => 'scss',
        'less' => 'less',
        'xml' => 'xml',
        'sql' => 'sql',
        'dockerfile' => 'dockerfile',
        'env' => 'shell',
    ];

    /**
     * Get all editable files for a project.
     *
     * @return array<int, array{path: string, name: string, language: string}>
     */
    public function getEditableFiles(Project $project): array
    {
        $patterns = $project->editablePatterns();
        $files = [];

        foreach ($patterns as $pattern) {
            $matches = $this->findFilesMatchingPattern($project->path, $pattern);
            foreach ($matches as $file) {
                $relativePath = $this->getRelativePath($project->path, $file);
                $files[$relativePath] = [
                    'path' => $relativePath,
                    'name' => basename($file),
                    'language' => $this->detectLanguage($file),
                ];
            }
        }

        return array_values($files);
    }

    /**
     * Get the content of a file.
     *
     * @throws \InvalidArgumentException
     */
    public function getFileContent(Project $project, string $relativePath): string
    {
        $fullPath = $this->resolveAndValidatePath($project, $relativePath);

        if (! File::exists($fullPath)) {
            throw new \InvalidArgumentException("File not found: {$relativePath}");
        }

        return File::get($fullPath);
    }

    /**
     * Update the content of a file.
     *
     * @throws \InvalidArgumentException
     */
    public function updateFile(Project $project, string $relativePath, string $content): void
    {
        $fullPath = $this->resolveAndValidatePath($project, $relativePath);

        if (! $this->isFileEditable($project, $relativePath)) {
            throw new \InvalidArgumentException("File is not in the editable patterns: {$relativePath}");
        }

        File::put($fullPath, $content);
    }

    /**
     * Detect the Monaco editor language for a file.
     */
    public function detectLanguage(string $filename): string
    {
        $basename = strtolower(basename($filename));

        if (str_starts_with($basename, 'dockerfile')) {
            return 'dockerfile';
        }

        if (str_starts_with($basename, '.env')) {
            return 'shell';
        }

        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

        return $this->languageMap[$extension] ?? 'plaintext';
    }

    /**
     * Check if a file matches the editable patterns.
     */
    public function isFileEditable(Project $project, string $relativePath): bool
    {
        $patterns = $project->editablePatterns();

        foreach ($patterns as $pattern) {
            if (fnmatch($pattern, $relativePath) || fnmatch($pattern, basename($relativePath))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Resolve a relative path to absolute and validate it's within the project.
     *
     * @throws \InvalidArgumentException
     */
    protected function resolveAndValidatePath(Project $project, string $relativePath): string
    {
        $relativePath = ltrim($relativePath, '/\\');

        $fullPath = $project->path.DIRECTORY_SEPARATOR.$relativePath;

        $realProjectPath = realpath($project->path);
        $realFilePath = realpath(dirname($fullPath));

        if ($realProjectPath === false) {
            throw new \InvalidArgumentException('Project path does not exist');
        }

        if ($realFilePath !== false && ! str_starts_with($realFilePath, $realProjectPath)) {
            throw new \InvalidArgumentException('Path traversal detected');
        }

        if ($realFilePath === false) {
            $normalizedPath = $this->normalizePath($fullPath);
            $normalizedProjectPath = $this->normalizePath($project->path);

            if (! str_starts_with($normalizedPath, $normalizedProjectPath)) {
                throw new \InvalidArgumentException('Path traversal detected');
            }

            return $normalizedPath;
        }

        return $realFilePath.DIRECTORY_SEPARATOR.basename($fullPath);
    }

    /**
     * Normalize a path without requiring it to exist.
     */
    protected function normalizePath(string $path): string
    {
        $parts = [];
        $path = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path);

        foreach (explode(DIRECTORY_SEPARATOR, $path) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }

            if ($part === '..') {
                array_pop($parts);
            } else {
                $parts[] = $part;
            }
        }

        $normalized = implode(DIRECTORY_SEPARATOR, $parts);

        return str_starts_with($path, DIRECTORY_SEPARATOR) ? DIRECTORY_SEPARATOR.$normalized : $normalized;
    }

    /**
     * Get the relative path from the project root.
     */
    protected function getRelativePath(string $projectPath, string $filePath): string
    {
        $projectPath = rtrim($projectPath, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;

        if (str_starts_with($filePath, $projectPath)) {
            return substr($filePath, strlen($projectPath));
        }

        return $filePath;
    }

    /**
     * Find files matching a glob pattern within a directory.
     *
     * @return array<int, string>
     */
    protected function findFilesMatchingPattern(string $directory, string $pattern): array
    {
        $files = [];

        try {
            $finder = new Finder;
            $finder->files()->in($directory)->depth(0)->ignoreDotFiles(false)->name($pattern);

            foreach ($finder as $file) {
                $files[] = $file->getPathname();
            }
        } catch (\Exception) {
            $matches = glob($directory.DIRECTORY_SEPARATOR.$pattern, GLOB_BRACE);
            if ($matches !== false) {
                $files = $matches;
            }
        }

        return $files;
    }
}
