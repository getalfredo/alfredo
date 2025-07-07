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
        Schema::create('ssh_keys', function (Blueprint $table) {
            $table->id();
            $table->uuid()->unique();
            $table->morphs('keyable');
            $table->text('public_key')->nullable();
            $table->text('private_key')->nullable();
            $table->timestamps();
        });
    }
};
