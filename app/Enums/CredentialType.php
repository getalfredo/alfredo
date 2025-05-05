<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum CredentialType: string implements HasLabel
{
    case API_TOKEN = 'api_token';
    case SSH_KEY = 'ssh_key';

    public function getLabel(): ?string
    {
        return match ($this) {
            self::API_TOKEN => 'API Token',
            self::SSH_KEY => 'SSH Key',
        };
    }
}
