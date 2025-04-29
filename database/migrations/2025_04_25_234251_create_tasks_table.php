<?php

use App\Enums\TaskStatus;
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
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->timestamps();

            // Command information
            $table->string('name')->nullable();
            $table->text('command');
            $table->string('working_directory')->nullable();

            // Execution details
            $table->string('status')->default(TaskStatus::Pending->value);
            $table->integer('exit_code')->nullable();
            $table->dateTime('started_at')->nullable();
            $table->dateTime('finished_at')->nullable();
            $table->integer('timeout')->nullable(); // in seconds

            // Output
            $table->longText('output')->default('[]'); // combined
            $table->longText('std_out')->default('[]'); // stderr
            $table->longText('std_err')->default('[]'); // stderr

            // Process information
            $table->integer('pid')->nullable();
            $table->integer('memory_usage')->nullable(); // in bytes

            // Metadata
            $table->json('environment_variables')->nullable();
            $table->json('metadata')->nullable(); // For any additional data

            // Scheduling and retries
            $table->dateTime('scheduled_for')->nullable();

            // Queue management
            $table->string('queue')->nullable();
            $table->integer('priority')->default(0);

            // Relations
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('triggered_by')->nullable(); // Could be system, user, scheduler, etc.

        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
