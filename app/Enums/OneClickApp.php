<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum OneClickApp: string implements HasLabel
{
    case Directus = 'directus';

    public function getLabel(): ?string
    {
        return match($this) {
            self::Directus => 'Directus',
        };
    }
}
