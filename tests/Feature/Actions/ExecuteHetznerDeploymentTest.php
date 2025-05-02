<?php

use App\Enums\KeyPairType;
use App\Models\Credential;
use App\Services\KeyPair;
use Illuminate\Support\Facades\File;

test('we can run the Deploy Hetzner VPS within an Ansible task', function () {

    $user = \App\Models\User::create([
        'name' => 'Alfredo',
        'email' => 'test@example.com',
        'password' => Hash::make('password'),
    ]);

    $this->actingAs($user);

    $credential = Credential::create([
        'name' => 'Local Hetzner Test Credential',
        'user_id' => $user->id,
        'value' => env('LOCAL_HETZNER_API_TOKEN'),
    ]);

    $action = resolve(\App\Actions\ExecuteHetznerDeployment::class);

    $args = \App\Data\DeployHetznerVPSArgsData::from([
        'name' => 'test',
        'server_type' => 'cpx11',
        'datacenter' => 'nbg1-dc3',
        'image' => 'ubuntu-24.04',
        'monitoring' => true,
        'backups' => false,
        'username' => 'alfredo',
        'user_password' => 'password',
        'authorized_ssh_keys' => [
            new KeyPair(
                privateKey: File::get(base_path('local-vm/id_alfredo_dev')),
                publicKey: File::get(base_path('local-vm/id_alfredo_dev.pub')),
                type: KeyPairType::Ed25519
            )
        ],
        'hetzner_ssh_keys' => [],
        'credential_id' => $credential->uuid,
    ]);

    $result = $action->handle($args);

});
