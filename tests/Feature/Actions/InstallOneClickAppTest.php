<?php

use App\Models\Server;
use App\Enums\OneClickApp;
use App\Actions\CheckConnection;
use App\Actions\InstallOneClickApp;

test('we can install Directus', function () {

    $server = Server::factory()->localVM()->create();

    $installOneClickApp = app(InstallOneClickApp::class);

    $output = $installOneClickApp->handle(
        oneClickApp: OneClickApp::Directus,
        server: $server,
        slug: 'directus',
    );

    dd($output);
})->skip();
