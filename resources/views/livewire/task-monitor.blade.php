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

    <div
        @if ($isPollingActive) wire:poll.{{ $pollingMs }}ms="polling" @endif
    >
        <div
            class="scrollbar flex flex-col-reverse w-full overflow-y-auto border border-solid rounded border-gray-300 max-h-[32rem] p-4 text-xs"
        >
        <pre
            class="font-mono whitespace-pre-wrap"
            @if ($isPollingActive) wire:poll.{{ $pollingMs }}ms="polling" @endif
        >{{ \App\Actions\ExecuteServerTask::decodeOutput($this->task?->output) }}</pre>
        </div>
    </div>


</div>
