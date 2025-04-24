<?php

namespace Database\Factories;

use App\Enums\ServerStatus;
use App\Models\Server;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\File;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Server>
 */
class ServerFactory extends Factory
{
    protected $model = Server::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => $this->faker->name(),
            'public_ipv4' => $this->faker->ipv4,
            'status' => fake()->randomElement(ServerStatus::cases()),
            'username' => 'alfredo',
            'sudo_password' => 'password',
            'ssh_port' => 22,
        ];
    }

    public function localVM(): static
    {
        return $this->state(function () {
            return [
                'public_ipv4' => env('LOCAL_SERVER_IP'),
                'public_key' => File::get(base_path('/local-vm/id_alfredo_dev.pub')),
                'private_key' => File::get(base_path('/local-vm/id_alfredo_dev')),
            ];
        });
    }
}
