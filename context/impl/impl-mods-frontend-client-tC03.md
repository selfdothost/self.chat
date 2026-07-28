---
created: "2026-07-23"
last_edited: "2026-07-23"
---
# Implementation tracking — mods frontend client, T-C03

Build site (in the self.ai repo): context/plans/build-site-mods-frontend-loading.md

## Task

T-C03 — Race-safe de-duplication of concurrent load triggers
(`cavekit-mods-frontend-client.md` R2, **AC 3, 4, 5 only** — the three criteria
T-C02 deliberately left). self.chat half of Phase 2, Tier 4. Built on
`wt/mods-frontend-tC03`, off `cavekit/mods-frontend-client` commit `0192602`
(which merged T-C01 + T-C02: `src/lib/mods/loader.ts` exports
`loadModBundle(modId, deps?)`).

Depends on T-C02's `loadModBundle` (the seam that task left) and the T-C01
generic route `src/routes/(app)/mods/[id]/+page.svelte`.

## What was built

A thin **wrapper** around T-C02's `loadModBundle` that owns an in-flight-promise
map keyed by mod id, plus the one-line-per-call-site swap making it live in the
route. The fetch+import body of `loadModBundle` was NOT restructured — the wrapper
composes it, exactly as the seam comment in `loader.ts` prescribed.

### Function added

`src/lib/mods/loader.ts`:

```ts
export function loadModBundleDeduped(modId: string, deps?: ModLoaderDeps): Promise<ModLoadResult>
```

backed by a module-level `const inFlightLoads = new Map<string, Promise<ModLoadResult>>()`.

Mechanism:

- The **first** caller for a given `modId` finds no entry, calls
  `loadModBundle(modId, deps)`, chains a `.finally()` that evicts the entry on
  settle, and registers the resulting promise in the map **before returning** — so
  a synchronously-following concurrent caller finds it.
- Every **subsequent concurrent** caller for the **same** `modId` returns the
  existing map entry (`return existing`) and awaits it — no second fetch, no second
  `import()`, no second `customElements.define()`.
- The entry is **evicted on settle** (success or failure), guarded by
  `if (inFlightLoads.get(modId) === promise)` so a later distinct entry for the
  same id is never clobbered. Eviction is what preserves T-C02's AC2 (fresh fetch
  on each *non-concurrent* view-entry) and keeps a failed load from poisoning the
  id (R5's per-mod-id independence).
- The map is keyed **strictly by `modId`**, so two different mods never collide —
  there is no single global lock serialising unrelated mods.

This is the race-safe mechanism the kit's R2 grounding demands: a
`Map<modId, Promise>`, NOT a `if (!customElements.get(name))` check-then-define
guard (which is TOCTOU-unsafe — two triggers can both pass the check before either
defines, and the duplicate `define()` throws `NotSupportedError`).

### Call site swapped (route made live)

`src/routes/(app)/mods/[id]/+page.svelte` — a **minimal, localized** change so it
merges cleanly with the concurrent T-C04/T-C06 work on the same file's render
branches:
- the import: `loadModBundle` → `loadModBundleDeduped`;
- the call inside `enterMod`: `await loadModBundle(id, …)` →
  `await loadModBundleDeduped(id, …)`;
- a stale comment updated to say the concurrent de-dup is now done by
  `loadModBundleDeduped` (T-C03), no longer "future".

The route's own monotonic `loadToken` (last-write-wins for the *view's display
state*) is untouched and complementary: it handles A→B→A display races; the map
handles same-id concurrent *execution* de-dup. Two independent guards.

### Test file created

`src/lib/mods/loader.dedup.test.ts` — drives `loadModBundleDeduped` with injected
`fetch`/`import` doubles (same style as `loader.test.ts`), plus a manually-gated
`deferred<T>()` fetch so two triggers are genuinely in flight at once (a real
race, not sequential calls that happen to agree).

## How each AC this task owns is proven

- **AC3** (two concurrent triggers for the same id → at most one `import()` and one
  `define()`; the second awaits the first's promise; no `NotSupportedError` from a
  duplicate `define()`) — code: `loadModBundleDeduped` returns the existing
  in-flight promise for a same-id concurrent caller instead of starting a second
  `loadModBundle`. Test: `loader.dedup.test.ts` describe "AC3/AC4" →
  "runs at most one fetch and one import; both callers await the SAME in-flight
  promise" holds the fetch behind a gate so both triggers are pending together,
  then asserts `fetchCount === 1` and `importFn` called **once**. The `importFn`
  double **throws a `NotSupportedError`-shaped error if called twice for the same
  URL**, so a de-dup failure would fail the test with exactly the duplicate-
  `define()` throw the AC forbids — proving the second import *call* never happens,
  not merely that the outcome agrees. A companion test proves a **third**
  concurrent trigger also shares the one promise.
- **AC4** (de-dup keyed by mod id in an in-flight `Map<modId, Promise>`, race-safe
  not check-then-define) — code: the module-level `inFlightLoads` map, populated
  **before** the first `loadModBundle` promise is returned (so a synchronously-
  following trigger finds it) and evicted on settle; there is no
  `customElements.get(...)` guard anywhere in the loader. Test: the same "await the
  SAME in-flight promise" assertion — `expect(p1).toBe(p2)` proves the second
  caller received the *identical promise object*, i.e. it awaited the first's
  in-flight promise via the map, which is the mechanism AC4 names (proven by
  reference identity, not after-the-fact result agreement).
- **AC5** (two different mods load independently; the map does not serialize
  unrelated mods) — code: the map is keyed strictly by `modId`; a different id
  finds no entry and calls `loadModBundle` immediately. Test:
  `loader.dedup.test.ts` describe "AC5" → "a second mod id completes while the
  first is still held mid-fetch" starts `alpha` held behind a gate that is never
  released before the assertions, then `await`s `beta` to **full completion** — if
  the map were a single global lock, that await would hang on alpha's gate. A
  second AC5 test asserts two ids triggered together both enter their fetch
  synchronously (`started === ['alpha','beta']`), neither blocking the other.

## AC2 (T-C02) explicitly preserved, not broken

`loader.dedup.test.ts` describe "AC2 preserved":
- "a LATER call for the same id after the first settled re-fetches fresh" — first
  call fully settles (version AAAA), then a later call re-fetches and imports
  version BBBB; asserts `second` fetch **called once** and the two imports name
  AAAA then BBBB. If eviction were missing (permanent memoization), `second` would
  never be called and the URL would still name AAAA — this test would fail. So the
  de-dup does not accidentally turn into a cache, honoring T-C02's AC2 (manifest
  re-fetched on each view-entry).
- "evicts the entry even when the load rejects" — a rejected load evicts its entry,
  so a retry re-runs and can succeed (not stuck as a permanently-rejected promise).

## Not independently verified by execution

Same host constraint as T-C01/T-C02: this host does not run
`vitest`/`eslint`/`svelte-check`/`build` for self.chat (CI-only policy, confirmed
this session). The wrapper and its tests were written to pass those checks and
self-reviewed by reading back for:
- type soundness (`.finally()` preserves `Promise<ModLoadResult>`; the fetch/import
  doubles satisfy `FetchLike`/`ImportLike`; `deferred<void>().resolve()` is
  callable with no argument);
- the synchronous-up-to-first-`await` reasoning the concurrency assertions rely on
  (an async function runs synchronously until its first `await`, so
  `loadModBundleDeduped` registers the map entry, and the injected fetch pushes its
  id / bumps its counter, before control returns to the test);
- the eviction guard being reference-checked so it never clobbers a newer entry.
Not executed here.

## Seam left for later client tasks

`loadModBundleDeduped` is now the entry point the route calls; T-C04 (custom-
element instantiation + property assignment), T-C05 (`<svelte:boundary>`), and
T-C06 (the "mod unavailable" graceful-failure UX) build on the `ModLoadResult`
this returns, unchanged by the de-dup layer — the wrapper only affects *how many
times* the load runs, not *what* it returns.
