<?php

namespace App\Data;

use App\Enums\ProjectStatus;

readonly class Project
{
    /**
     * @param  array<string, mixed>  $config
     */
    public function __construct(
        public string $path,
        public string $name,
        public ?string $description,
        public ProjectStatus $status,
        public array $config,
        public bool $isManual,
    ) {}

    /**
     * Get the encoded path for use in URLs.
     */
    public function encodedPath(): string
    {
        return base64_encode($this->path);
    }

    /**
     * Decode a path from URL format.
     */
    public static function decodePath(string $encoded): string
    {
        return base64_decode($encoded);
    }

    /**
     * Get the compose file path.
     */
    public function composeFile(): string
    {
        $file = $this->config['compose']['file'] ?? 'docker-compose.yml';

        return $this->path.DIRECTORY_SEPARATOR.$file;
    }

    /**
     * Get custom commands defined in the config.
     *
     * @return array<int, array{name: string, description: string, command: string}>
     */
    public function customCommands(): array
    {
        return $this->config['commands'] ?? [];
    }

    /**
     * Get editable file patterns.
     *
     * @return array<int, string>
     */
    public function editablePatterns(): array
    {
        return $this->config['editable_files'] ?? config('alfredo.default_editable_patterns', []);
    }

    /**
     * Convert to array for JSON serialization.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'path' => $this->path,
            'encoded_path' => $this->encodedPath(),
            'name' => $this->name,
            'description' => $this->description,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'status_color' => $this->status->color(),
            'is_manual' => $this->isManual,
            'custom_commands' => $this->customCommands(),
        ];
    }
}
