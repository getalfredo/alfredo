<?php

namespace App\Livewire;

use App\Actions\CreateSpacesDirectory;
use App\Actions\ListSpaces;
use App\Models\Server;
use Livewire\Attributes\Locked;
use Livewire\Component;

class SpaceList extends Component
{
    #[Locked]
    public Server $server;

    #[Locked]
    public bool $isSpacesFolderAbsent = false;

    /**
     * Each string is a directory name of a space.
     *
     * @var array<string>
     */
    #[Locked]
    public array $spaces = [];

    public function loadSpaces(ListSpaces $listSpaces)
    {
        $output = $listSpaces->handle($this->server);

        if (str($output)->contains('No such file or directory')) {
            $this->isSpacesFolderAbsent = true;
        } else {
            $this->spaces = collect(explode("\n", $output))
                ->filter(fn($path) => str($path)
                    ->startsWith($this->server->spaces_folder_path)
                )
                ->toArray();
        }
    }

    public function createSpacesFolder(CreateSpacesDirectory $createSpacesDirectory)
    {
        $createSpacesDirectory->handle($this->server);

        $this->isSpacesFolderAbsent = false;

        app()->call($this->loadSpaces(...));
    }

    public function render()
    {
        return view('livewire.space-list');
    }
}
