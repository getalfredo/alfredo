<?php

namespace App\Filament\Resources\ServerResource\Pages;

use App\Actions\InstallOneClickApp;
use App\Enums\OneClickApp;
use App\Models\Server;
use Filament\Actions\Action;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Pages\Concerns\InteractsWithRecord;
use Filament\Resources\Pages\Page;
use App\Filament\Resources\ServerResource;
use Illuminate\Database\Eloquent\Model;

class ManageSpaces extends Page
{
    use InteractsWithRecord;

    protected static string $resource = ServerResource::class;

    protected static string $view = 'filament.resources.server-resource.pages.manage-spaces';

    public string|int|null|Model $record;

    public function mount(int|string $record): void
    {
        $this->record = $this->resolveRecord($record);
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('install_1_click_app')
                ->label("Install 1-Click App")
                ->form([
                    TextInput::make('slug')
                        ->label('Slug')
                        ->required()
                        ->helperText('It will be the directory name. Only alphanumeric characters and dashes are allowed.'),
                    Select::make('application')
                        ->options(OneClickApp::class)
                ])
                ->action($this->installOneClickApp(...)),
            Action::make('install_custom_git_app')
                ->label("Install Custom Git App")
                ->disabled(),
            Action::make('install_git_app_template')
                ->label("Install Git App Template")
                ->disabled(),
        ];
    }

    protected function installOneClickApp($data, InstallOneClickApp $installOneClickApp): void
    {
        $slug = data_get($data, 'slug');

        $app = data_get($data, 'application');
        $app = OneClickApp::tryFrom($app);

        /** @var Server $server */
        $server = $this->record;

        $installOneClickApp->handle(
            oneClickApp: $app,
            server: $server,
            slug: $slug,
        );
    }
}
