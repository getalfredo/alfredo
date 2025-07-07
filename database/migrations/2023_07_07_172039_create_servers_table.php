<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('servers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('public_ipv4', 20);
            $table->string('username');
            $table->string('sudo_password');
            $table->string('spaces_directory');
            $table->string('status')
                ->nullable()
                ->default(\App\Enums\ServerStatus::New->value);
            $table->integer('ssh_port')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('servers');
    }
};
