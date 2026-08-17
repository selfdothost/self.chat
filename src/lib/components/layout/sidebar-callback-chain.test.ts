import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// self.chat#31, dispatcher batch 6 -- the LAST one. ChatItem, ChatMenu, Folders
// and RecursiveFolder move to callback props, which takes createEventDispatcher
// to ZERO across the codebase.
//
// This cluster is the deepest chain in the migration and the only one that is
// RECURSIVE:
//
//   ChatMenu ──onChange/onTag──> ChatItem ──onSelect/onUnselect/onChange/onTag──> Sidebar
//   RecursiveFolder ──onImport/onUpdate/onChange──> (itself, N deep) ──> Folders ──> Sidebar
//
// Two payload shapes are load-bearing and easy to flatten by accident:
//   onTag    { type: 'add' | 'delete', name }  -- Sidebar destructures both fields
//   onImport { folderId, items }               -- Sidebar destructures both fields
// onSelect/onUnselect/onChange/onUpdate take no argument.
//
// A stale listener anywhere here is invisible: renaming a chat, tagging one,
// dragging between folders or importing into a folder would simply stop
// refreshing the sidebar, with no error.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const B = 'src/lib/components/layout/';

const CHAT_ITEM = read(B + 'Sidebar/ChatItem.svelte');
const CHAT_MENU = read(B + 'Sidebar/ChatMenu.svelte');
const FOLDERS = read(B + 'Sidebar/Folders.svelte');
const RECURSIVE = read(B + 'Sidebar/RecursiveFolder.svelte');
const SIDEBAR = read(B + 'Sidebar.svelte');

const CLUSTER = { CHAT_ITEM, CHAT_MENU, FOLDERS, RECURSIVE };

/** Every .svelte file under src/, walked once. */
const allSvelte = (dir: string, acc: string[] = []): string[] => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) allSvelte(p, acc);
		else if (entry.name.endsWith('.svelte')) acc.push(p);
	}
	return acc;
};

describe('self.chat#31 is complete', () => {
	it('no component anywhere still uses createEventDispatcher', () => {
		const offenders = allSvelte(resolve(process.cwd(), 'src')).filter((f) =>
			/createEventDispatcher/.test(readFileSync(f, 'utf-8'))
		);
		expect(offenders, `still on the legacy dispatcher:\n${offenders.join('\n')}`).toEqual([]);
	});

	it('the sidebar cluster declares no dispatcher and no legacy listener', () => {
		for (const [name, src] of Object.entries(CLUSTER)) {
			expect(src, name).not.toMatch(/[^a-zA-Z]dispatch\(/);
			expect(src, name).not.toMatch(/on:(change|select|unselect|tag|import|update)=/);
		}
		expect(SIDEBAR).not.toMatch(/on:(change|select|unselect|tag|import|update)=/);
	});
});

describe('the two payload shapes survive the chain', () => {
	it('onTag keeps { type, name } from ChatMenu to the Sidebar', () => {
		// ChatMenu emits the object; ChatItem forwards it whole; Sidebar destructures.
		expect(CHAT_MENU).toMatch(/onTag\(\{/);
		expect(CHAT_ITEM).toMatch(/onTag=\{\(detail\) => \{[\s\S]{0,60}?onTag\(detail\)/);
		expect(SIDEBAR).toMatch(/onTag=\{\(\{ type, name \}\)/);
		// flattening it in ChatItem would compile and lose the fields
		expect(CHAT_ITEM).not.toMatch(/onTag\(detail\.name\)/);
	});

	it('onImport keeps { folderId, items } from RecursiveFolder to the Sidebar', () => {
		expect(RECURSIVE).toMatch(/onImport\(\{[\s\S]{0,80}?folderId[\s\S]{0,60}?items/);
		expect(SIDEBAR).toMatch(/onImport=\{\(\{ folderId, items \}\)/);
	});
});

describe('the recursive forward is intact', () => {
	it('RecursiveFolder passes all three callbacks to its nested self', () => {
		// A nested folder that does not forward these is silently inert: dragging a
		// chat into a SUB-folder would stop refreshing the sidebar.
		const nested = RECURSIVE.match(/<RecursiveFolder[\s\S]*?\/>/);
		expect(nested, 'RecursiveFolder renders itself').not.toBeNull();
		expect(nested![0]).toMatch(/\{onImport\}/);
		expect(nested![0]).toMatch(/\{onUpdate\}/);
		expect(nested![0]).toMatch(/\{onChange\}/);
	});

	it('RecursiveFolder gives its ChatItem the chat-list refresh', () => {
		const item = RECURSIVE.match(/<ChatItem[\s\S]*?\/>/);
		expect(item).not.toBeNull();
		expect(item![0]).toMatch(/\{onChange\}/);
	});

	it('Folders forwards all three straight through', () => {
		expect(FOLDERS).toMatch(/\{onImport\}/);
		expect(FOLDERS).toMatch(/\{onUpdate\}/);
		expect(FOLDERS).toMatch(/\{onChange\}/);
	});
});

describe('the Sidebar wires both ChatItem mounts', () => {
	it('converts the flat-list mount and the folder mount, not just one', () => {
		// They differ only in indentation, which is exactly how the second gets
		// missed -- it happened in the Overview batch.
		const selects = SIDEBAR.match(/onSelect=\{\(\) => \{/g) ?? [];
		expect(selects.length, 'both ChatItem mounts').toBeGreaterThanOrEqual(2);
		const tags = SIDEBAR.match(/onTag=\{\(\{ type, name \}\)/g) ?? [];
		expect(tags.length, 'both ChatItem mounts carry onTag').toBeGreaterThanOrEqual(2);
	});
});
