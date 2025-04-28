<div>
    @if ($header)
        <div class="flex gap-2">
            <h2>Task Monitor</h2>
        </div>
        @if ($isPollingActive)
            <div>
                <span class="text-sm"> Polling every {{ $pollingMs / 1000 }} seconds.</span>
                <span class="text-sm" wire:loading>
                    🔥🔥🔥
                </span>
            </div>
        @endif
    @endif
    @if($this->taskId)
        Output for Task: {{  $this->task->id }}
    @else
        Idle
    @endif
{{--    <x-server-task-ouput--}}
{{--        :descriptionJson="$this->task?->description"--}}
{{--        :$isPollingActive--}}
{{--        :$pollingMs />--}}
</div>
