<?php

namespace App\Data;

use App\Services\KeyPair;
use Spatie\LaravelData\Data;

class DeployHetznerVPSArgsData extends Data
{
    /**
     * @param string $name
     * @param string $server_type
     * @param string $datacenter
     * @param string $image
     * @param bool $monitoring
     * @param bool $backups
     * @param string $username
     * @param string $user_password
     * @param array $authorized_ssh_keys
     * @param array<string> $hetzner_ssh_keys
     * @param string $hetzner_api_token
     */
    public function __construct(
        public string $name,
        public string $server_type,
        public string $datacenter,
        public string $image,
        public bool $monitoring,
        public bool $backups,
        public string $username,
        public string $user_password,
        public array $authorized_ssh_keys,
        public array $hetzner_ssh_keys,
        public string $hetzner_api_token,
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
            'USER_PASSWORD' => $this->user_password,
            'AUTHORIZED_SSH_KEYS' => $this->authorized_ssh_keys,
            'HETZNER_SSH_KEYS' => $this->hetzner_ssh_keys,
            'HETZNER_API_TOKEN' => $this->hetzner_api_token,
        ];
    }
}
