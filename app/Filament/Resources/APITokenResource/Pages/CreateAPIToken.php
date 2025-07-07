<?php

namespace App\Filament\Resources\APITokenResource\Pages;

use App\Filament\Resources\APITokenResource;
use App\Models\User;
use Filament\Actions;
use Filament\Resources\Pages\CreateRecord;

class CreateAPIToken extends CreateRecord
{
    protected static string $resource = APITokenResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        return [
            ...$data,
            'tokenable_type' => User::class,
            'tokenable_id' => auth()->id(),
        ];
    }
}
