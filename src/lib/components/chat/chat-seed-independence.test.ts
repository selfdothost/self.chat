import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CS/R4 — seeded model/tools/knowledge are ordinary per-chat mutable state. Changing
// them must NOT mutate the folder's stored preset, and the folder must never re-apply
// its preset after creation. This is a static guard on the chat component: the only
// preset WRITE path (updateFolderPresetById) is never invoked from the chat, and the
// folder seeding happens exactly once, at creation (initNewChat), not on any
// setting-change or save path.

const chatSrc = readFileSync(
	resolve(process.cwd(), 'src/lib/components/chat/Chat.svelte'),
	'utf-8'
);

describe('CS/R4: seeded settings are independent per-chat state', () => {
	it('never writes back to the folder preset from the chat', () => {
		// The preset write function is not imported or called anywhere in Chat.svelte,
		// so changing model/tools/knowledge cannot mutate the folder's stored preset.
		expect(chatSrc).not.toContain('updateFolderPresetById');
	});

	it('seeds from the folder preset exactly once (at creation, not re-applied)', () => {
		const seedCalls = chatSrc.match(/seedFromFolderPreset\s*\(/g) ?? [];
		expect(seedCalls.length).toBe(1);
	});

	it('reads the folder context only during new-chat init, not on save', () => {
		// `folder_id` seeding lives in initNewChat; the save path (saveChatHandler /
		// updateChatById) must not read it or re-seed.
		const initNewChatIdx = chatSrc.indexOf('const initNewChat');
		const saveHandlerIdx = chatSrc.indexOf('const saveChatHandler');
		expect(initNewChatIdx).toBeGreaterThan(-1);
		expect(saveHandlerIdx).toBeGreaterThan(-1);

		const seedIdx = chatSrc.indexOf('seedFromFolderPreset(');
		// The single seeding call is inside initNewChat, before saveChatHandler.
		expect(seedIdx).toBeGreaterThan(initNewChatIdx);
		expect(seedIdx).toBeLessThan(saveHandlerIdx);

		// The save path does not carry preset fields.
		const saveSlice = chatSrc.slice(saveHandlerIdx, saveHandlerIdx + 600);
		expect(saveSlice).not.toContain('default_model_id');
		expect(saveSlice).not.toContain('meta.preset');
	});
});
