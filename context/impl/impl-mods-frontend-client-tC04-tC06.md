---
created: "2026-07-23"
last_edited: "2026-07-23"
---
# Implementation tracking — mods frontend client, T-C04 + T-C06

Build site (in the self.ai repo): context/plans/build-site-mods-frontend-loading.md

## Tasks

- **T-C04 — Mount contract: custom element, context by property assignment**
  (`cavekit-mods-frontend-client.md` R3, all 5 AC).
- **T-C06 — Graceful failure** (`cavekit-mods-frontend-client.md` R5, all 5 AC).

Built together on `wt/mods-frontend-tC04-tC06` (self.chat), off
`cavekit/mods-frontend-client` @ `0192602` (T-C01 + T-C02). The two tasks touch
the two render branches of the same route file — T-C04 owns the `ready` branch
(instantiate + mount the mod's custom element), T-C06 owns the `unavailable`
branch (the failure-taxonomy fallback) — so they were built as one clean diff to
avoid two agents fighting the same conditional.

**Concurrent sibling:** T-C03 (branch `wt/mods-frontend-tC03`, also off `0192602`)
changes ONLY the call site inside `+page.svelte` (an import + the one
`loadModBundle(...)` call, wrapped by an in-flight de-dup `Map`). This packet
deliberately did NOT restructure the `enterMod`/`state`/`loadToken` control flow —
it only fleshed out the two render branches and the result-handling `switch` —
so the orchestrator's manual merge of the two branches is localized.

## What was built

### T-C04 (R3) — the mount contract

When the loader (T-C02) reports `{ status: 'ok', tag }`, the route now actually
instantiates the mod's custom element instead of rendering an empty placeholder:

1. A `bind:this={container}` div in the `ready` branch gives the host a raw DOM
   node to append into (the idiomatic Svelte way).
2. `enterMod`, on `ok` + a resolved `tag`, sets `state = 'ready'`, `await tick()`
   (so the container is rendered and bound), then calls `mountModElement(tag, container)`.
3. `mountModElement` does `document.createElement(tag)` — the tag was registered
   by the mod bundle's own top-level `customElements.define()` when T-C02
   `import()`ed it; the host NEVER calls `define()` and never reaches into the
   mod's internal Svelte tree (it only ever touches the one DOM element — the
   custom-element choice that sidesteps sveltejs/svelte#13186).
4. It assigns `authToken` (`localStorage.token`), `apiBase` (`WEBUI_API_BASE_URL`),
   and `currentUser` (`$user`, `SessionUser | undefined` from `$lib/stores`) as
   INSTANCE PROPERTIES on the element — **before** `host.appendChild(el)`. Property
   assignment (not HTML attributes) keeps the token off the serialized DOM and
   carries structured values; pre-insertion sets are preserved for the inner
   component's `$props()` once it mounts.

Context is per-instance: nothing is cached at module scope and no shared `window`
object is used, so mounting the same mod twice (navigate away and back) yields
independent element instances. `host.replaceChildren()` clears defensively before
each mount.

### T-C06 (R5) — graceful failure

`enterMod` previously lumped `not_found` / `no_bundle` / `error` / thrown into one
flat `'unavailable'`. It now resolves a `failureKind`
(`'not_found' | 'no_bundle' | 'server_error' | 'unreachable'`) driving a contained
"mod unavailable" fallback with a heading, an honest per-kind detail line, and a
**soft in-SPA "Try again" button** that re-runs `enterMod(modId)` — never a hard
reload. `data-mod-failure={failureKind}` exposes the kind for operators/tests.

**Blocked-vs-unreachable — the exact mechanism and its real limits:** the ONLY
distinction the browser reliably exposes is *response received* vs *no response*:

- `loadModBundle` **returns** `{ status: 'error', httpStatus }` → a real HTTP error
  response was received, so the request **reached a server** → `failureKind =
  'server_error'`, and the copy states plainly this is NOT a browser extension
  blocking it.
- `loadModBundle` **throws** (the manifest `fetch` or the dynamic `import()`
  rejected with no HTTP status, e.g. `TypeError: Failed to fetch`) → **no response
  at all** → `failureKind = 'unreachable'`, whose copy says "offline, or blocked by
  a browser extension". We do NOT claim to tell an ad-blocker
  (`ERR_BLOCKED_BY_CLIENT`) from a genuine outage — that error code is not surfaced
  to JS consistently across browsers (research brief §Pitfalls), and we do not sniff
  error-message strings. `unreachable` honestly means **"blocked OR down"**. The
  real, defensible signal is the received-response contrast, and the code comments
  say so explicitly.

`not_found` (404 — stale reference / disabled) and `no_bundle` (frontend mod with
no built bundle yet, or `ok` with no resolvable tag) each get their own honest copy.

## Files changed

- `src/routes/(app)/mods/[id]/+page.svelte` — **modified**. Fleshed out the `ready`
  branch (bind:this container + `mountModElement` + property assignment, R3) and the
  `unavailable` branch (failure taxonomy + detail copy + soft-retry button, R5);
  extended `enterMod`'s result handling into the `failureKind` switch. Control flow
  (`state`, `enterMod`, `loadToken`, the reactive `$: void enterMod(modId)`) left as
  T-C02 shaped it, for a clean T-C03 merge. Kept `data-mod-state` and
  `data-mod-tag` (T-C02's page.test.ts asserts them) and did NOT introduce
  `onMount` (route-structure.test.ts guards against it).
- `src/routes/(app)/mods/[id]/mount.test.ts` — **new** (R3's 5 AC).
- `src/routes/(app)/mods/[id]/graceful-failure.test.ts` — **new** (R5's 5 AC).

## How each R3 AC is proven

- **R3-1** (auth/apiBase/currentUser assigned as PROPERTIES before insertion) —
  code: `mountModElement` sets `ctx.authToken/apiBase/currentUser` then
  `host.appendChild(el)`. Test `mount.test.ts` "R3 AC1 + AC3": a real recorder
  custom element captures, at `connectedCallback` (fires ON insertion), the property
  values already present — `authToken === 'tok-xyz'`, `apiBase === WEBUI_API_BASE_URL`,
  `currentUser` matches the store — proving they were set pre-insertion.
- **R3-2** (nothing passed as an HTML attribute; token never serialized) — test
  "R3 AC2": the mounted element has no `authtoken`/`apibase`/`currentuser` attribute
  and neither `el.outerHTML` nor `document.body.innerHTML` contains the token string.
- **R3-3** (mod observes pre-insertion property values via `$props()`) — same
  `connectedCallback`-capture test as R3-1: connect time is the earliest the inner
  component can observe props, and all three are already present there.
- **R3-4** (per-instance; no shared `window` object) — test "R3 AC4": mount alpha →
  beta → alpha yields three connections `['mod-alpha','mod-beta','mod-alpha']`, the
  two alpha instances are DIFFERENT elements (`connections[0].el !== connections[2].el`),
  each with its own assigned context; plus a comment-stripped source guard that the
  route contains no `window` code reference.
- **R3-5** (mod self-registers its tag; host never `define()`s, never reaches into
  the Svelte tree) — test "R3 AC5": comment-stripped source guard —
  `not.toMatch(/customElements\.define/)` and `toMatch(/document\.createElement\(/)`.

## How each R5 AC is proven

- **R5-1** (404 stale reference → contained fallback, shell intact) — code:
  `not_found` → `failureKind = 'not_found'`, `state = 'unavailable'`. Test
  "R5 AC1": `[data-mod-state="unavailable"]` with `data-mod-failure="not_found"`,
  and the route's `[data-mod-view]` wrapper still present (the failure didn't blow
  up the view).
- **R5-2** (load-time throw → same fallback, no propagation to shell) — code: the
  `try/catch` around `loadModBundle` catches the throw into `failureKind =
  'unreachable'`; `enterMod` never rejects. Test "R5 AC2": a rejected
  `loadModBundle` renders the fallback and the component does not throw out (reaching
  the assertion at all proves non-propagation).
- **R5-3** (distinguish blocked vs unreachable as far as the browser exposes) —
  code: received HTTP error (`status: 'error'`) → `'server_error'` (reached a server,
  not blocked); network-level throw → `'unreachable'` (blocked OR down). Test
  "R5 AC3": three cases — throw → `unreachable`, HTTP 503 → `server_error`, and a
  side-by-side render asserting the two kinds are genuinely distinct
  (`server_error !== unreachable`). The mechanism and its limits are stated in the
  code comments and in "Blocked-vs-unreachable" above.
- **R5-4** (no full-SPA hard reload; soft recovery) — test "R5 AC4": comment-stripped
  source guard — no `location.reload` / `location.href =` / `location.assign` /
  `window.location`; plus a behavioral test that clicking `[data-mod-retry]`
  re-invokes the loader in place and recovers to `ready` (no reload).
- **R5-5** (one mod's failure leaves others loadable) — code: state is per-route
  keyed on `modId`; there is no module-scope failure cache. Test "R5 AC5": alpha
  throws → `unreachable`, then navigating to beta (same reused component) loads and
  mounts `mod-beta` to `ready` — alpha's failure did not poison beta.

## Merge note for T-C03

T-C03 only swaps the loader call (`loadModBundle` → a de-dup wrapper) at the single
site `result = await loadModBundle(id, { token: localStorage.token })` inside
`enterMod`. This packet did not touch that line's shape, the surrounding
`try/catch`, `loadToken`, or the reactive `$:` block — the two diffs to
`+page.svelte` are on disjoint concerns (call site vs render branches) and should
merge with at most a trivial context overlap around `enterMod`.

## Notes / could-not-verify

- Could not run vitest / eslint / svelte-check / build locally (this host's CI-only
  policy for self.chat, confirmed this session). Files were written to pass those
  checks and self-reviewed by reading back for type soundness, tag balance, and
  import correctness; NOT executed here. Same caveat as T-C01/T-C02.
- Written in the repo's legacy Svelte style (`$:` reactive statements, `$store`
  auto-subscribe, `on:click`) to match `(app)/channels/[id]` and T-C02's existing
  code, avoiding a runes/legacy mixing warning.
- The render tests define REAL custom elements in jsdom and assert against the
  live `connectedCallback` lifecycle — a faithful check of pre-insertion property
  preservation rather than a mock. They use `vi.waitFor` for the async mount (the
  mount runs after an internal `await tick()`), and rely on `@testing-library/svelte`
  auto-cleanup between tests (the same reliance T-C02's page.test.ts already has).
- The source guards strip comments before the "must not appear" assertions, because
  the file's comments legitimately discuss `customElements.define()` and the
  forbidden shared `window` object; the guards must match real CODE only.
