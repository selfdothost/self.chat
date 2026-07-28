import { describe, it, expect, vi } from 'vitest';

import { loadModBundle, resolveBundleUrl, type ModFrontendManifest } from './loader';
import { WEBUI_API_BASE_URL, WEBUI_BASE_URL } from '$lib/constants';

// client R2 (T-C02) — the runtime loader. These tests drive the standalone
// `loadModBundle` function directly with injected `fetch` and `import` doubles,
// which is why the loader accepts them: a bare dynamic `import(url)` is otherwise
// hard to intercept under jsdom, and injection lets us assert exactly which URL is
// fetched and which URL is imported.

// Build a fetch double that returns a given manifest as a 200 JSON response and
// records the URL it was called with.
const okManifestFetch = (manifest: ModFrontendManifest) =>
	vi.fn(async (_url: string, _init?: RequestInit) => ({
		ok: true,
		status: 200,
		json: async () => manifest
	}));

describe('resolveBundleUrl — API-relative bundle_url resolves against the API origin', () => {
	it('prepends WEBUI_BASE_URL (the API origin) to an origin-rooted bundle_url', () => {
		// bundle_url is API-relative (origin-rooted), NOT client-route-relative, so it
		// resolves against the same origin base every API call uses.
		expect(resolveBundleUrl('/static/mods/reference/entry.abc123.js')).toBe(
			`${WEBUI_BASE_URL}/static/mods/reference/entry.abc123.js`
		);
	});

	it('passes an already-absolute URL through untouched', () => {
		expect(resolveBundleUrl('https://cdn.example/mods/x/entry.js')).toBe(
			'https://cdn.example/mods/x/entry.js'
		);
	});
});

describe('client R2 AC1: fetch the per-mod manifest, then import the resolved bundle URL', () => {
	it('fetches /api/v1/mods/<id>/frontend-manifest then imports the manifest-resolved URL', async () => {
		const manifest: ModFrontendManifest = {
			mod_id: 'reference',
			tag: 'mod-reference',
			status: 'ok',
			bundle_url: '/static/mods/reference/entry.abc123.js'
		};
		const fetchFn = okManifestFetch(manifest);
		const importFn = vi.fn(async (_url: string) => ({ __esModule: true }));

		const result = await loadModBundle('reference', { fetchFn, importFn });

		// The manifest is fetched from the per-mod manifest endpoint (T-A05).
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(String(fetchFn.mock.calls[0][0])).toBe(
			`${WEBUI_API_BASE_URL}/mods/reference/frontend-manifest`
		);

		// THEN the resolved bundle URL is imported — resolved from the manifest, not
		// hardcoded, and resolved against the API origin.
		expect(importFn).toHaveBeenCalledTimes(1);
		expect(importFn.mock.calls[0][0]).toBe(
			`${WEBUI_BASE_URL}/static/mods/reference/entry.abc123.js`
		);

		expect(result).toMatchObject({ status: 'ok', tag: 'mod-reference' });
	});

	it('imports whatever URL the manifest names — the URL is never hardcoded', async () => {
		// A different content hash in the manifest must drive a different import URL.
		const manifest: ModFrontendManifest = {
			mod_id: 'reference',
			tag: 'mod-reference',
			status: 'ok',
			bundle_url: '/static/mods/reference/entry.DEADBEEF.js'
		};
		const importFn = vi.fn(async (_url: string) => ({}));

		await loadModBundle('reference', { fetchFn: okManifestFetch(manifest), importFn });

		expect(importFn.mock.calls[0][0]).toBe(
			`${WEBUI_BASE_URL}/static/mods/reference/entry.DEADBEEF.js`
		);
	});

	it('attaches the auth token as a Bearer header when one is supplied', async () => {
		const fetchFn = okManifestFetch({
			mod_id: 'reference',
			tag: 'mod-reference',
			status: 'ok',
			bundle_url: '/static/mods/reference/entry.abc.js'
		});
		await loadModBundle('reference', { fetchFn, importFn: vi.fn(async () => ({})), token: 'tok-9' });

		const opts = fetchFn.mock.calls[0][1] as RequestInit;
		expect((opts.headers as Record<string, string>).authorization).toBe('Bearer tok-9');
	});

	it('does not import when the manifest reports no_bundle (a named, non-crashing state)', async () => {
		const fetchFn = okManifestFetch({
			mod_id: 'reference',
			tag: 'mod-reference',
			status: 'no_bundle',
			bundle_url: null
		});
		const importFn = vi.fn(async () => ({}));

		const result = await loadModBundle('reference', { fetchFn, importFn });

		expect(importFn).not.toHaveBeenCalled();
		expect(result).toEqual({ status: 'no_bundle', tag: 'mod-reference' });
	});

	it('reports a 404 manifest as a zero-surface not-found, without importing', async () => {
		const fetchFn = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
		const importFn = vi.fn(async () => ({}));

		const result = await loadModBundle('gone', { fetchFn, importFn });

		expect(importFn).not.toHaveBeenCalled();
		expect(result).toEqual({ status: 'not_found' });
	});
});

describe('client R2 AC2: the manifest is re-fetched on each view-entry (never cached across an update)', () => {
	it('fetches the manifest fresh on every call — the resolved URL is not cached across calls', async () => {
		// First entry: the server serves version A of the bundle.
		const first = okManifestFetch({
			mod_id: 'reference',
			tag: 'mod-reference',
			status: 'ok',
			bundle_url: '/static/mods/reference/entry.AAAA.js'
		});
		const importFn = vi.fn(async (_url: string) => ({}));
		await loadModBundle('reference', { fetchFn: first, importFn });

		// The mod is rebuilt server-side; a later view-entry re-fetches the manifest
		// and now sees version B — proving the loader does NOT reuse the URL it
		// already resolved for this mod id.
		const second = okManifestFetch({
			mod_id: 'reference',
			tag: 'mod-reference',
			status: 'ok',
			bundle_url: '/static/mods/reference/entry.BBBB.js'
		});
		await loadModBundle('reference', { fetchFn: second, importFn });

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		// Each entry imported the URL its OWN fresh manifest named.
		expect(importFn.mock.calls[0][0]).toBe(`${WEBUI_BASE_URL}/static/mods/reference/entry.AAAA.js`);
		expect(importFn.mock.calls[1][0]).toBe(`${WEBUI_BASE_URL}/static/mods/reference/entry.BBBB.js`);
	});

	it('requests the manifest with no-store so a stale cached manifest cannot be served', async () => {
		const fetchFn = okManifestFetch({
			mod_id: 'reference',
			tag: 'mod-reference',
			status: 'ok',
			bundle_url: '/static/mods/reference/entry.abc.js'
		});
		await loadModBundle('reference', { fetchFn, importFn: vi.fn(async () => ({})) });

		const opts = fetchFn.mock.calls[0][1] as RequestInit;
		expect(opts.cache).toBe('no-store');
	});
});

describe('client R2 AC6: a later navigation to the same mod reuses the module cache, does not re-register', () => {
	it('a second import() of the identical content-hashed URL is a no-op that does not throw or double-register', async () => {
		// Model the browser ES module cache: the first import of a URL runs the
		// module's top-level side effect (its own customElements.define, R3/T-C04);
		// a second import of the IDENTICAL URL returns the cached module WITHOUT
		// re-running that side effect. AC6 gets this for free from the content-hashed
		// URL, so the loader never needs a re-import guard for the unchanged case.
		let defineCount = 0;
		const moduleCache = new Map<string, unknown>();
		const importFn = vi.fn(async (url: string) => {
			if (!moduleCache.has(url)) {
				// First import for this URL: run the (once-only) registration.
				defineCount += 1;
				moduleCache.set(url, { __esModule: true, url });
			}
			return moduleCache.get(url);
		});

		// The manifest for an UNCHANGED mod names the same content-hashed URL both times.
		const stableManifest = (): ModFrontendManifest => ({
			mod_id: 'reference',
			tag: 'mod-reference',
			status: 'ok',
			bundle_url: '/static/mods/reference/entry.SAMEHASH.js'
		});

		const firstEntry = await loadModBundle('reference', {
			fetchFn: okManifestFetch(stableManifest()),
			importFn
		});
		const secondEntry = await loadModBundle('reference', {
			fetchFn: okManifestFetch(stableManifest()),
			importFn
		});

		// Both view-entries resolve; the second does not throw a NotSupportedError.
		expect(firstEntry.status).toBe('ok');
		expect(secondEntry.status).toBe('ok');
		// import() was called for each view-entry, but the module (and thus the
		// tag registration) was only realised once.
		expect(importFn).toHaveBeenCalledTimes(2);
		expect(importFn.mock.calls[0][0]).toBe(importFn.mock.calls[1][0]);
		expect(defineCount).toBe(1);
	});
});
