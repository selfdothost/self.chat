import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// client R2 (T-C02) — the generic mod route drives the loader. These tests prove
// the load is re-run on EACH view-entry (AC2) because it is keyed on the route
// param in a reactive block, not a one-time onMount.

// Hoisted so the (hoisted) vi.mock factories can reference them.
const h = vi.hoisted(() => {
	// A minimal Svelte-store-contract `page` store we can drive to simulate
	// SvelteKit navigating between `[id]` params on the same reused component.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let value: any = { params: { id: 'alpha' } };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const subs = new Set<(v: any) => void>();
	const page = {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		subscribe(fn: (v: any) => void) {
			fn(value);
			subs.add(fn);
			return () => subs.delete(fn);
		},
		setParams(id: string) {
			value = { params: { id } };
			subs.forEach((fn) => fn(value));
		}
	};
	const loadModBundleDeduped = vi.fn();
	return { page, loadModBundleDeduped };
});

vi.mock('$app/stores', () => ({ page: h.page }));
vi.mock('$lib/mods/loader', () => ({ loadModBundleDeduped: h.loadModBundleDeduped }));

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
	h.page.setParams('alpha');
});

describe('client R2 AC2: the load re-runs on each view-entry, keyed on the route param', () => {
	it('loads on mount, and RE-loads when the id param changes — including navigating back', async () => {
		renderPage();
		await tick();

		// Mount → first view-entry loads the current id.
		expect(h.loadModBundleDeduped).toHaveBeenCalledTimes(1);
		expect(h.loadModBundleDeduped.mock.calls[0][0]).toBe('alpha');

		// Navigate to a different mod on the SAME reused component → re-load.
		h.page.setParams('beta');
		await tick();
		expect(h.loadModBundleDeduped).toHaveBeenCalledTimes(2);
		expect(h.loadModBundleDeduped.mock.calls[1][0]).toBe('beta');

		// Navigate BACK to alpha → the manifest is fetched afresh (would pick up a
		// server-side update); the load is NOT skipped because "we already saw alpha".
		h.page.setParams('alpha');
		await tick();
		expect(h.loadModBundleDeduped).toHaveBeenCalledTimes(3);
		expect(h.loadModBundleDeduped.mock.calls[2][0]).toBe('alpha');
	});

	it('renders the unavailable state when the loader reports a non-ok result', async () => {
		h.loadModBundleDeduped.mockResolvedValue({ status: 'not_found' });
		const { container } = renderPage();
		await tick();
		await tick();
		expect(container.querySelector('[data-mod-state="unavailable"]')).not.toBeNull();
	});

	it('renders the ready mount container (carrying the tag) once the bundle loads', async () => {
		const { container } = renderPage();
		await tick();
		await tick();
		const ready = container.querySelector('[data-mod-state="ready"]');
		expect(ready).not.toBeNull();
		expect(ready?.getAttribute('data-mod-tag')).toBe('mod-alpha');
	});
});
