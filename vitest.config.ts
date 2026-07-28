import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Alias targets must be absolute: Vite resolves a relative alias value relative
// to the *importing* file, so a relative target breaks for any importer outside
// the repo root (e.g. src/lib/constants.ts importing $app/environment).
const mock = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
	plugins: [sveltekit()],
	// Svelte 5 ships separate client/server builds gated by package.json export
	// conditions. Vitest runs in Node, so without this it resolves `svelte` to
	// the server build even under the jsdom environment, and `mount()` (used by
	// @testing-library/svelte) throws lifecycle_function_unavailable.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	define: {
		APP_VERSION: JSON.stringify('test'),
		APP_BUILD_HASH: JSON.stringify('test-build')
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		setupFiles: ['./vitest-setup.ts'],
		alias: {
			'$app/navigation': mock('./src/test-mocks/app-navigation.ts'),
			'$app/stores': mock('./src/test-mocks/app-stores.ts'),
			'$app/environment': mock('./src/test-mocks/app-environment.ts'),
			'$app/paths': mock('./src/test-mocks/app-paths.ts')
		}
	}
});
