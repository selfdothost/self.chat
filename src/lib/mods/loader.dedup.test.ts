import { describe, it, expect, vi } from 'vitest';

import { loadModBundleDeduped, type ModFrontendManifest } from './loader';
import { WEBUI_BASE_URL } from '$lib/constants';

// client R2 (T-C03) — race-safe de-duplication of concurrent load triggers
// (AC3, AC4, AC5). These tests drive `loadModBundleDeduped` — the wrapper that
// owns the in-flight `Map<modId, Promise>` around T-C02's `loadModBundle` — with
// injected `fetch`/`import` doubles, exactly as `loader.test.ts` does, plus a
// manually-gated fetch so two triggers are genuinely in flight at once.

// A promise whose resolution/rejection we control by hand, so a load can be held
// mid-fetch while a second, concurrent trigger for the same id arrives.
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

// A fetch double returning a given manifest as a 200 JSON response.
const okManifestFetch = (manifest: ModFrontendManifest) =>
	vi.fn(async (_url: string, _init?: RequestInit) => ({
		ok: true,
		status: 200,
		json: async () => manifest
	}));

const okManifest = (id: string, hash: string): ModFrontendManifest => ({
	mod_id: id,
	tag: `mod-${id}`,
	status: 'ok',
	bundle_url: `/static/mods/${id}/entry.${hash}.js`
});

// A NotSupportedError-shaped throw — the exact shape `customElements.define()`
// raises on a duplicate tag. Used by importFn doubles that must never be called
// twice for the same URL: if de-duplication fails and a second import runs, the
// test fails with this throw, proving the guard prevents the second CALL, not just
// that the outcome happens to agree.
function notSupportedError(tag: string): Error {
	const e = new Error(`a custom element with name "${tag}" has already been defined`);
	e.name = 'NotSupportedError';
	return e;
}

describe('client R2 AC3/AC4: two concurrent triggers for the same mod id de-dup to one execution', () => {
	it('runs at most one fetch and one import; both callers await the SAME in-flight promise', async () => {
		const manifest = okManifest('reference', 'abc123');

		// Hold the fetch in flight until we release it, so BOTH triggers are pending
		// at the same time — the actual race the map must survive.
		const gate = deferred<void>();
		let fetchCount = 0;
		const fetchFn = vi.fn(async (_url: string) => {
			fetchCount += 1;
			await gate.promise;
			return { ok: true, status: 200, json: async () => manifest };
		});

		// import() may run at most once per URL: a second call is a duplicate
		// registration and throws NotSupportedError, failing the test loudly.
		const importedUrls = new Set<string>();
		const importFn = vi.fn(async (url: string) => {
			if (importedUrls.has(url)) {
				throw notSupportedError('mod-reference');
			}
			importedUrls.add(url);
			return { __esModule: true };
		});

		// Two near-simultaneous triggers (double-click / two racing nav events),
		// BEFORE the first fetch resolves.
		const p1 = loadModBundleDeduped('reference', { fetchFn, importFn });
		const p2 = loadModBundleDeduped('reference', { fetchFn, importFn });

		// The second trigger awaited the first's promise rather than starting its
		// own — proven by identity, not by after-the-fact agreement.
		expect(p1).toBe(p2);

		gate.resolve();
		const [r1, r2] = await Promise.all([p1, p2]);

		// Exactly one fetch and one import happened across the two triggers.
		expect(fetchCount).toBe(1);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(importFn).toHaveBeenCalledTimes(1);
		// No duplicate define() could have occurred: import ran once, so the
		// NotSupportedError branch was never reached.

		// Both callers received the identical result object (same in-flight promise).
		expect(r1).toBe(r2);
		expect(r1).toMatchObject({ status: 'ok', tag: 'mod-reference' });
	});

	it('a third concurrent trigger for the same id also shares the one in-flight promise', async () => {
		const gate = deferred<void>();
		const fetchFn = vi.fn(async (_url: string) => {
			await gate.promise;
			return { ok: true, status: 200, json: async () => okManifest('reference', 'zzz') };
		});
		const importFn = vi.fn(async () => ({}));

		const p1 = loadModBundleDeduped('reference', { fetchFn, importFn });
		const p2 = loadModBundleDeduped('reference', { fetchFn, importFn });
		const p3 = loadModBundleDeduped('reference', { fetchFn, importFn });

		expect(p2).toBe(p1);
		expect(p3).toBe(p1);

		gate.resolve();
		await Promise.all([p1, p2, p3]);

		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(importFn).toHaveBeenCalledTimes(1);
	});
});

describe('client R2 AC5: two different mod ids load independently — the map does not serialize them', () => {
	it('a second mod id completes while the first is still held mid-fetch', async () => {
		// alpha is held in flight and never released within the assertions.
		const gateA = deferred<void>();
		const fetchA = vi.fn(async (_url: string) => {
			await gateA.promise;
			return { ok: true, status: 200, json: async () => okManifest('alpha', 'a1') };
		});
		// beta resolves immediately.
		const fetchB = okManifestFetch(okManifest('beta', 'b1'));
		const importFn = vi.fn(async () => ({}));

		// alpha starts and blocks on its gate...
		const pa = loadModBundleDeduped('alpha', { fetchFn: fetchA, importFn });
		// ...beta starts AND fully completes without waiting for alpha — if the map
		// were a single global lock, this await would hang on alpha's gate.
		const rb = await loadModBundleDeduped('beta', { fetchFn: fetchB, importFn });

		expect(fetchB).toHaveBeenCalledTimes(1);
		expect(rb).toMatchObject({ status: 'ok', tag: 'mod-beta' });

		// alpha is still independent and in flight; release it and confirm it too
		// resolves on its own manifest.
		gateA.resolve();
		const ra = await pa;
		expect(ra).toMatchObject({ status: 'ok', tag: 'mod-alpha' });

		// Each id fetched exactly its own manifest — no cross-serialization, no
		// cross-contamination.
		expect(fetchA).toHaveBeenCalledTimes(1);
	});

	it('two different ids triggered together both start their fetch immediately (neither blocks the other)', async () => {
		const gateA = deferred<void>();
		const gateB = deferred<void>();
		const started: string[] = [];
		const heldFetch = (id: string, gate: Deferred<void>) =>
			vi.fn(async (_url: string) => {
				started.push(id);
				await gate.promise;
				return { ok: true, status: 200, json: async () => okManifest(id, 'h') };
			});
		const fetchA = heldFetch('alpha', gateA);
		const fetchB = heldFetch('beta', gateB);
		const importFn = vi.fn(async () => ({}));

		const pa = loadModBundleDeduped('alpha', { fetchFn: fetchA, importFn });
		const pb = loadModBundleDeduped('beta', { fetchFn: fetchB, importFn });

		// Both fetches were entered synchronously — the second did not wait on the
		// first's promise (which is what a global lock would force).
		expect(started).toEqual(['alpha', 'beta']);
		expect(fetchA).toHaveBeenCalledTimes(1);
		expect(fetchB).toHaveBeenCalledTimes(1);

		gateA.resolve();
		gateB.resolve();
		await Promise.all([pa, pb]);
	});
});

describe('client R2 AC2 preserved: the in-flight entry is evicted on settle (not permanently memoized)', () => {
	it('a LATER call for the same id after the first settled re-fetches fresh', async () => {
		const importFn = vi.fn(async (_url: string) => ({}));

		// First view-entry, allowed to fully settle (server serves version AAAA).
		const first = okManifestFetch(okManifest('reference', 'AAAA'));
		const r1 = await loadModBundleDeduped('reference', { fetchFn: first, importFn });
		expect(r1.status).toBe('ok');

		// The mod is rebuilt server-side. A LATER, non-concurrent navigation to the
		// same id MUST NOT reuse the settled promise — the entry was evicted on
		// settle, so this genuinely re-fetches and picks up version BBBB. If the map
		// permanently memoized, `second` would never be called and the import URL
		// would still name AAAA — breaking T-C02's AC2.
		const second = okManifestFetch(okManifest('reference', 'BBBB'));
		const r2 = await loadModBundleDeduped('reference', { fetchFn: second, importFn });
		expect(r2.status).toBe('ok');

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		expect(importFn).toHaveBeenNthCalledWith(1, `${WEBUI_BASE_URL}/static/mods/reference/entry.AAAA.js`);
		expect(importFn).toHaveBeenNthCalledWith(2, `${WEBUI_BASE_URL}/static/mods/reference/entry.BBBB.js`);
	});

	it('evicts the entry even when the load rejects, so a later retry is not poisoned', async () => {
		const boom = vi.fn(async () => {
			throw new Error('network down');
		});
		await expect(
			loadModBundleDeduped('flaky', { fetchFn: boom, importFn: vi.fn(async () => ({})) })
		).rejects.toThrow('network down');

		// The rejected entry was evicted (not left stuck as a permanently-rejected
		// promise), so a retry genuinely re-runs and can succeed.
		const ok = okManifestFetch(okManifest('flaky', 'ok1'));
		const r = await loadModBundleDeduped('flaky', { fetchFn: ok, importFn: vi.fn(async () => ({})) });

		expect(boom).toHaveBeenCalledTimes(1);
		expect(ok).toHaveBeenCalledTimes(1);
		expect(r.status).toBe('ok');
	});
});
