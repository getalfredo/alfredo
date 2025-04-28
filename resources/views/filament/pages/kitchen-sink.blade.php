<x-filament-panels::page>
    <div>

        {{-- Invitation Widget --}}
        <x-filament::section
            heading="Generate Invitation"
            description="Generate an invitation to add a server to the system inventory."
        >
            <x-filament::button
                wire:click="generateInvitation"
            >
                Generate
            </x-filament::button>
        </x-filament::section>

        {{-- Invitation Widget --}}
        <livewire:kitchen-sink.run-a-task />

    </div>
</x-filament-panels::page>
