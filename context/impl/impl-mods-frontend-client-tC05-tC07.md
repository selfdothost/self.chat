---
created: "2026-07-23"
last_edited: "2026-07-23"
---
# Implementation tracking — mods frontend client, T-C05 + T-C07

Build site (in the self.ai repo): context/plans/build-site-mods-frontend-loading.md

## Tasks

- **T-C05 — Containment: `<svelte:boundary>` around the mount**
  (`cavekit-mods-frontend-client.md` R4, all 5 AC).
- **T-C07 — Teardown on navigation away** (`cavekit-mods-frontend-client.md` R6,
  all 4 AC).

Built together on `wt/mods-frontend-tC05-tC07` (self.chat), off
`cavekit/mods-frontend-client` @ `e1bd011` (T-C01…T-C06). Grouped because both touch
the mount container's lifecycle in the same route file
(`src/routes/(app)/mods/[id]/+page.svelte`) — T-C05 wraps the mount and moves the
mount trigger inside the boundary; T-C07 verifies/documents the teardown of that
same mount.

Svelte version confirmed: **5.56.4** (past 5.51+), so `<svelte:boundary>`
(`onerror` prop + `failed` snippet) and `{#snippet}` are fully supported. `{#snippet}`
is already used elsewhere in the repo (`SelectContent.svelte`, `Pagination.svelte`,
`DropdownMenuContent.svelte`); this is the repo's first `<svelte:boundary>`.

## What was built

### T-C05 (R4) — `<svelte:boundary>` containment

The `ready`-branch mount point is wrapped in Svelte 5's native
`<svelte:boundary>` with an `onerror` prop and a `failed` snippet. **Exact syntax
used** (verify against real Svelte 5 docs):

```svelte
<svelte:boundary onerror={(error) => reportModCrash(error)}>
    <div ... data-mod-state="ready" data-mod-tag={tag} use:mountMod={tag ?? ''}></div>

    {#snippet failed(error, reset)}
        <div data-mod-state="crashed" data-mod-failure="runtime_error" data-mod-error={String(error)}>
            ...
            <button data-mod-reset on:click={() => reset()}>Reload this mod</button>
        </div>
    {/snippet}
</svelte:boundary>
```

- `onerror` signature: `(error, reset)` per Svelte docs — we use only `error` (to
  attribute the crash to the specific mod via `reportModCrash`). We do **not** call
  `reset` inside `onerror` (Svelte requires the boundary to settle first).
- `failed` snippet signature: `(error, reset)` — both used (`error` surfaced on
  `data-mod-error`, `reset` bound to the "Reload this mod" button for soft in-SPA
  recovery, never a page reload).

**The load-bearing design decision:** the actual DOM mount was moved out of
`enterMod` (where it ran in an async continuation after `await tick()`, i.e. OUTSIDE
any rendering/effect frame — so a boundary could never catch a mount-time throw)
and into a Svelte **action** `use:mountMod={tag}` on the container **inside** the
boundary. Svelte runs actions as effects, and `<svelte:boundary>` catches errors
thrown while running effects. So a **synchronous** throw from the mod's
custom-element construction / `connectedCallback` / initial render now propagates
out of `appendChild` → out of the action → into the boundary, which renders the
contained `failed` state. `mountModElement(elementTag, host)` (T-C04's contract:
`createElement`, property-assignment-before-insertion, `replaceChildren`) is
unchanged; only its **call site** moved from `enterMod` to the action.

`enterMod`'s `ok` branch now just publishes `tag` + `state = 'ready'` and returns;
the action does the DOM work when the branch renders. `tick`/`container`/`bind:this`
were removed (no longer needed).

**Named residual risks (R4 AC4 — documented in the source, deliberately NOT solved):**

1. A genuinely **runaway** mod (an infinite loop, not a thrown error) has **no**
   in-browser containment short of a Worker/iframe — an accepted residual risk of
   the same-origin, same-privilege, operator-trusted trust model this project chose.
2. The mod is a **separate-bundle** Svelte custom element with its **own** Svelte
   runtime/scheduler (shadow DOM). Its **async** reactive-effect errors run under the
   mod's own scheduler, and event-handler / `setTimeout` throws run outside any
   rendering-or-effect frame — Svelte boundaries do not catch those in general (per
   Svelte's docs), and the host boundary cannot reach the mod's separate runtime.
   What the boundary contains here is the **synchronous mount/render** error class;
   the async class is the mod author's own responsibility. This is stated plainly in
   the source comment rather than glossed — it is the honest edge of R4's mechanism
   in THIS architecture.

### T-C07 (R6) — teardown on navigation away

Mostly verification + documentation: teardown is the standard Web Components path
(real DOM removal fires `disconnectedCallback`; Svelte destroys the inner component
next tick), needing no bespoke plumbing.

- **Confirmed nothing interferes.** `mountModElement`'s `host.replaceChildren()` is
  now purely **defensive**: because the mount runs from the action on the `ready`
  branch's container, and Svelte's `{#if}` destroys+recreates a **fresh** container
  node on every view-entry (each entry passes through `state = 'loading'` first), the
  host handed to the action is always empty. The previous mod's element is torn down
  by the `{#if}` destroy (native removal → `disconnectedCallback`), not by the clear.
  The `mountMod` action carries **no `destroy`** — adding one would be the "bespoke
  teardown code" the kit says is neither needed nor wanted.
- **Documented the boundary of coverage (AC3).** The source states that destroying
  the inner Svelte component runs the mod's own `onDestroy`, but **non-Svelte side
  effects** a mod opens itself (raw WebSockets, `setInterval`/`setTimeout`,
  `ResizeObserver`) are the **mod author's** responsibility to clean up in
  `onDestroy`; this mechanism neither enforces nor automates that.
- **Same-tick reattach edge (AC4).** The code shape makes nav-away a genuine destroy:
  `enterMod` sets `state = 'loading'` **synchronously** on every entry (before any
  `await`), so an A → B navigation tears A's `ready` branch down immediately and only
  mounts B later (after the async load) — never a same-tick detach+reattach (which
  Svelte deliberately optimises into no teardown).

## Files changed

- `src/routes/(app)/mods/[id]/+page.svelte` — **modified**. Added `<svelte:boundary>`
  around the `ready` mount (R4); moved the mount trigger into a `use:mountMod` action
  inside the boundary; added `reportModCrash` (`onerror` attribution) and the `failed`
  snippet; removed `tick`/`container`/`bind:this` and the enterMod mount block;
  expanded teardown + residual-risk documentation (R4/R6). The load control flow
  (`state`, `enterMod`, `loadToken`, the reactive `$:` block) and the R5 `unavailable`
  branch are otherwise unchanged.
- `src/routes/(app)/mods/[id]/boundary.test.ts` — **new** (R4's 5 AC).
- `src/routes/(app)/mods/[id]/teardown.test.ts` — **new** (R6's 4 AC).

## How each R4 AC is proven

- **R4-1** (mount wrapped in a Svelte 5 `<svelte:boundary>`) — code: the boundary
  encloses the `use:mountMod` container. Test `boundary.test.ts` "R4 AC1": structural
  guard that `use:mountMod` sits between `<svelte:boundary` and `</svelte:boundary>`,
  and that the boundary uses the real API shape (`onerror={` prop + `{#snippet failed(`);
  plus a render test that a well-behaved mod (`mod-ok`) still mounts normally inside
  the boundary (the boundary is transparent when nothing throws).
- **R4-2** (a post-mount thrown error is caught by the boundary, does NOT break the
  shell/Sidebar/other nav) — code: the mount runs in the action inside the boundary,
  so a synchronous mount throw is caught. Test "R4 AC2 + AC3": a real `mod-crash`
  custom element throws in `connectedCallback`; the boundary renders `crashed` and the
  outer `[data-mod-view]` shell survives; a second test navigates crash → ok and the
  healthy mod mounts (crash did not poison the shell).
- **R4-3** (a caught runtime error renders the failed state within the mod's view
  slot) — code: the `failed` snippet renders `data-mod-state="crashed"`
  `data-mod-failure="runtime_error"`. Test "R4 AC2 + AC3": asserts the crashed node is
  a descendant of `[data-mod-view]`, carries `runtime_error`, and is distinct from the
  load-failure `unavailable` state (which is absent).
- **R4-4** (runaway-loop residual risk documented, not enforced) — Test "R4 AC4":
  `src` names "runaway", "Worker/iframe", and "residual risk"; comment-stripped `code`
  contains NO `new Worker(` or `<iframe` — documented, not solved.
- **R4-5** (load-time = try/catch's job; post-mount thrown = boundary's job; neither
  does the other's) — code: the try/catch wraps ONLY `loadModBundleDeduped`; the mount
  lives inside the boundary, not inside a try/catch. Test "R4 AC5": source guard that
  the try/catch encloses the loader call and that `use:mountMod` is inside the boundary
  region, plus the behavioural contrast (a mount throw reaches `crashed`, not the
  loader's `unavailable`).

## How each R6 AC is proven

- **R6-1** (nav-away removes the element, firing `disconnectedCallback`; inner
  component destroyed next tick; no bespoke teardown) — Test `teardown.test.ts`
  "R6 AC1": a lifecycle-recording custom element is mounted for `alpha`; navigating to
  `beta` fires exactly one `disconnectedCallback` on the SAME alpha element instance,
  `alphaEl.isConnected === false`, and `document.querySelector('mod-alpha')` is null —
  a genuine DOM removal, proved rather than trusted.
- **R6-2** (after teardown, re-navigating mounts a FRESH instance) — Test "R6 AC2":
  alpha → beta → alpha yields two DISTINCT alpha element instances, with the first
  alpha disconnected before the second connected (per-instance, consistent with R3).
- **R6-3** (non-Svelte side effects are the mod author's responsibility; mechanism
  neither enforces nor automates) — code: the source documents `onDestroy` +
  WebSocket/setInterval/setTimeout/ResizeObserver as the mod author's job. Test
  "R6 AC3": `src` matches `onDestroy`, a side-effect type, and "mod author";
  comment-stripped `code` contains no bespoke cleanup (`clearInterval`/`clearTimeout`/
  `.disconnect()`) and the action has no element-reaching `destroy`.
- **R6-4** (same-tick detach+reattach optimisation accounted for; normal nav genuinely
  removes) — code: `enterMod` resets to `state = 'loading'` synchronously per entry.
  Test "R6 AC4": source guard for the `state = 'loading'` reset + the `{#if}` +
  `use:mountMod` shape; plus a behavioural test that nav-away fires exactly one
  `disconnect` (a same-tick reattach would fire none), asserting we are NOT in the
  optimised-away case.

## Notes / could-not-verify

- **No local `vitest`/`eslint`/`svelte-check`/`build` run** (this host's CI-only
  policy for self.chat, confirmed this session). Files were written to pass those
  checks and self-reviewed by reading back; NOT executed here. Same caveat as
  T-C01…T-C06.
- **The one runtime behaviour I could not execute-verify:** that Svelte routes a
  throw from a `use:` action (the `connectedCallback` throw during `appendChild`) into
  the enclosing `<svelte:boundary>` under jsdom + vitest. The reasoning is sound —
  Svelte runs actions as effects, and boundaries catch effect throws (Svelte docs) —
  and the `boundary.test.ts` AC2/AC3 render test is written to prove it, but I could
  not run it. If that routing differs in practice, that render test would need
  adjusting; the structural/source guards for R4 AC1/AC4/AC5 stand regardless.
- **Same-tick reattach (R6 AC4), honestly bounded:** the tests drive a stand-in
  `page` store to simulate SvelteKit navigation (the same technique every sibling
  route test uses). I could NOT run the real SvelteKit router to confirm production
  route transitions never hit the same-tick detach+reattach optimisation for the
  common case. The code shape (`state = 'loading'` reset per entry) makes it a genuine
  destroy in the modelled path; the real-router transition internals were not directly
  exercised on this host.
- **Pre-existing test breakage observed, NOT fixed (out of scope — flagged for the
  orchestrator):** the current merged `+page.svelte` imports/calls
  `loadModBundleDeduped` (the T-C03 dedup wrapper), but the sibling test files from
  T-C02/T-C04/T-C06 — `mount.test.ts`, `graceful-failure.test.ts`, `page.test.ts` —
  and `route-structure.test.ts` still mock/assert the OLD `loadModBundle` name. With
  those mocks, `loadModBundleDeduped` is `undefined` in the module and the route calls
  a non-function, so those render tests would fail (and `route-structure.test.ts`'s
  `import { loadModBundle }` assertion no longer matches the source). This looks like
  fallout from the T-C03 → T-C04/T-C06 manual merge (both branched off `0192602`
  before T-C03 landed). My new tests mock `loadModBundleDeduped` (the name the code
  actually imports). Fixing the older tests is a separate task's scope — surfaced here
  and in the task report rather than silently altered.
