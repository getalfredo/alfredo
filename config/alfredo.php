<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Scan Directories
    |--------------------------------------------------------------------------
    |
    | Directories to scan for projects containing alfredo.yml files.
    | These paths will be recursively searched for project configurations.
    |
    */

    'scan_directories' => array_filter(
        explode(',', (string) env('ALFREDO_SCAN_DIRECTORIES', '')),
        fn ($path) => ! empty(trim($path))
    ),

    /*
    |--------------------------------------------------------------------------
    | Command Timeout
    |--------------------------------------------------------------------------
    |
    | Maximum time in seconds to wait for a Docker Compose command to complete.
    | Long-running commands like build or pull may need more time.
    |
    */

    'command_timeout' => (int) env('ALFREDO_COMMAND_TIMEOUT', 300),

    /*
    |--------------------------------------------------------------------------
    | Max Log Lines
    |--------------------------------------------------------------------------
    |
    | Maximum number of log lines to retrieve when fetching container logs.
    |
    */

    'max_log_lines' => (int) env('ALFREDO_MAX_LOG_LINES', 1000),

    /*
    |--------------------------------------------------------------------------
    | Manual Projects File
    |--------------------------------------------------------------------------
    |
    | Path to the JSON file storing manually-added project paths.
    |
    */

    'manual_projects_file' => storage_path('app/projects.json'),

    /*
    |--------------------------------------------------------------------------
    | Default Editable File Patterns
    |--------------------------------------------------------------------------
    |
    | Default glob patterns for files that can be edited when not specified
    | in the project's alfredo.yml configuration.
    |
    */

    'default_editable_patterns' => [
        'docker-compose*.yml',
        'docker-compose*.yaml',
        '.env*',
        'Dockerfile*',
    ],

    /*
    |--------------------------------------------------------------------------
    | Allowed Commands
    |--------------------------------------------------------------------------
    |
    | Whitelist of Docker Compose commands that can be executed.
    |
    */

    'allowed_commands' => [
        'up',
        'down',
        'restart',
        'logs',
        'ps',
        'pull',
        'build',
        'exec',
        'stop',
        'start',
    ],

];
