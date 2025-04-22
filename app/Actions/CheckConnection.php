<?php

namespace App\Actions;

use App\Helpers\SSHHelper;
use App\Models\Server;

class CheckConnection
{
    public function handle(Server $server): bool
    {
        $sshHelper = resolve(SSHHelper::class);

        $ssh = $sshHelper->connect($server);

        return $ssh->isConnected();
    }
}
