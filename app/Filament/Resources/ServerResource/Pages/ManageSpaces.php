<?php

namespace App\Filament\Resources\ServerResource\Pages;

use Filament\Resources\Pages\Concerns\InteractsWithRecord;
use Filament\Resources\Pages\Page;
use App\Filament\Resources\ServerResource;

class ManageSpaces extends Page
{
    use InteractsWithRecord;

    protected static string $resource = ServerResource::class;

    protected static string $view = 'filament.resources.server-resource.pages.manage-spaces';

    public string|int|null|\Illuminate\Database\Eloquent\Model $record;

    public function mount(int | string $record): void
    {
        $this->record = $this->resolveRecord($record);
    }
}
