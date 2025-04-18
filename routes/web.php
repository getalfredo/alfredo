<?php

use App\Http\Controllers\AddServerScriptController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::redirect('/', '/admin')->name('home');

Route::middleware('signed:relative')->group(function () {
    Route::get('/add-server-script/{server}', AddServerScriptController::class)->name('add-server-script');
});
