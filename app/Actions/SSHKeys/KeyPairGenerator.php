<?php

namespace App\Actions\SSHKeys;

use App\Enums\KeyPairType;
use App\Services\KeyPair;
use App\Services\TempDir;
use App\View\Components\Tasks\GenerateEd25519KeyPair;
use Exception;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

class KeyPairGenerator
{
    public function handle(KeyPairType $type): KeyPair
    {
        return match ($type) {
            KeyPairType::Ed25519 => $this->ed25519(),
            default => throw new Exception('Invalid key pair type.'),
        };
    }

    protected function ed25519(): KeyPair
    {
        $tmp_dir = TempDir::make();

        $privatePath = $tmp_dir->path('id_ed25519');

        $task = new GenerateEd25519KeyPair($privatePath);

        $result = Process::run($task->getScript());

        throw_unless($result->successful(), new Exception('Failed to generate ed25519 key pair.'));

        return new KeyPair(
            privateKey: File::get($tmp_dir->path('id_ed25519')),
            publicKey: File::get($tmp_dir->path('id_ed25519.pub')),
            type: KeyPairType::Ed25519,
        );
    }
}
