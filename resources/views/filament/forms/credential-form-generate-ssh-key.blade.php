<div x-data="{ state: $wire.$entangle('{{ $getStatePath() }}') }">
    <x-filament::button
        color="primary"
{{--        x-on:click="$wire.$set('data.private_key', 'foobaaar')"--}}
        x-on:click="
            $wire.call('generateKey')
                .then(r => {
                    $wire.$set('data.private_key', r.private_key)
                    $wire.$set('data.public_key', r.public_key)
                })
        "
        outlined="outlined"
    >
        Generate SSH Key
    </x-filament::button>
</div>
