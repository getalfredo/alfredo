<?php

namespace App\Actions;

use App\Helpers\SSHHelper;
use App\Models\Server;

class ListSpaces
{
    public function __construct(
        protected SSHHelper $sshHelper,
    ){}

    public function handle(Server $server): string
    {
        $ssh = $this->sshHelper->connect($server);

        $output = $ssh->exec($this->listCommand($server));

        return $output;
    }

    private function listCommand(Server $server): string
    {
        $configFilename = 'alfredo.yml';

        $spacesPath = escapeshellarg($server->spaces_folder_path);

        return "find {$spacesPath} -type f -name \"{$configFilename}\" -exec dirname {} \\;";
    }
}
