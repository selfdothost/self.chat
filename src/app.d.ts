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
