<?php

namespace App\Filament\Resources\SSHKeyResource\Pages;

use App\Filament\Resources\SSHKeyResource;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditSSHKey extends EditRecord
{
    protected static string $resource = SSHKeyResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\DeleteAction::make(),
        ];
    }
}
