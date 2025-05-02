<?php

namespace App\Actions;

use App\Data\DeployHetznerVPSArgsData;
use App\Enums\ServerStatus;
use App\Models\Server;
use App\Services\KeyPair;
use Illuminate\Support\Facades\Process;
use phpDocumentor\Reflection\Exception;

class ExecuteHetznerDeployment
{
    public function handle(DeployHetznerVPSArgsData $args): bool
    {
        $credential = auth()
            ->user()
            ->credentials()
            ->where('uuid', $args->credential_id)
            ->sole();

        $argsArray = [
            ...$args->toArray(),
            'AUTHORIZED_SSH_KEYS' => collect($args->authorized_ssh_keys)
                ->map(fn(KeyPair $keyPair) => $keyPair->publicKey)
                ->toArray(),
            'HETZNER_API_TOKEN' => $credential->value,
        ];

        unset($argsArray['CREDENTIAL_ID']);

        $isHittingHetzerApiEnabled = true;

        if ($isHittingHetzerApiEnabled) {

            $result = Process::timeout(60)
                    ->path(base_path('ansible'))
                    ->run([
                        'ansible-playbook',
                        '--extra-vars',
                        json_encode($argsArray),
                        'playbooks/create-vps-hetzner.yml',
                    ], output: function ($type, $output) {
                        echo $output;
                    })
                    ->throw();
            $processOutput = $result->output();

            \File::put(base_path('ansible_playbook_output'), $result->output());

        } else {
            $processOutput = \File::get(base_path('ansible_playbook_output'));
        }

        $serverResponseJson = str($processOutput)
            ->between('<server-response>', '</server-response>')
            ->trim()
            ->value();

        try {
            $serverResponse = json_decode($serverResponseJson, true, flags: JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new Exception("Error decoding JSON. {$e->getMessage()}");
        }

        $failed = data_get($serverResponse, 'failed');

        if ($failed) {
            throw new Exception("Error creating the server.}");
        }

        $name = data_get($serverResponse, 'hcloud_server.name');
        $ipv4_address = data_get($serverResponse, 'hcloud_server.ipv4_address');

        $server = Server::create([
            'name' => $name,
            'public_ipv4' => $ipv4_address,
            'status' => ServerStatus::Running,
            'private_key' => data_get($args->authorized_ssh_keys, '0.private_key'),
            'public_key' => data_get($args->authorized_ssh_keys, '0.public_key'),
            'username' => $args->username,
            'sudo_password' => $args->user_password,
            'ssh_port' => Server::SSH_DEFAULT_PORT,
        ]);

        ray($server);

        return true;
    }
}
