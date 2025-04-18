import { defineConfig } from 'vite';
import laravel, { refreshPaths } from 'laravel-vite-plugin';

export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/css/filament/admin/theme.css',
            ],
            refresh: [
                ...refreshPaths,
                'app/**/*.php',
                'resources/views/**/*.blade.php',
            ],
        }),
    ],
    server: {
        host: '0.0.0.0',  // This allows access from any IP
        hmr: {
            host: 'localhost'  // Or use your machine's IP/hostname
        }
    },
});
