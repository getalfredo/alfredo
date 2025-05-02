<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use App\Enums\KeyPairType;
use App\Models\Credential;
use App\Services\KeyPair;
use Illuminate\Support\Facades\File;

class TestCreateHetznerVPS extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:test-create-hetzner-vps';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Create a Hetzner VPS for testing purposes';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $user = User::query()
            ->whereEmail('test@example.com')
            ->sole();

        auth()->login($user);

        $credential = Credential::firstOrCreate([
            'name' => 'Local Hetzner Test Credential',
        ], [
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

        if($result === true) {
            $this->info('Hetzner VPS created successfully.');
            return;
        }

        $this->error('Failed to create Hetzner VPS.');
    }
}
