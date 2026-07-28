import { render, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writable } from 'svelte/store';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// client R5 (T-C06) — graceful failure. A mod whose bundle 404s, whose load throws
// at the network level, or which returns an HTTP error must show a contained "mod
// unavailable" fallback in ITS view slot — never breaking the shell, never
// hard-reloading the SPA, never poisoning other mods. The fallback distinguishes
// the ONLY distinction the browser actually exposes: a received HTTP error (a
// server WAS reached → not client-blocked) vs a network-level throw (no response →
// blocked OR down, indistinguishable). `data-mod-failure` surfaces that kind.

const h = vi.hoisted(() => {
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
	h.page.setParams('alpha');
	h.loadModBundleDeduped.mockReset();
});

const src = readFileSync(resolve(process.cwd(), 'src/routes/(app)/mods/[id]/+page.svelte'), 'utf-8');

// Strip comments so the "no hard reload" guards match real CODE only, not prose.
function codeOnly(s: string): string {
	return s
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const code = codeOnly(src);

const failureAttr = (container: HTMLElement): string | null =>
	container.querySelector('[data-mod-state="unavailable"]')?.getAttribute('data-mod-failure') ??
	null;

describe('client R5 AC1: a 404 (stale reference) shows the "mod unavailable" fallback, shell intact', () => {
	it('renders the contained unavailable fallback and leaves the route wrapper intact', async () => {
		h.loadModBundleDeduped.mockResolvedValue({ status: 'not_found' });
		const { container } = renderPage();

		await vi.waitFor(() => expect(container.querySelector('[data-mod-state="unavailable"]')).not.toBeNull());
		expect(failureAttr(container)).toBe('not_found');
		// The route's own wrapper still rendered — the failure did not blow up the view.
		expect(container.querySelector('[data-mod-view]')).not.toBeNull();
	});
});

describe('client R5 AC2: a load-time throw (network/parse) shows the same fallback and does not propagate to the shell', () => {
	it('a rejected loadModBundleDeduped is caught into the fallback, not thrown out of the component', async () => {
		// A network-level failure surfaces as a thrown TypeError with no HTTP status.
		h.loadModBundleDeduped.mockRejectedValue(new TypeError('Failed to fetch'));
		const { container } = renderPage();

		await vi.waitFor(() => expect(container.querySelector('[data-mod-state="unavailable"]')).not.toBeNull());
		// Reaching here at all proves the throw did not propagate (an unhandled throw
		// out of the component would fail the render).
		expect(container.querySelector('[data-mod-view]')).not.toBeNull();
	});
});

describe('client R5 AC3: blocked-vs-unreachable is distinguished exactly as far as the browser exposes it', () => {
	it('a network-level throw (no HTTP response) → "unreachable" (blocked OR down, honestly not separable)', async () => {
		h.loadModBundleDeduped.mockRejectedValue(new TypeError('Failed to fetch'));
		const { container } = renderPage();
		await vi.waitFor(() => expect(container.querySelector('[data-mod-state="unavailable"]')).not.toBeNull());
		expect(failureAttr(container)).toBe('unreachable');
	});

	it('a received HTTP error status → "server_error" (a server WAS reached, so NOT client-blocked)', async () => {
		h.loadModBundleDeduped.mockResolvedValue({ status: 'error', httpStatus: 503 });
		const { container } = renderPage();
		await vi.waitFor(() => expect(container.querySelector('[data-mod-state="unavailable"]')).not.toBeNull());
		expect(failureAttr(container)).toBe('server_error');
	});

	it('the two kinds are genuinely distinct — the received-response case is not lumped with the no-response case', async () => {
		h.loadModBundleDeduped.mockResolvedValue({ status: 'error', httpStatus: 500 });
		const { container: reached } = renderPage();
		await vi.waitFor(() => expect(reached.querySelector('[data-mod-state="unavailable"]')).not.toBeNull());

		h.loadModBundleDeduped.mockReset();
		h.loadModBundleDeduped.mockRejectedValue(new TypeError('Failed to fetch'));
		const { container: noResponse } = renderPage();
		await vi.waitFor(() => expect(noResponse.querySelector('[data-mod-state="unavailable"]')).not.toBeNull());

		expect(failureAttr(reached)).toBe('server_error');
		expect(failureAttr(noResponse)).toBe('unreachable');
		expect(failureAttr(reached)).not.toBe(failureAttr(noResponse));
	});
});

describe('client R5 AC4: no failure path triggers a full-SPA hard reload; recovery is a soft in-SPA retry', () => {
	it('the source contains no hard-reload/navigation recovery', () => {
		expect(code).not.toMatch(/location\.reload/);
		expect(code).not.toMatch(/location\.href\s*=/);
		expect(code).not.toMatch(/location\.assign/);
		expect(code).not.toMatch(/window\.location/);
	});

	it('the "Try again" button re-runs the loader in-place (no reload) and can recover to ready', async () => {
		h.loadModBundleDeduped.mockResolvedValue({ status: 'not_found' });
		const { container } = renderPage();
		await vi.waitFor(() => expect(container.querySelector('[data-mod-state="unavailable"]')).not.toBeNull());

		// The mod comes back; retry re-enters the loader without a page reload.
		h.loadModBundleDeduped.mockReset();
		h.loadModBundleDeduped.mockResolvedValue({
			status: 'ok',
			tag: 'mod-alpha',
			bundleUrl: '/static/mods/alpha/entry.a.js',
			module: {}
		});

		const retry = container.querySelector('[data-mod-retry]') as HTMLButtonElement;
		expect(retry).not.toBeNull();
		await fireEvent.click(retry);

		await vi.waitFor(() => expect(container.querySelector('[data-mod-state="ready"]')).not.toBeNull());
		expect(h.loadModBundleDeduped).toHaveBeenCalled();
	});
});

describe('client R5 AC5: a failure in one mod leaves other mods loadable (no cross-mod poisoning)', () => {
	it('after alpha fails, navigating to beta loads and mounts normally', async () => {
		h.loadModBundleDeduped.mockImplementation(async (id: string) => {
			if (id === 'alpha') throw new TypeError('Failed to fetch');
			return { status: 'ok', tag: 'mod-beta', bundleUrl: '/static/mods/beta/entry.b.js', module: {} };
		});

		const { container } = renderPage();
		await vi.waitFor(() => expect(container.querySelector('[data-mod-state="unavailable"]')).not.toBeNull());
		expect(failureAttr(container)).toBe('unreachable');

		// Different mod id → independent load; alpha's failure did not poison it.
		h.page.setParams('beta');
		await vi.waitFor(() => expect(container.querySelector('[data-mod-state="ready"]')).not.toBeNull());
		expect(container.querySelector('[data-mod-state="ready"]')?.getAttribute('data-mod-tag')).toBe('mod-beta');
	});
});
