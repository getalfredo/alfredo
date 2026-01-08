<?php

use App\Models\User;
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

test('guests are redirected to login', function () {
    $this->get(route('projects.index'))->assertRedirect(route('login'));
});

test('authenticated users can view projects index', function () {
    $this->actingAs($this->user)
        ->get(route('projects.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('projects/index'));
});

test('projects index shows discovered projects', function () {
    $projectPath = $this->tempDir.'/test-project';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/alfredo.yml', "name: Test Project\nversion: 1");
    File::put($projectPath.'/docker-compose.yml', "services:\n  app:\n    image: nginx");

    $this->actingAs($this->user)
        ->get(route('projects.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('projects/index')
            ->has('projects', 1)
            ->where('projects.0.name', 'Test Project')
        );
});

test('project show page displays project details', function () {
    $projectPath = $this->tempDir.'/show-project';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', "services:\n  app:\n    image: nginx");

    $encodedPath = base64_encode($projectPath);

    $this->actingAs($this->user)
        ->get(route('projects.show', $encodedPath))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('projects/show')
            ->has('project')
            ->has('services')
        );
});

test('project show redirects for non-existent project', function () {
    $encodedPath = base64_encode('/nonexistent/path');

    $this->actingAs($this->user)
        ->get(route('projects.show', $encodedPath))
        ->assertRedirect(route('projects.index'));
});

test('can add manual project with valid path', function () {
    $projectPath = $this->tempDir.'/manual-add';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', "services:\n  app:\n    image: nginx");

    $this->actingAs($this->user)
        ->post(route('projects.store'), [
            'path' => $projectPath,
            'name' => 'Manual Project',
        ])
        ->assertRedirect();
});

test('cannot add manual project without compose file', function () {
    $projectPath = $this->tempDir.'/no-compose';
    File::makeDirectory($projectPath);

    $this->actingAs($this->user)
        ->post(route('projects.store'), [
            'path' => $projectPath,
        ])
        ->assertSessionHasErrors('path');
});

test('cannot add manual project with non-existent path', function () {
    $this->actingAs($this->user)
        ->post(route('projects.store'), [
            'path' => '/nonexistent/path',
        ])
        ->assertSessionHasErrors('path');
});

test('can remove manual project', function () {
    $projectPath = $this->tempDir.'/remove-project';
    File::makeDirectory($projectPath);
    File::put($projectPath.'/docker-compose.yml', "services:\n  app:\n    image: nginx");

    $this->actingAs($this->user)
        ->post(route('projects.store'), [
            'path' => $projectPath,
        ]);

    $encodedPath = base64_encode($projectPath);

    $this->actingAs($this->user)
        ->delete(route('projects.destroy', $encodedPath))
        ->assertRedirect(route('projects.index'));
});
