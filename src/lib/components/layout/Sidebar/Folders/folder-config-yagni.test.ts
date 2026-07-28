import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// FC/R6 — YAGNI guard. This domain is UI wiring over existing pieces only: it must
// introduce NO new model/tool/knowledge picker or selector component. The only
// net-new client code is the Configure menu item, the modal container that composes
// existing pickers, and the folders-API function. This is a static/review test.

const FOLDERS_DIR = resolve(process.cwd(), 'src/lib/components/layout/Sidebar/Folders');
const modalSrc = readFileSync(resolve(FOLDERS_DIR, 'FolderConfigModal.svelte'), 'utf-8');
const foldersApiSrc = readFileSync(resolve(process.cwd(), 'src/lib/apis/folders/index.ts'), 'utf-8');

describe('FC/R6: no new picker/selector components', () => {
	it('reuses the pre-existing shared pickers by path', () => {
		expect(modalSrc).toContain('$lib/components/chat/ModelSelector/Selector.svelte');
		expect(modalSrc).toContain('$lib/components/workspace/Models/ToolsSelector.svelte');
		expect(modalSrc).toContain('$lib/components/workspace/Models/Knowledge.svelte');
	});

	it('uses the composer single-model PRIMITIVE, not the wrapper with side effects', () => {
		expect(modalSrc).not.toContain("from '$lib/components/chat/ModelSelector.svelte'");
	});

	it('adds no new picker/selector component file under the Folders area', () => {
		const componentSvelte = readdirSync(FOLDERS_DIR)
			.filter((f) => f.endsWith('.svelte') && !f.includes('.test.'))
			.sort();
		// Only the pre-existing menu and the new composition modal exist -- no new
		// *Selector*/*Picker* component was introduced.
		expect(componentSvelte).toEqual(['FolderConfigModal.svelte', 'FolderMenu.svelte']);
		expect(componentSvelte.some((f) => /selector|picker/i.test(f))).toBe(false);
	});

	it('adds exactly one new folders-API function, reusing the existing update endpoint', () => {
		// The one net-new API surface is updateFolderPresetById. It must reuse the
		// existing POST /{id}/update endpoint (the same one the rename path uses,
		// extended by self.ai!138 to also accept preset fields) -- self.ai never
		// shipped, and does not have, a dedicated preset sub-route. An earlier
		// version of this function posted to a fabricated `/update/preset` path
		// that 404'd in production; this guards against reintroducing that.
		expect(foldersApiSrc).toContain('export const updateFolderPresetById');
		const fnBody = foldersApiSrc.match(/export const updateFolderPresetById[\s\S]*?\n};/)?.[0] ?? '';
		expect(fnBody).toContain('/folders/${id}/update`');
		expect(fnBody).not.toContain('/update/preset');
	});
});
