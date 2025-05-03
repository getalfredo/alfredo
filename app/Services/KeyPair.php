<?php

namespace App\Services;

use App\Enums\KeyPairType;
use App\Models\Server;
use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Support\Facades\File;

class KeyPair implements Arrayable
{
    public function __construct(
        public readonly string $privateKey,
        public readonly string $publicKey,
        public readonly KeyPairType $type,
        protected ?TempDir $tmp_path = null,
    ) {}

    public static function makeFromServerEd25519(Server $server)
    {
        return new static(
            privateKey: $server->private_key,
            publicKey: $server->public_key,
            type: KeyPairType::Ed25519,
        );
    }

    public function deployTo(TempDir $tmp_dir)
    {
        File::put($tmp_dir('public_key'), $this->publicKey);
        File::put($tmp_dir('private_key'), $this->privateKey);
        File::chmod($tmp_dir('private_key'), 0600);
    }

    public function toArray(): array
    {
        return [
            'privateKey' => $this->privateKey,
            'publicKey' => $this->publicKey,
        ];
    }
}
