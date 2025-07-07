<?php

namespace App\Filament\Resources\APITokenResource\Pages;

use App\Filament\Resources\APITokenResource;
use Filament\Actions;
use Filament\Resources\Pages\ListRecords;

class ListAPITokens extends ListRecords
{
    protected static string $resource = APITokenResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\CreateAction::make(),
        ];
    }
}
