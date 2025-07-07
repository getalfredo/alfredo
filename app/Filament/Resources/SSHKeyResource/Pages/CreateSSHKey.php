<?php

namespace App\Filament\Resources\SSHKeyResource\Pages;

use App\Filament\Resources\SSHKeyResource;
use App\Models\User;
use Filament\Actions;
use Filament\Resources\Pages\CreateRecord;

class CreateSSHKey extends CreateRecord
{
    protected static string $resource = SSHKeyResource::class;
}
