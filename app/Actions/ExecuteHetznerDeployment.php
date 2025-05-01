<?php

namespace App\Actions;

use App\Data\DeployHetznerVPSArgsData;
use App\Services\KeyPair;
use Illuminate\Support\Facades\Process;

class ExecuteHetznerDeployment
{
    public function handle(DeployHetznerVPSArgsData $args)
    {
        // TODO: HETZNER_API_KEY missing in the Arguments

        $argsArray = [
            ...$args->toArray(),
            'AUTHORIZED_SSH_KEYS' => collect($args->authorized_ssh_keys)
                ->map(fn(KeyPair $keyPair) => $keyPair->toArray())
                ->toArray(),
        ];

        $result = Process::timeout(60)
                ->path(base_path('ansible'))
                ->run([
                    'ansible-playbook',
                    '--extra-vars',
                    json_encode($argsArray),
                    'playbooks/create-vps-hetzner.yml',
                ], output: function ($type, $output) {
                    echo $output;
                });


        dd($argsArray, $result->exitCode(), $result->output(), $result->errorOutput());

        return true;
    }
}
