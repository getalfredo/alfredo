<?php

namespace App\Livewire;

use App\Actions\ExecuteHetznerDeployment;
use App\Data\DeployHetznerVPSArgsData;
use Filament\Forms\Components\Repeater;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Forms\Concerns\InteractsWithForms;
use Filament\Forms\Contracts\HasForms;
use Filament\Forms\Form;
use Livewire\Component;

class DeployHetznerVPSForm extends Component implements HasForms
{
    use InteractsWithForms;

    public ?array $data = [];

    public function mount(): void
    {
        $this->form->fill();
    }

    public function form(Form $form): Form
    {
        return $form
            ->schema([
                TextInput::make('name')
                    ->required(),
                Select::make('server_type')
                    ->required()
                    ->options([
                        'cpx11' => 'CPX11 - 2 vCPU, 2 GB RAM, 40 GB SSD',
                    ]),
                Select::make('datacenter')
                    ->required()
                    ->options([
                        'nbg1-dc3' => 'nbg1-dc3 Nuremberg',
                    ]),
                Select::make('image')
                    ->required()
                    ->options([
                        'ubuntu-24.04' => 'Ubuntu 24.04',
                    ]),
                Toggle::make('monitoring')
                    ->default(true),
                Toggle::make('backups')
                    ->default(true)
                    ->label('Enable Backups: it incurs in additional costs. Check them out, or disable backups.'),
                TextInput::make('username')
                    ->required(),
                TextInput::make('user_password')
                    ->required(),
                Repeater::make('authorized_ssh_keys')
                    ->required()
                    ->minItems(1)
                    ->collapsible()
                    ->schema([
                        TextInput::make('private_key')
                            ->label('Private Key'),
                        TextInput::make('public_key')
                            ->label('Public Key'),
                    ]),
                Repeater::make('hetzner_ssh_keys')
                    ->addActionLabel('Hetzner SSH Keys')
                    ->helperText('Matches the Key name in Hetzner Dashboard.')
                    ->simple(TextInput::make('private_key'))
                    ->label('SSH Key Name'),
            ])
            ->statePath('data');
    }

    public function create(ExecuteHetznerDeployment $executeHetznerDeployment): void
    {
        ray(
            $this->form->getState()
        );

        $result = $executeHetznerDeployment->handle(
            DeployHetznerVPSArgsData::from($this->form->getState())
        );

        dd('Deploying Hetzner VPS', $result);
    }

    public function render()
    {
        return view('livewire.deploy-hetzner-vps-form');
    }
}
