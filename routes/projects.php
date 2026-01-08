<?php

use App\Http\Controllers\Projects\ProjectCommandController;
use App\Http\Controllers\Projects\ProjectController;
use App\Http\Controllers\Projects\ProjectFileController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->prefix('projects')->group(function () {
    Route::get('/', [ProjectController::class, 'index'])->name('projects.index');
    Route::post('/', [ProjectController::class, 'store'])->name('projects.store');
    Route::get('/{path}', [ProjectController::class, 'show'])->name('projects.show');
    Route::delete('/{path}', [ProjectController::class, 'destroy'])->name('projects.destroy');

    Route::post('/{path}/commands/{command}', [ProjectCommandController::class, 'execute'])
        ->name('projects.commands.execute');

    Route::get('/{path}/files', [ProjectFileController::class, 'index'])->name('projects.files.index');
    Route::get('/{path}/files/{file}', [ProjectFileController::class, 'show'])
        ->where('file', '.*')
        ->name('projects.files.show');
    Route::put('/{path}/files/{file}', [ProjectFileController::class, 'update'])
        ->where('file', '.*')
        ->name('projects.files.update');
});
