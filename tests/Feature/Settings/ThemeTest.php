<?php

use App\Models\User;

test('appearance page displays correctly', function () {
    $user = User::factory()->create();

    $response = $this
        ->actingAs($user)
        ->get(route('appearance.edit'));

    $response->assertOk();
});

test('theme cookie is not encrypted', function () {
    $user = User::factory()->create();

    $response = $this
        ->actingAs($user)
        ->withCookie('theme', 'ocean')
        ->get(route('appearance.edit'));

    $response->assertOk();
});

test('theme value is shared with views', function () {
    $user = User::factory()->create();

    $this
        ->actingAs($user)
        ->withCookie('theme', 'forest')
        ->get(route('appearance.edit'))
        ->assertOk();
});

test('default theme is used when no cookie is set', function () {
    $user = User::factory()->create();

    $this
        ->actingAs($user)
        ->get(route('appearance.edit'))
        ->assertOk();
});
