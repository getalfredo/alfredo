<?php

use App\Data\Project;
use App\Enums\ProjectStatus;
use App\Models\User;
use App\Services\Projects\ProjectFileService;
use Illuminate\Support\Facades\File;

beforeEach(function () {
    $this->tempDir = sys_get_temp_dir().'/alfredo-test-'.uniqid();
    File::makeDirectory($this->tempDir, 0755, true);

    config(['alfredo.scan_directories' => [$this->tempDir]]);
    config(['alfredo.manual_projects_file' => $this->tempDir.'/projects.json']);

    $this->user = User::factory()->create();
});

afterEach(function () {
    File::deleteDirectory($this->tempDir);
});

test('lists editable files based on patterns', function () {
    $projectPath = $this->tempDir.'/file-test';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', 'services:');
    File::put($projectPath.'/.env', 'APP_NAME=Test');
    File::put($projectPath.'/README.md', '# Test');

    $project = new Project(
        path: $projectPath,
        name: 'Test',
        description: null,
        status: ProjectStatus::Unknown,
        config: [],
        isManual: false,
    );

    $service = new ProjectFileService;
    $files = $service->getEditableFiles($project);

    $names = array_column($files, 'name');
    expect($names)->toContain('docker-compose.yml');
    expect($names)->toContain('.env');
    expect($names)->not->toContain('README.md');
});

test('gets file content', function () {
    $projectPath = $this->tempDir.'/content-test';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', 'services: test');

    $project = new Project(
        path: $projectPath,
        name: 'Test',
        description: null,
        status: ProjectStatus::Unknown,
        config: [],
        isManual: false,
    );

    $service = new ProjectFileService;
    $content = $service->getFileContent($project, 'docker-compose.yml');

    expect($content)->toBe('services: test');
});

test('updates file content', function () {
    $projectPath = $this->tempDir.'/update-test';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', 'old content');

    $project = new Project(
        path: $projectPath,
        name: 'Test',
        description: null,
        status: ProjectStatus::Unknown,
        config: [],
        isManual: false,
    );

    $service = new ProjectFileService;
    $service->updateFile($project, 'docker-compose.yml', 'new content');

    expect(File::get($projectPath.'/docker-compose.yml'))->toBe('new content');
});

test('prevents path traversal', function () {
    $projectPath = $this->tempDir.'/traversal-test';
    File::makeDirectory($projectPath);

    $project = new Project(
        path: $projectPath,
        name: 'Test',
        description: null,
        status: ProjectStatus::Unknown,
        config: [],
        isManual: false,
    );

    $service = new ProjectFileService;
    $service->getFileContent($project, '../../../etc/passwd');
})->throws(InvalidArgumentException::class);

test('detects language from file extension', function () {
    $service = new ProjectFileService;

    expect($service->detectLanguage('test.yml'))->toBe('yaml');
    expect($service->detectLanguage('test.json'))->toBe('json');
    expect($service->detectLanguage('test.php'))->toBe('php');
    expect($service->detectLanguage('.env'))->toBe('shell');
    expect($service->detectLanguage('Dockerfile'))->toBe('dockerfile');
});

test('file controller requires authentication', function () {
    $encodedPath = base64_encode('/some/path');

    $this->get(route('projects.files.index', $encodedPath))
        ->assertRedirect(route('login'));
});

test('authenticated users can view files index', function () {
    $projectPath = $this->tempDir.'/files-index';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', 'services:');

    $encodedPath = base64_encode($projectPath);

    $this->actingAs($this->user)
        ->get(route('projects.files.index', $encodedPath))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('projects/files')
            ->has('project')
            ->has('files')
        );
});

test('can read file content via api', function () {
    $projectPath = $this->tempDir.'/api-read';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', 'services: api-test');

    $encodedPath = base64_encode($projectPath);

    $this->actingAs($this->user)
        ->get(route('projects.files.show', [$encodedPath, 'docker-compose.yml']))
        ->assertOk()
        ->assertJson([
            'content' => 'services: api-test',
            'language' => 'yaml',
        ]);
});

test('can update file content via api', function () {
    $projectPath = $this->tempDir.'/api-update';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', 'old');

    $encodedPath = base64_encode($projectPath);

    $this->actingAs($this->user)
        ->put(route('projects.files.update', [$encodedPath, 'docker-compose.yml']), [
            'content' => 'new content',
        ])
        ->assertOk()
        ->assertJson(['success' => true]);

    expect(File::get($projectPath.'/docker-compose.yml'))->toBe('new content');
});
