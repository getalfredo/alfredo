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
        Schema::create('api_tokens', function (Blueprint $table) {
            $table->id();
            $table->uuid()->unique();
            $table->morphs('tokenable');
            $table->string('name')->nullable();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }
};
