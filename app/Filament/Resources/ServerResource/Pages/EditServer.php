<?php

namespace App\Filament\Resources\ServerResource\Pages;

use App\Actions\CheckConnection;
use App\Actions\InvitationLinkGenerator;
use App\Filament\Resources\ServerResource;
use Facades\App\Helpers\Script;
use App\Models\Server;
use Filament\Actions;
use Filament\Notifications\Notification;
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
            Actions\Action::make('check_connection')
                ->label('Check connection')
                ->icon('heroicon-o-bolt')
                ->outlined()
                ->action($this->checkConnection(...)),
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

    private function checkConnection(CheckConnection $checkConnection): void
    {
        /** @var Server $server */
        $server = $this->record;

        $isConnected = $checkConnection->handle($server);

        if($isConnected) {
            Notification::make()
                ->title('Connection successful!')
                ->color('success')
                ->send();
        } else {
            Notification::make()
                ->title('Oh no! Connection failed!')
                ->color('danger')
                ->send();
        }
    }
}
