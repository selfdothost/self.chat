import { defineConfig } from 'cypress';

export default defineConfig({
	e2e: {
		baseUrl: 'http://localhost:8080'
	},
	// Desktop viewport ON PURPOSE. Cypress defaults to 1000x660, which self.chat
	// treats as narrow enough to keep the sidebar collapsed -- and a collapsed
	// sidebar is `invisible` plus `w-[0px]` (layout/Sidebar.svelte), so every
	// folder/mod spec failed with "this element is not visible". The specs are
	// desktop-layout tests; give them a desktop.
	viewportWidth: 1280,
	viewportHeight: 800,
	video: true
});
