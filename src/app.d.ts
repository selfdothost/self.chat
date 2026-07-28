// jest-dom's matchers (toBeInTheDocument, etc.) are registered at runtime by
// `vitest-setup.ts` importing `@testing-library/jest-dom/vitest`, but
// `svelte-check`'s own TypeScript program doesn't include that root-level
// setup file, so it never sees the type augmentation on vitest's `expect` --
// a real, previously-latent gap (no test in this repo used a jest-dom matcher
// before ModNav.test.ts). Referenced here, in a file svelte-check's program
// already includes, rather than added to tsconfig's `types` array, which
// would restrict TypeScript to only the listed packages instead of adding to
// the default set.
/// <reference types="@testing-library/jest-dom" />

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}

	// Injected at build time via Vite's `define` (see vite.config.ts) --
	// these aren't real imports/exports, just string-replaced literals.
	const APP_VERSION: string;
	const APP_BUILD_HASH: string;

	interface Document {
		// Stashed by CodeBlock.svelte so the pyodide-driven matplotlib backend
		// (running in a worker/wasm runtime, not typed here) knows which
		// canvas element to render into for a given code block.
		pyodideMplTarget?: HTMLElement | null;
	}
}

export {};
