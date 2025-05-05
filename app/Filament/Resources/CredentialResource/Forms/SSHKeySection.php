<?php

namespace App\Filament\Resources\CredentialResource\Forms;

use App\Enums\CredentialType;
use App\Filament\Resources\CredentialResource;
use App\Models\Credential;
use Filament\Forms\Components\Placeholder;
use Filament\Forms\Components\Section;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\ViewField;
use Filament\Forms\Get;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\HtmlString;

class SSHKeySection
{
    public static function get()
    {
        return Section::make('Credential')
            ->description(function ($operation) {
                return $operation === 'create'
                    ? 'Create a new SSH key'
                    : 'Expand to view the SSH key';
            })
            ->collapsible()
            ->collapsed(fn($operation) => $operation === 'edit')
            ->visible(function (Get $get) {
                return $get(Credential::$typeAttr) === CredentialType::SSH_KEY->value;
            })
            ->schema([
                ViewField::make('generate_key_button')
                    ->visibleOn('create')
                    ->hiddenLabel()
                    ->columnSpanFull()
                    ->disabled() # Do not submit this state
                    ->view('filament.forms.credential-form-generate-ssh-key'),
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

    protected static function generateKeyContent(): HtmlString
    {
        $html = <<<HTML

        <div>
            <x-filament::button color="primary" outlined wire:click="generateKey">
                Generate SSH Key
            </x-filament::button>
        </div>

        HTML;

        return new HtmlString(
            Blade::render($html)
        );
    }
}
