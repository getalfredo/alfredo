<?php

namespace App\Filament\Resources;

use App\Filament\Resources\APITokenResource\Pages;
use App\Filament\Resources\APITokenResource\RelationManagers;
use App\Models\APIToken;
use App\Models\User;
use Filament\Forms;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

class APITokenResource extends Resource
{
    protected static ?string $model = APIToken::class;

    protected static ?string $navigationGroup = 'Credentials';

    protected static ?string $label = 'API Token';

    protected static ?string $pluralLabel = 'API Tokens';

    protected static ?string $navigationIcon = 'heroicon-o-key';

    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()
            ->whereHasMorph(
                relation: 'tokenable',
                types: [User::class],
                callback: function (Builder $query) {
                    $query->where('id', auth()->user()->id);
                });
    }

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                TextInput::make('name')
                    ->required()
                    ->maxLength(255),
                TextInput::make('value')
                    ->password()
                    ->revealable()
                    ->required()
                    ->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('name')
                    ->searchable(),
                Tables\Columns\TextColumn::make('created_at')
                    ->dateTime()
                    ->sortable(),
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
            'index' => Pages\ListAPITokens::route('/'),
            'create' => Pages\CreateAPIToken::route('/create'),
            'edit' => Pages\EditAPIToken::route('/{record}/edit'),
        ];
    }
}
