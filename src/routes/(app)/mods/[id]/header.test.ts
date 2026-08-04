import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The mods/[id] header keeps the "New Chat" affordance and the user's pfp menu
// alongside the sidebar toggle, matching the regular chat header's collapsed-
// sidebar layout -- so a mod view never strands the user without either.

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

import { goto } from '$app/navigation';
import { user, showSidebar } from '$lib/stores';
import Page from './+page.svelte';

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
	vi.mocked(goto).mockClear();
	showSidebar.set(false);
	user.set(undefined);
});

describe('mods route header: New Chat button + user menu', () => {
	it('clicking "New Chat" navigates back to a fresh chat', async () => {
		// getByLabelText matches the Tooltip's own content bubble too (same text,
		// not a button) -- role scopes this to the actual button.
		const { getByRole } = renderPage();
		await tick();

		await fireEvent.click(getByRole('button', { name: 'New Chat' }));
		expect(goto).toHaveBeenCalledWith('/(app)');
	});

	it('renders the user pfp menu when a session user is present', async () => {
		user.set({
			id: 'u-1',
			email: 'a@b.c',
			name: 'Ada',
			role: 'user',
			profile_image_url: '/user.png'
		});
		const { getByAltText } = renderPage();
		await tick();

		const img = getByAltText('User profile') as HTMLImageElement;
		expect(img.src).toContain('/user.png');
	});

	it('renders no user menu when there is no session user', async () => {
		user.set(undefined);
		const { queryByLabelText } = renderPage();
		await tick();

		expect(queryByLabelText('User Menu')).toBeNull();
	});
});
