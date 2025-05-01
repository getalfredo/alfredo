<?php

use App\Enums\KeyPairType;
use App\Services\KeyPair;
use Illuminate\Support\Facades\File;

test('we can run the Deploy Hetzner VPS within an Ansible task', function () {

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
    ]);

    $result = $action->handle($args);

});
