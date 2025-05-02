<?php

namespace App\Data;

use Spatie\LaravelData\Data;

class DeployHetznerVPSResultData extends Data
{
    public function __construct(
        public bool $failed,
        public string $name,
        public string $ipv4_address,
    ) {}
}
