<?php

use App\Http\Controllers\AddServerScriptController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ServerController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return 'Hello world';
})->name('home');


Route::middleware('signed:relative')->group(function () {
    Route::get('/add-server-script/{server}', AddServerScriptController::class)->name('add-server-script');
});
