<?php

namespace App\Filament\Resources\ServerResource\Pages;

use App\Filament\Resources\ServerResource;
use Filament\Actions;
use Filament\Resources\Pages\ListRecords;

class ListServers extends ListRecords
{
    protected static string $resource = ServerResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\CreateAction::make()
                ->label('Add existing server'),
            Actions\Action::make('deploy_hetzner_vps')
                ->label('Deploy Hetzner VPS')
                ->url(ServerResource::getUrl('deploy-hetzner-vps')),
        ];
    }
}
