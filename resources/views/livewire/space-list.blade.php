<div
    wire:init="loadSpaces"
>
    <div wire:loading class="text-2xl font-bold">
        Updating information...
    </div>

    @if($this->isSpacesFolderAbsent)
        <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ __('Spaces folder not found') }}
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ __('Please click the button to create it.') }}
            </p>
            <div class="mt-2">
                <x-filament::button
                    wire:click="createSpacesFolder"
                    wire:loading.attr="disabled"
                    size="xs"
                >
                    {{ __('Create Spaces folder') }}
                </x-filament::button>
            </div>
        </div>
    @endif

    <div class="flex flex-col gap-6">
        @foreach($this->spaces as $spacePath)
            <x-filament::section
                :heading="str($spacePath)->afterLast('/')"
            >

            </x-filament::section>
        @endforeach
    </div>
</div>
