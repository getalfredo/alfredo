<?php

namespace App\Actions;

use App\Models\Server;
use phpseclib3\Crypt\PublicKeyLoader;
use phpseclib3\Net\SSH2;

class CheckConnection
{
    public function handle(Server $server): bool
    {
        $user = $server->username;
        $hostname = $server->public_ipv4;
        $port = $server->ssh_port;
        $key = $server->private_key;

        // Load the key properly
        $keyObject = PublicKeyLoader::load($key);

        $ssh = new SSH2($hostname, $port);


        if (! $ssh->login($user, $keyObject)) {
            throw new \Exception('Login failed using key');
        }

        return $ssh->isConnected();
    }
}
