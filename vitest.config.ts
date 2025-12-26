import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { defineConfig } from 'vitest/config';

// Use Workers config for integration tests, regular Node for unit tests
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // Only use Workers pool for integration tests
        include: [
            'tests/unit/**/*.test.ts',
            'tests/integration/**/*.test.ts'
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/**',
                'tests/**',
                'dist/**',
                '*.config.ts',
                'frontend/**',
            ],
        },
    },
});


