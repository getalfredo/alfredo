<?php

namespace App\Actions;

use App\Enums\OneClickApp;
use App\Helpers\SSHHelper;
use App\Models\Server;
use Illuminate\Support\Facades\File;

class InstallOneClickApp
{
    public function __construct(
        protected SSHHelper $sshHelper
    ) {}

    public function handle(OneClickApp $oneClickApp, Server $server, string $slug): string
    {
        try {
            $ssh = $this->sshHelper->connect($server);
        } catch (\Throwable $exception) {
            return 'Could not connect to the server. Please check your SSH settings.';
        }

        $spacePath = $server->spaces_folder_path . '/' . $slug;

        $output = $ssh->exec("mkdir -p {$spacePath}");

        $directusComposeContent = File::get(resource_path('spaces/Directus/docker-compose.yml'));
        $b64_directusComposeContent = base64_encode($directusComposeContent);

        // Write the docker-compose.yml file to the server, on the space path
        $output = $ssh->exec(sprintf(
            "echo '%s' | base64 -d > %s/docker-compose.yml",
            $b64_directusComposeContent,
            $spacePath
        ));

        dd($output);

        return 'Done!';
    }
}
