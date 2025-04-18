<?php

namespace App\Filament\Pages;

use Filament\Pages\Page;

class Diagnostics extends Page
{
    protected static ?string $navigationIcon = 'heroicon-c-wrench';

    protected static string $view = 'filament.pages.diagnostics';

    protected static ?int $navigationSort = 2;

    public function generateInvitation()
    {
        dd('hello');
    }
}
