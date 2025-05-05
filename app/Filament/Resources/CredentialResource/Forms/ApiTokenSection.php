<?php

namespace App\Filament\Resources\CredentialResource\Forms;

use App\Enums\CredentialType;
use App\Models\Credential;
use Filament\Forms\Components\Section;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Get;

class ApiTokenSection
{
    public static function get()
    {
        return Section::make('Credential')
            ->visible(function (Get $get) {
                return $get(Credential::$typeAttr) === CredentialType::API_TOKEN->value;
            })
            ->schema([
                TextInput::make('value')
                    ->password()
                    ->revealable()
                    ->required()
                    ->columnSpanFull(),
            ])
            ->columns()
            ->columnSpanFull();
    }
}
