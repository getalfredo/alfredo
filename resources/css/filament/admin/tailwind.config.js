import preset from '../../../../vendor/filament/filament/tailwind.config.preset'

export default {
    presets: [preset],

    content: [
        './app/**/*.php',
        './resources/views/**/*.blade.php',
        './vendor/filament/**/*.blade.php',
    ],
}
