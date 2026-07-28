---
created: "2026-07-23"
last_edited: "2026-07-23"
---
# Implementation tracking — mods frontend client, T-C02

Build site (in the self.ai repo): context/plans/build-site-mods-frontend-loading.md

## Task

T-C02 — Runtime loader: fetch-manifest-then-import, re-fetch on view-entry
(`cavekit-mods-frontend-client.md` R2, **AC 1, 2, 6 only**). self.chat half of
Phase 2, Tier 3. Depends on T-C01 (the generic `/(app)/mods/[id]` route,
`getEnabledMods`, the `enabledMods` store — merged at `4c97799`) and the
already-merged API side T-A05 (`GET /api/v1/mods/{mod_id}/frontend-manifest`).

**Explicitly NOT built here:** R2 AC 3, 4, 5 — the race-safe de-duplication of
concurrent same-mod triggers via an in-flight `Map<modId, Promise>`. That is
T-C03, which wraps this task's `loadModBundle` without restructuring it. A clean
seam is left, described below.

## What was built

A standalone runtime loader plus the wiring that drives it from the generic mod
route. Given a mod id, the loader fetches that mod's **fresh** per-mod manifest
and, only if the manifest reports a served bundle (`status: "ok"`),
dynamic-`import()`s the resolved bundle URL. The route re-runs the loader on each
view-entry by keying it on the reactive route param, so navigating away and back
re-fetches the manifest and would pick up a server-side mod update without an SPA
reload or a client redeploy.

### Files created

- `src/lib/mods/loader.ts` — the loader. Exports:
  - `loadModBundle(modId, deps?)` — the single async function the whole loader is
    (the **seam T-C03 wraps**). Fetches
    `GET ${WEBUI_API_BASE_URL}/mods/<id>/frontend-manifest` fresh (`cache: 'no-store'`,
    reinforcing the endpoint's own `no-cache, no-store, must-revalidate`), then
    imports the resolved bundle URL when `status === "ok"`.
  - `resolveBundleUrl(bundleUrl)` — resolves the manifest's API-relative,
    origin-rooted `bundle_url` against the API origin (`WEBUI_BASE_URL`).
  - Types `ModFrontendManifest` (the exact T-A05 payload), `ModLoadResult`,
    `ModLoaderDeps`, `FetchLike`, `ImportLike`.
- `src/lib/mods/loader.test.ts` — function-level tests (AC1, AC2-freshness, AC6)
  driving `loadModBundle` with injected fetch/import doubles.
- `src/routes/(app)/mods/[id]/route-structure.test.ts` — source-string structural
  guards (AC2: reactive-on-param not onMount; the loadModBundle seam), in the
  T-C01 `mod-nav-routing.test.ts` style.
- `src/routes/(app)/mods/[id]/page.test.ts` — a `@testing-library/svelte` render
  test of the route: proves the loader is re-invoked on each `[id]` change
  (A → B → A) and that ready/unavailable states render.

### Files modified

- `src/routes/(app)/mods/[id]/+page.svelte` — replaced the T-C01 placeholder with
  the real loader wiring: `$: modId = $page.params.id;` then
  `$: void enterMod(modId);`, where `enterMod` calls `loadModBundle` and sets a
  `loading | ready | unavailable` view state. A monotonic `loadToken` guards
  against a stale async completion clobbering a newer view-entry's display state
  (this is last-write-wins for the view, NOT the concurrent-import de-dup — that
  is T-C03).

## How each AC this task owns is proven

- **AC1** (fetch the per-mod manifest, THEN `import()` the resolved URL; never
  hardcoded, never cached across an update) — code: `loadModBundle` in
  `loader.ts` fetches `${WEBUI_API_BASE_URL}/mods/<id>/frontend-manifest`, reads
  `manifest.bundle_url`, resolves it via `resolveBundleUrl`, and calls
  `importFn(bundleUrl)`. The import URL is derived from the manifest every call —
  there is no module-level URL cache keyed by mod id. Tests
  (`loader.test.ts`, describe "client R2 AC1"): asserts the fetch hits the manifest
  endpoint and `import()` is then called with the manifest-resolved URL; a second
  test with a different content hash asserts the import URL changes with the
  manifest (never hardcoded); further tests assert `no_bundle` and a 404 do NOT
  import.
- **AC2** (re-fetch on each view-entry; a server-updated mod is picked up on the
  next navigation) — code: `+page.svelte` keys the load on the reactive route
  param (`$: void enterMod(modId)`), not a one-time `onMount`, so SvelteKit's
  navigation lifecycle re-runs it each view-entry (the same reused-instance pattern
  `(app)/channels/[id]` relies on); the loader always fetches fresh
  (`cache: 'no-store'`). Tests: `loader.test.ts` "client R2 AC2" — two calls fetch
  the manifest afresh and each imports the URL its OWN manifest named (version A
  then version B), proving the resolved URL is not cached across calls; plus a
  `no-store` header assertion. `route-structure.test.ts` — asserts the source keys
  the load on `$page.params.id` reactively and uses no `onMount`. `page.test.ts` —
  a render test navigating A → B → A asserts `loadModBundle` is called three times
  with the right id each time (re-entry re-fetches, is not skipped).
- **AC6** (a later navigation to the same mod reuses the already-registered
  element and does not re-register) — code: because the resolved URL is
  content-hashed and stable for an unchanged mod, a second `import()` of the
  identical URL is a browser-module-cache no-op that returns the cached module
  without re-running its top-level `customElements.define()` — so the loader needs
  no re-import guard for the unchanged case (and the changed case gets a new URL,
  handled by AC1/AC2). Test: `loader.test.ts` "client R2 AC6" — an `importFn`
  modelling the ES module cache asserts two view-entries of the same content-hashed
  URL both resolve without throwing and register exactly once (`defineCount === 1`),
  while `import()` is invoked once per entry.

## The seam left for T-C03

`loadModBundle(modId: string, deps?: ModLoaderDeps): Promise<ModLoadResult>` in
`src/lib/mods/loader.ts` is the single async function that performs the whole
fetch-then-import. T-C03 wraps it with an in-flight `Map<modId, Promise<ModLoadResult>>`
(memoising the returned promise per mod id, evicting on settle) so two concurrent
triggers share one `import()`/`define()` — **without touching the fetch/import
body**. The signature is stable and the fetch+import logic is NOT inlined into the
Svelte reactive block (a `route-structure.test.ts` guard pins that the route loads
through the imported `loadModBundle`, not inline).

## How bundle_url (API-relative) is resolved against the client fetch base

`bundle_url` from the manifest is origin-rooted and API-relative (e.g.
`/static/mods/reference/entry.<hash>.js`, served by T-A03) — NOT client-route
relative. `resolveBundleUrl` prepends `WEBUI_BASE_URL` (the API **origin** base,
imported from `src/lib/constants.ts` — the exact base `WEBUI_API_BASE_URL =
${WEBUI_BASE_URL}/api/v1` is itself built from). In production `WEBUI_BASE_URL` is
`''`, so a same-origin absolute path stays a same-origin absolute path; in dev it
is `http://<host>:8080`, so the bundle loads from the API server rather than the
Vite dev origin. An already-absolute `http(s)://` URL is passed through untouched.
This mirrors how every sibling API call in the repo derives its base.

## Deferred to later tasks (not built here)

- **Concurrent-trigger de-dup** (R2 AC 3, 4, 5) — T-C03, wraps `loadModBundle`.
- **Custom-element instantiation + property assignment** (R3) — T-C04. This task
  imports the bundle (triggering its self-registration) and renders a ready mount
  container carrying `data-mod-tag`; it does NOT create the element instance.
- **`<svelte:boundary>` containment** (R4) — T-C05, wraps the mount container.
- **Full graceful-failure UX** (R5, blocked-vs-unreachable, the "mod unavailable"
  fallback) — T-C06. This task renders a minimal `unavailable` state for
  `not_found` / `no_bundle` / error / load-time throw so nothing crashes or hangs
  silently, but does not distinguish the failure kinds.

## Notes / could-not-verify

- Could not run vitest / eslint / svelte-check / build locally (infra policy:
  self.chat builds run in CI only — confirmed this session). Files were written to
  pass those checks and self-reviewed by reading them back for type soundness,
  import correctness, and tag balance; not executed here.
- Written in the repo's legacy Svelte-5 style (`$:` reactive statements, store
  `$`-autosubscribe) to match `(app)/channels/[id]` and every existing component,
  avoiding a runes/legacy mixing warning under svelte-check.
- The loader accepts injected `fetchFn`/`importFn` specifically so a bare dynamic
  `import(url)` (hard to intercept under jsdom) is testable; production uses the
  global `fetch` and a `@vite-ignore`d `import()`.
- Not independently confirmed by execution: whether importing the route
  `+page.svelte` directly in `page.test.ts` under the SvelteKit vitest plugin
  collects cleanly. Mitigated: AC1/AC2/AC6 are each also proven by
  `loader.test.ts` (function-level) and `route-structure.test.ts` (source-level),
  neither of which imports the component — so the ACs stand even if that one render
  test needs an environment tweak in CI.
```
