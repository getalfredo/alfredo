<?php

namespace App\Filament\Pages;

use Filament\Pages\Page;

class KitchenSink extends Page
{
    protected static ?string $navigationIcon = 'heroicon-c-wrench';

    protected static string $view = 'filament.pages.kitchen-sink';

    protected static ?int $navigationSort = 2;

    public function generateInvitation()
    {
        dd('hello');
    }
}
