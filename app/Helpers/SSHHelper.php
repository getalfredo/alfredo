<?php

namespace App\Helpers;

use App\Models\Server;
use phpseclib3\Crypt\PublicKeyLoader;
use phpseclib3\Net\SSH2;

class SSHHelper
{
    protected SSH2 $ssh;

    public function connect(Server $server): SSH2
    {
        $user = $server->username;
        $hostname = $server->public_ipv4;
        $port = $server->ssh_port;
        $key = $server->private_key;

        // Load the key properly
        $keyObject = PublicKeyLoader::load($key);

        $this->ssh = new SSH2($hostname, $port);

        if (! $this->ssh->login($user, $keyObject)) {
            throw new \Exception('Login failed using key');
        }

        return $this->ssh;
    }
}
