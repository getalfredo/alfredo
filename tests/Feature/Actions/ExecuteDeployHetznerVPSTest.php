<?php

use App\Models\APIToken;

test('we can run the Deploy Hetzner VPS within an Ansible task', function () {

    $user = \App\Models\User::create([
        'name' => 'Alfredo',
        'email' => 'test@example.com',
        'password' => Hash::make('password'),
    ]);

    $this->actingAs($user);

    $credential = APIToken::create([
        'type' => \App\Enums\CredentialType::API_TOKEN,
        'user_id' => $user->id,
        'name' => 'Local Hetzner Test Credential',
        'value' => env('LOCAL_HETZNER_API_TOKEN'),
    ]);

    $action = resolve(\App\Actions\ExecuteDeployHetznerVPS::class);

    $args = \App\Data\DeployHetznerVPSArgsData::from([
        'name' => 'test',
        'server_type' => 'cpx11',
        'datacenter' => 'nbg1-dc3',
        'image' => 'ubuntu-24.04',
        'monitoring' => true,
        'backups' => false,
        'username' => 'alfredo',
        'sudo_password' => 'password',
        'hetzner_ssh_keys' => [],
        'authorized_ssh_keys' => [ $sshKey ],
        'credential_id' => $credential->uuid,
    ]);

    $result = $action->handle($args);

    dd($result);
});
