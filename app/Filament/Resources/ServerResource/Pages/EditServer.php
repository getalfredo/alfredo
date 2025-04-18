<?php

namespace App\Filament\Resources\ServerResource\Pages;

use App\Actions\InvitationLinkGenerator;
use App\Filament\Resources\ServerResource;
use Facades\App\Helpers\Script;
use App\Models\Server;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditServer extends EditRecord
{
    protected static string $resource = ServerResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\Action::make('generate_invitation')
                ->label('Generate Invitation Link')
                ->icon('heroicon-o-link')
                ->outlined()
                ->action($this->generateInvitation(...))
                ->requiresConfirmation(),
            Actions\ActionGroup::make([
                Actions\DeleteAction::make(),
            ])
        ];
    }

    private function generateInvitation(InvitationLinkGenerator $linkGenerator): void
    {
        /** @var Server $server */
        $server = $this->record;

        $invitationURLScript = $linkGenerator->handle($server);

        $command = Script::wrapCurl($invitationURLScript);

        dd($command);
    }
}
