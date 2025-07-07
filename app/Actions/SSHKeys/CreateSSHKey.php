<?php

namespace App\Actions\SSHKeys;

use App\Enums\KeyPairType;
use App\Services\KeyPair;
use phpseclib3\Crypt\EC;

class CreateSSHKey
{
    public function handle(): KeyPair
    {
        // Create a new Ed25519 private key
        $private = EC::createKey('Ed25519');

        // Get the public key
        $public = $private->getPublicKey();

        return new KeyPair(
            privateKey: $private->toString('OpenSSH'),
            publicKey: $public->toString('OpenSSH'),
            type: KeyPairType::Ed25519,
        );
    }
}
