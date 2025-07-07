<?php

namespace App\Data;

use App\Services\KeyPair;
use Spatie\LaravelData\Data;

class DeployHetznerVPSArgsData extends Data
{
    /**
     * @param array<string> $hetzner_ssh_keys
     */
    public function __construct(
        public string $name,
        public string $server_type,
        public string $datacenter,
        public string $image,
        public bool $monitoring,
        public bool $backups,
        public string $username,
        public string $sudo_password,
        public array $authorized_ssh_keys,
        public array $hetzner_ssh_keys,
        public string $credential_id,
    ) {}

    public function toArray(): array
    {
        // Matching the Ansible playbook variables
        return [
            'NAME' => $this->name,
            'SERVER_TYPE' => $this->server_type,
            'DATACENTER' => $this->datacenter,
            'IMAGE' => $this->image,
            'MONITORING' => $this->monitoring,
            'BACKUPS' => $this->backups,
            'USERNAME' => $this->username,
            'SUDO_PASSWORD' => $this->sudo_password,
            'AUTHORIZED_SSH_KEYS' => $this->authorized_ssh_keys,
            'HETZNER_SSH_KEYS' => $this->hetzner_ssh_keys,
            'CREDENTIAL_ID' => $this->credential_id,
        ];
    }
}
