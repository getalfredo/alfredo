<?php

namespace App\Filament\Resources\CredentialResource\Pages;

use App\Actions\KeyPairGenerator;
use App\Filament\Resources\CredentialResource;
use Filament\Resources\Pages\CreateRecord;
use Livewire\Attributes\Renderless;
use phpseclib3\Crypt\EC;

class CreateCredential extends CreateRecord
{
    protected static string $resource = CredentialResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        return [
            ...$data,
            'user_id' => auth()->id(),
        ];
    }

    #[Renderless]
    public function generateKey(KeyPairGenerator $generator)
    {
        // Create a new Ed25519 private key
        $private = EC::createKey('Ed25519');

        // Get the public key
        $public = $private->getPublicKey();

        // Save the key
        $privateKeyFormat = $private->toString('OpenSSH');
        $publicKeyFormat = $public->toString('OpenSSH');

        return [
            'private_key' => $privateKeyFormat,
            'public_key' => $publicKeyFormat,
        ];
    }
}
