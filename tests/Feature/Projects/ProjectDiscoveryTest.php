<?php

use App\Data\Project;
use App\Enums\ProjectStatus;
use App\Services\Projects\DockerComposeService;
use App\Services\Projects\ProjectDiscoveryService;
use Illuminate\Support\Facades\File;

beforeEach(function () {
    $this->tempDir = sys_get_temp_dir().'/alfredo-test-'.uniqid();
    File::makeDirectory($this->tempDir, 0755, true);

    config(['alfredo.scan_directories' => [$this->tempDir]]);
    config(['alfredo.manual_projects_file' => $this->tempDir.'/projects.json']);
});

afterEach(function () {
    File::deleteDirectory($this->tempDir);
});

test('discovers projects with alfredo.yml files', function () {
    $projectPath = $this->tempDir.'/my-project';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/alfredo.yml', "name: My Project\nversion: 1");
    File::put($projectPath.'/docker-compose.yml', "services:\n  app:\n    image: nginx");

    $dockerMock = Mockery::mock(DockerComposeService::class);
    $dockerMock->shouldReceive('getStatus')->andReturn(ProjectStatus::Unknown);

    $service = new ProjectDiscoveryService($dockerMock);
    $projects = $service->discover();

    expect($projects)->toHaveCount(1);
    expect($projects->first())->toBeInstanceOf(Project::class);
    expect($projects->first()->name)->toBe('My Project');
    expect($projects->first()->path)->toBe(realpath($projectPath));
});

test('returns empty collection when no projects found', function () {
    $dockerMock = Mockery::mock(DockerComposeService::class);
    $service = new ProjectDiscoveryService($dockerMock);

    $projects = $service->discover();

    expect($projects)->toHaveCount(0);
});

test('finds project by path', function () {
    $projectPath = $this->tempDir.'/find-test';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', "services:\n  app:\n    image: nginx");

    $dockerMock = Mockery::mock(DockerComposeService::class);
    $dockerMock->shouldReceive('getStatus')->andReturn(ProjectStatus::Unknown);

    $service = new ProjectDiscoveryService($dockerMock);
    $project = $service->findByPath($projectPath);

    expect($project)->toBeInstanceOf(Project::class);
    expect($project->path)->toBe(realpath($projectPath));
});

test('returns null for non-existent path', function () {
    $dockerMock = Mockery::mock(DockerComposeService::class);
    $service = new ProjectDiscoveryService($dockerMock);

    $project = $service->findByPath('/nonexistent/path');

    expect($project)->toBeNull();
});

test('adds manual project', function () {
    $projectPath = $this->tempDir.'/manual-project';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', "services:\n  app:\n    image: nginx");

    $dockerMock = Mockery::mock(DockerComposeService::class);
    $dockerMock->shouldReceive('getStatus')->andReturn(ProjectStatus::Unknown);

    $service = new ProjectDiscoveryService($dockerMock);
    $project = $service->addManualProject($projectPath, 'My Manual Project');

    expect($project->name)->toBe('My Manual Project');
    expect($project->isManual)->toBeTrue();
    expect($service->isManualProject($projectPath))->toBeTrue();
});

test('throws exception when adding non-existent path', function () {
    $dockerMock = Mockery::mock(DockerComposeService::class);
    $service = new ProjectDiscoveryService($dockerMock);

    $service->addManualProject('/nonexistent/path');
})->throws(InvalidArgumentException::class);

test('throws exception when path has no compose file', function () {
    $projectPath = $this->tempDir.'/no-compose';
    File::makeDirectory($projectPath);

    $dockerMock = Mockery::mock(DockerComposeService::class);
    $service = new ProjectDiscoveryService($dockerMock);

    $service->addManualProject($projectPath);
})->throws(InvalidArgumentException::class);

test('removes manual project', function () {
    $projectPath = $this->tempDir.'/remove-test';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', "services:\n  app:\n    image: nginx");

    $dockerMock = Mockery::mock(DockerComposeService::class);
    $dockerMock->shouldReceive('getStatus')->andReturn(ProjectStatus::Unknown);

    $service = new ProjectDiscoveryService($dockerMock);
    $service->addManualProject($projectPath);
    expect($service->isManualProject($projectPath))->toBeTrue();

    $service->removeManualProject($projectPath);
    expect($service->isManualProject($projectPath))->toBeFalse();
});

test('parses alfredo.yml config', function () {
    $configPath = $this->tempDir.'/config.yml';
    File::put($configPath, "name: Test Project\ndescription: A test\nversion: 1");

    $dockerMock = Mockery::mock(DockerComposeService::class);
    $service = new ProjectDiscoveryService($dockerMock);

    $config = $service->parseConfig($configPath);

    expect($config['name'])->toBe('Test Project');
    expect($config['description'])->toBe('A test');
});
