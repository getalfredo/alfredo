<?php

namespace App\Filament\Resources\ServerResource\Pages;

use Filament\Actions;
use Facades\App\Helpers\Script;
use Filament\Resources\Pages\EditRecord;
use App\Filament\Resources\ServerResource;

class EditServer extends EditRecord
{
    protected static string $resource = ServerResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\ActionGroup::make([
                Actions\DeleteAction::make(),
            ])
        ];
    }
}
