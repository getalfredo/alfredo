<?php

namespace App\Actions;

use App\Helpers\SSHHelper;
use App\Models\Server;

class CreateSpacesDirectory
{
    public function __construct(
        protected SSHHelper $sshHelper,
    ){}

    public function handle(Server $server): string
    {
        $ssh = $this->sshHelper->connect($server);

        $spacesPath = escapeshellarg($server->spaces_folder_path);

        $output = $ssh->exec("mkdir -p {$spacesPath}");

        return $output;
    }

}
