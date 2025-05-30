<div class="mt-10">
     <x-filament::section
         heading="Task Runner"
         description="Run a long task and watch output live"
     >
         <x-filament::button
             wire:click="runDummyTask"
         >
             Run a dummy task
         </x-filament::button>

         <hr class="my-6"/>

         <livewire:task-monitor />

     </x-filament::section>
</div>
