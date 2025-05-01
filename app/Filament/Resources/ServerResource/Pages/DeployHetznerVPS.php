<?php

namespace App\Filament\Resources\ServerResource\Pages;

use App\Filament\Resources\ServerResource;
use Filament\Resources\Pages\Page;

class DeployHetznerVPS extends Page
{
    protected static string $resource = ServerResource::class;

    protected static string $view = 'filament.resources.server-resource.pages.deploy-hetzner-v-p-s';

    protected static ?string $title = 'Deploy Hetzner VPS';

}
