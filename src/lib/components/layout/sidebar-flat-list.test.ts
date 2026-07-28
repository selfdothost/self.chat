import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// SO/R3 — regression guard (static). The flat time-grouped chat list must remain
// scoped to unfoldered chats by the SERVER (the recent-chats endpoint), not by a
// client-side post-filter over a broader set. This locks that contract in so a
// future edit cannot silently reintroduce a fetch-all-then-filter.

const sidebarSrc = readFileSync(
	resolve(process.cwd(), 'src/lib/components/layout/Sidebar.svelte'),
	'utf-8'
);

describe('SO/R3: flat list unfoldered scoping is server-driven', () => {
	it('populates the flat list from the recent-chats endpoint (getChatList) directly', () => {
		// initChatList sets the chats store straight from getChatList's response.
		expect(sidebarSrc).toContain('getChatList(localStorage.token, $currentChatPage)');
		expect(sidebarSrc).toContain('await chats.set(newChatList)');
	});

	it('renders the flat list by iterating $chats with no broadening post-filter', () => {
		expect(sidebarSrc).toContain('{#each $chats as chat');
		// No client-side filtering of the chat list (which would imply fetch-all-then
		// filter). The only allowed filters are over `folders`, never over the chats.
		expect(sidebarSrc).not.toMatch(/\$chats\s*\.\s*filter/);
		expect(sidebarSrc).not.toMatch(/chats\s*\.\s*filter\s*\(\s*\(?\s*\w*\s*\)?\s*=>[^)]*folder/);
	});

	it('paginates via load-more against the same server endpoint', () => {
		// loadMoreChats appends the next page from the same endpoint (grouping +
		// infinite scroll preserved), never re-fetching all and filtering.
		expect(sidebarSrc).toContain('loadMoreChats');
		expect(sidebarSrc).toContain('getChatList(localStorage.token, $currentChatPage)');
	});
});
