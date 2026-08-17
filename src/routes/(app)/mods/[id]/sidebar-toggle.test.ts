import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Every other top-level section (chat, admin, playground, studio) reserves
// `md:max-w-[calc(100%-260px)]` on its root when the sidebar is open and renders
// its own reopen-sidebar button (the toggle inside Sidebar.svelte disappears when
// the sidebar collapses, so a route-local reopen affordance is the only way back).
// This route never had either — a mounted mod rendered underneath/behind the
// sidebar, and collapsing the sidebar from here left no way to reopen it.

const h = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const value: any = { params: { id: 'alpha' } };
	const page = {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		subscribe(fn: (v: any) => void) {
			fn(value);
			return () => {};
		}
	};
	const loadModBundleDeduped = vi.fn();
	return { page, loadModBundleDeduped };
});

vi.mock('$app/stores', () => ({ page: h.page }));
vi.mock('$lib/mods/loader', () => ({ loadModBundleDeduped: h.loadModBundleDeduped }));

import { showSidebar } from '$lib/stores';
import Page from './+page.svelte';

// The header row reads getContext('i18n') for its "New Chat" tooltip label --
// render() must supply it or the first $i18n.t() call throws.
const i18nStore = writable({ t: (k: string) => k });
const renderPage = () => render(Page, { context: new Map([['i18n', i18nStore]]) });

beforeEach(() => {
	h.loadModBundleDeduped.mockReset();
	h.loadModBundleDeduped.mockResolvedValue({
		status: 'ok',
		tag: 'mod-alpha',
		bundleUrl: '/static/mods/alpha/entry.abc.js',
		module: {}
	});
	showSidebar.set(false);
});

describe('mods route: sidebar toggle and width reservation', () => {
	it('renders a sidebar-toggle button that flips the showSidebar store', async () => {
		const { container } = renderPage();
		await tick();

		const button = container.querySelector<HTMLButtonElement>('#sidebar-toggle-button');
		expect(button).not.toBeNull();

		expect(showSidebar).toHaveProperty('subscribe');
		let current = false;
		showSidebar.subscribe((v) => (current = v))();
		expect(current).toBe(false);

		await fireEvent.click(button as HTMLButtonElement);
		showSidebar.subscribe((v) => (current = v))();
		expect(current).toBe(true);

		// Clicking again reopens the ability to collapse -- the same button is the
		// only way back in both directions from this route.
		await fireEvent.click(button as HTMLButtonElement);
		showSidebar.subscribe((v) => (current = v))();
		expect(current).toBe(false);
	});

	it('reserves width for the sidebar on the root wrapper when it is open', async () => {
		showSidebar.set(true);
		const { container } = renderPage();
		await tick();

		const root = container.querySelector('[data-mod-view]');
		expect(root?.className).toContain('md:max-w-[calc(100%-260px)]');
	});

	it('does not reserve sidebar width when the sidebar is closed', async () => {
		showSidebar.set(false);
		const { container } = renderPage();
		await tick();

		const root = container.querySelector('[data-mod-view]');
		expect(root?.className).not.toContain('md:max-w-[calc(100%-260px)]');
	});
});
