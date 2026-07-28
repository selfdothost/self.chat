import { WEBUI_API_BASE_URL, WEBUI_BASE_URL } from '$lib/constants';

// The runtime loader for a mod's frontend surface (client R2, T-C02).
//
// The contract is fetch-manifest-THEN-import: for a mod id we fetch that mod's
// fresh per-mod manifest (cavekit-mods-frontend-api.md R4, endpoint T-A05), and
// only if it reports a served bundle do we dynamic-`import()` the resolved bundle
// URL. The bundle URL is NEVER hardcoded and is NEVER cached across a mod update:
// the manifest fetch happens fresh on every call (the endpoint itself is served
// `no-cache, no-store, must-revalidate`), so a mod rebuilt on the server yields a
// new content-hashed URL the next time this runs, and `import()` — which caches by
// exact URL for the tab lifetime — loads the new module for the new URL while
// returning the already-registered module for an unchanged one (AC6, for free from
// the content-hashed URL).
//
// This is written as a single, standalone async function `loadModBundle(modId)`
// precisely so T-C03 can wrap it with an in-flight `Map<modId, Promise>` for
// race-safe de-duplication WITHOUT restructuring the fetch+import logic. The
// de-duplication is deliberately NOT built here.

// The exact JSON the per-mod manifest endpoint returns (T-A05, verified live):
//   GET /api/v1/mods/{mod_id}/frontend-manifest
//   200 { mod_id, tag, status: 'ok',        bundle_url: '/static/mods/<id>/entry.<hash>.js' }
//   200 { mod_id, tag, status: 'no_bundle', bundle_url: null }
//   404 (disabled / unknown / no frontend block) — a zero-surface not-found.
export type ModFrontendManifest = {
	mod_id: string;
	tag: string | null;
	status: 'ok' | 'no_bundle';
	bundle_url: string | null;
};

// The load outcome. `ok` carries the imported module (whose top-level side effect
// is the mod's own `customElements.define()`, per R3/T-C04) and the resolved tag.
// The non-`ok` variants are the honest, non-throwing conditions this task must not
// crash on; T-C06 refines the failure taxonomy (blocked-vs-unreachable, the "mod
// unavailable" UX) on top of these — the seam is left, not the feature.
export type ModLoadResult =
	| { status: 'ok'; tag: string | null; bundleUrl: string; module: unknown }
	| { status: 'no_bundle'; tag: string | null }
	| { status: 'not_found' }
	| { status: 'error'; httpStatus: number };

// Dependencies are injectable so the loader is unit-testable without a real
// network or a real bundler-analysed `import()` (a bare `import(url)` with a fully
// dynamic specifier is hard to intercept in a test). Production defaults are the
// global `fetch` and a `@vite-ignore`d dynamic import.
//
// The types are the minimal shapes the loader actually uses — the global `fetch`
// is assignable to `FetchLike` (a `Response` satisfies the read fields), and a
// test double returning just `{ ok, status, json }` is too, so neither side needs
// a cast.
export type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
export type ImportLike = (url: string) => Promise<unknown>;

export type ModLoaderDeps = {
	token?: string;
	fetchFn?: FetchLike;
	importFn?: ImportLike;
};

// Resolve the manifest's API-relative `bundle_url` against the API's ORIGIN.
//
// `bundle_url` is origin-rooted and API-relative (e.g. `/static/mods/<id>/entry.<hash>.js`,
// served by T-A03), NOT client-route-relative. It must resolve to the same origin
// every other API call targets. `WEBUI_BASE_URL` is exactly that origin base — it
// is what `WEBUI_API_BASE_URL` (`${WEBUI_BASE_URL}/api/v1`) is itself built from.
// In production it is `''`, so a same-origin absolute path stays a same-origin
// absolute path; in dev it is `http://<host>:8080`, so the bundle correctly loads
// from the API server, not the Vite dev origin. An already-absolute URL is passed
// through untouched.
export function resolveBundleUrl(bundleUrl: string): string {
	if (/^https?:\/\//i.test(bundleUrl)) {
		return bundleUrl;
	}
	return `${WEBUI_BASE_URL}${bundleUrl}`;
}

function defaultImport(url: string): Promise<unknown> {
	// `@vite-ignore` keeps Vite from trying to statically analyse a fully dynamic
	// specifier at build time; the URL is resolved at runtime from the manifest.
	return import(/* @vite-ignore */ url);
}

// Fetch the mod's fresh manifest, then import the resolved bundle if one is served.
//
// SEAM FOR T-C03: this is the one function to wrap with an in-flight-promise map
// keyed by `modId`. Its signature is stable — `(modId, deps?) => Promise<ModLoadResult>`
// — so the de-dup layer can memoise the returned promise per mod id without
// touching the fetch/import body.
export async function loadModBundle(modId: string, deps: ModLoaderDeps = {}): Promise<ModLoadResult> {
	const doFetch: FetchLike = deps.fetchFn ?? fetch;
	const doImport: ImportLike = deps.importFn ?? defaultImport;

	const manifestUrl = `${WEBUI_API_BASE_URL}/mods/${encodeURIComponent(modId)}/frontend-manifest`;

	const headers: Record<string, string> = { Accept: 'application/json' };
	if (deps.token) {
		headers.authorization = `Bearer ${deps.token}`;
	}

	// `cache: 'no-store'` is belt-and-braces alongside the endpoint's own
	// `no-cache, no-store, must-revalidate` — the manifest MUST be fresh each
	// view-entry (AC2) so a server-side mod update is picked up on next navigation.
	const res = await doFetch(manifestUrl, {
		method: 'GET',
		headers,
		cache: 'no-store'
	});

	// A 404 is the deliberate zero-surface signal: disabled, unknown, or no
	// frontend block. Reported as a distinct condition; the "mod unavailable" UX is
	// T-C06's job.
	if (res.status === 404) {
		return { status: 'not_found' };
	}
	if (!res.ok) {
		return { status: 'error', httpStatus: res.status };
	}

	const manifest = (await res.json()) as ModFrontendManifest;

	// A frontend mod that ships no built bundle yet is a named, non-crashing state
	// (the endpoint's `no_bundle`), NOT something to `import()`.
	if (manifest.status !== 'ok' || !manifest.bundle_url) {
		return { status: 'no_bundle', tag: manifest.tag };
	}

	const bundleUrl = resolveBundleUrl(manifest.bundle_url);
	const module = await doImport(bundleUrl);
	return { status: 'ok', tag: manifest.tag, bundleUrl, module };
}

// ---------------------------------------------------------------------------
// Race-safe de-duplication of concurrent load triggers (client R2, AC3/4/5;
// T-C03). This is the layer the SEAM comment above left for: it WRAPS
// `loadModBundle` in an in-flight-promise map keyed by mod id, WITHOUT touching
// the fetch+import body.
//
// Why a map, not a check-then-define guard: `customElements.define()` throws
// `NotSupportedError` on a duplicate tag, and the naive
// `if (!customElements.get(name)) define(name)` guard is not race-safe — two
// concurrent triggers can both pass the check before either defines (TOCTOU,
// research brief §Pitfalls). The race-safe mechanism is a
// `Map<modId, Promise<ModLoadResult>>`: the FIRST caller for a given id
// populates the entry with the in-flight promise; every subsequent CONCURRENT
// caller for the SAME id finds and awaits THAT promise instead of starting a
// second fetch/import — so `import()` (and therefore the bundle's own
// `define()`) runs at most once for that id.
//
// The entry is evicted once the promise SETTLES (success or failure), so:
//   - a LATER, non-concurrent call — after the first finished — starts a
//     genuinely fresh load, honouring T-C02's AC2 (the manifest is re-fetched on
//     each view-entry, never permanently memoised); and
//   - a failed load does not poison the id: a retry re-runs (client R5's
//     per-mod-id independence).
//
// The map is keyed STRICTLY by mod id, so two DIFFERENT mods load fully
// independently — there is no single global lock serialising unrelated mods
// (AC5).
const inFlightLoads = new Map<string, Promise<ModLoadResult>>();

// The de-duplicated entry point the route calls. Concurrent callers for the same
// mod id share ONE `loadModBundle` execution (one fetch, one import); callers for
// different ids proceed independently. Note: concurrent callers share the FIRST
// caller's `deps` (the shared promise is already in flight with them) — the whole
// point of de-duplication is that the second trigger does not start its own work.
export function loadModBundleDeduped(modId: string, deps: ModLoaderDeps = {}): Promise<ModLoadResult> {
	const existing = inFlightLoads.get(modId);
	if (existing) {
		// A concurrent trigger for the same id is already in flight — await it
		// rather than racing a second fetch/import (and a second `define()`).
		return existing;
	}

	// First trigger for this id: start the real load and register its promise
	// BEFORE returning, so a synchronously-following concurrent trigger finds it.
	// Evict on settle (guarded so a later, distinct entry for the same id is never
	// clobbered) so the NEXT view-entry re-fetches fresh (AC2 preserved).
	const promise = loadModBundle(modId, deps).finally(() => {
		if (inFlightLoads.get(modId) === promise) {
			inFlightLoads.delete(modId);
		}
	});

	inFlightLoads.set(modId, promise);
	return promise;
}
