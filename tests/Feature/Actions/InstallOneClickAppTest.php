<?php

use App\Models\Server;
use App\Enums\OneClickApp;
use App\Actions\CheckConnection;
use App\Actions\InstallOneClickApp;

test('we can SSH into to the local-vm', function () {

    $server = Server::factory()->localVM()->create();

    $checkConnection = app(CheckConnection::class);
    $result = $checkConnection->handle($server);
    expect($result)->toBeTrue();
});

test('we can install Directus', function () {

    $server = Server::factory()->localVM()->create();

    $installOneClickApp = app(InstallOneClickApp::class);

    $output = $installOneClickApp->handle(
        oneClickApp: OneClickApp::Directus,
        server: $server,
        slug: 'directus',
    );

    dd($output);
});
