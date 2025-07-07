<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SSHKeyResource\Pages;
use App\Filament\Resources\SSHKeyResource\RelationManagers;
use App\Models\SSHKey;
use Filament\Forms;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

class SSHKeyResource extends Resource
{
    protected static ?string $model = SSHKey::class;

    protected static ?string $navigationGroup = 'Credentials';

    protected static ?string $label = 'SSH Key';

    protected static ?string $pluralLabel = 'SSH Keys';

    protected static ?string $navigationIcon = 'heroicon-o-key';

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Textarea::make('public_key')
                    ->required()
                    ->columnSpanFull(),
                Textarea::make('private_key')
                    ->required()
                    ->columnSpanFull(),

            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                //
            ])
            ->filters([
                //
            ])
            ->actions([
//                Tables\Actions\EditAction::make(),
            ])
            ->bulkActions([
//                Tables\Actions\BulkActionGroup::make([
//                    Tables\Actions\DeleteBulkAction::make(),
//                ]),
            ]);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListSSHKeys::route('/'),
            'create' => Pages\CreateSSHKey::route('/create'),
            'edit' => Pages\EditSSHKey::route('/{record}/edit'),
        ];
    }
}
