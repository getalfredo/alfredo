<?php

namespace App\Filament\Resources\CredentialResource\Forms;

use App\Enums\CredentialType;
use App\Filament\Resources\CredentialResource;
use App\Models\Credential;
use Filament\Forms\Components\Section;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Get;

class SSHKeySection
{
    public static function get()
    {
        return Section::make('Credential')
            ->visible(function (Get $get) {
                return $get(Credential::$typeAttr) === CredentialType::SSH_KEY->value;
            })
            ->schema([
                TextInput::make('username')
                    ->maxLength(255),
                TextInput::make('password')
                    ->password()
                    ->revealable()
                    ->maxLength(255),
                Textarea::make('public_key')
                    ->required(function (Get $get) {
                        return $get(Credential::$typeAttr) === CredentialType::SSH_KEY->value;
                    })
                    ->columnSpanFull(),
                Textarea::make('private_key')
                    ->required(function (Get $get) {
                        return $get(Credential::$typeAttr) === CredentialType::SSH_KEY->value;
                    })
                    ->columnSpanFull(),
            ])
            ->columns()
            ->columnSpanFull();
    }

}
