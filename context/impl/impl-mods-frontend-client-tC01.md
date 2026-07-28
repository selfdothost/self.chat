---
created: "2026-07-23"
last_edited: "2026-07-23"
---
# Implementation tracking — mods frontend client, T-C01

Build site (in the self.ai repo): context/plans/build-site-mods-frontend-loading.md

## Task

T-C01 — Registry-driven nav, one generic route, no per-mod route file
(`cavekit-mods-frontend-client.md` R1). self.chat half of Phase 2, Tier 2.
Depends on already-merged API side (T-A01 `FrontendBlock` nav shape, T-A06
registry endpoint reports nav fields).

## What was built

The client reads `GET /api/v1/mods/enabled` on boot and renders one sidebar nav
entry per mod whose `add_to_nav` is true, using that entry's `label` + `icon`.
Every mod entry links to ONE generic id-parameterized route so adding a mod
requires no `src/routes/` change and no client rebuild. This task is nav +
routing plumbing only; the placeholder route just receives the id — the loader /
mount (T-C02+) build inside it.

### Files created

- `src/lib/apis/mods/index.ts` — new `mods` API module (the repo had none).
  Exports `getEnabledMods(token)` and the `ModRegistryEntry` type. Mirrors the
  sibling modules' conventions exactly (`$lib/apis/tools/index.ts`): builds the
  URL from `WEBUI_API_BASE_URL`, attaches `authorization: Bearer ${token}`,
  `if (!res.ok) throw await res.json()`, `error = err.detail`. Returns the
  server's array (already scope-filtered), `[]` on empty body.
- `src/lib/stores/mods.ts` — `enabledMods` writable store of `ModRegistryEntry[]`,
  populated at boot, read by the nav.
- `src/routes/(app)/mods/[id]/+page.svelte` — the ONE generic route. Reads
  `$page.params.id` (same pattern as `(app)/channels/[id]/+page.svelte`).
  Minimal placeholder for T-C01.
- `src/lib/components/layout/Sidebar/ModNav.svelte` — renders the registry-driven
  entries from `$enabledMods`, filtered by `add_to_nav === true`, each linking via
  `resolve('/(app)/mods/[id]', { id: mod.id })`. No permission/role gating.
- Tests: `src/lib/apis/mods/index.test.ts`,
  `src/lib/components/layout/Sidebar/ModNav.test.ts`,
  `src/lib/components/layout/mod-nav-routing.test.ts`.

### Files modified

- `src/lib/stores/index.ts` — barrel re-export `export * from './mods';`.
- `src/lib/components/layout/Sidebar.svelte` — import `getEnabledMods`, `ModNav`,
  `enabledMods`; add `initMods()` (fetch → store) called in `onMount` after
  `initChatList()`; render `<ModNav />` additively, directly after the Workspace
  nav block. Core nav items untouched.

## How each of R1's 5 AC is proven

- **AC1** (one entry per `add_to_nav` mod, using label+icon) — code: `ModNav.svelte`
  `$: navMods = $enabledMods.filter((mod) => mod.add_to_nav === true)` + the
  `{#each navMods}` block rendering `{mod.label ?? mod.name}` and the icon.
  Test: `ModNav.test.ts` "AC1" — two `add_to_nav:true` mods → 2 links, both labels
  present; second case asserts emoji icon renders as a glyph and a path icon as
  `<img src=…>`.
- **AC2** (omitted mod → no entry; no client gating) — code: the only filter is
  `add_to_nav`; no `$user`/`permissions`/`role` reference in `ModNav.svelte`.
  Test: `ModNav.test.ts` "AC2" — `add_to_nav:false` and no-frontend mods render no
  entry; only the response's contents render. `mod-nav-routing.test.ts` "AC2"
  asserts the source has no `permissions`/`$user`/`role` gating.
- **AC3** (one generic id-parameterized route; no per-mod file; no rebuild) —
  code: single route file `(app)/mods/[id]/+page.svelte`; `ModNav` links every mod
  through `resolve('/(app)/mods/[id]', { id: mod.id })`. Test: `ModNav.test.ts`
  "AC3" — two different mod ids yield distinct `data-mod-id` but identical route id
  href. `mod-nav-routing.test.ts` "AC3" — the `[id]` route file exists,
  `src/routes/(app)/mods` contains ONLY `[id]`, a whole-tree walk finds no concrete
  per-mod route dir, and the source uses the parameterized `resolve` (not a
  string-built `/mods/<id>` path).
- **AC4** (core nav unchanged; entries additive) — code: Sidebar change only imports
  + adds `<ModNav />` after the Workspace block; no built-in item edited. Test:
  `mod-nav-routing.test.ts` "AC4" — Sidebar still contains `sidebar-new-chat-button`
  and the Workspace item, and now renders `<ModNav />` + the boot wiring.
- **AC5** (zero mods → no entries, shell unaffected) — code: an empty
  `$enabledMods` produces an empty `{#each}`. Test: `ModNav.test.ts` "AC5" — empty
  store → zero `a[data-mod-id]` links.

## API client for the registry endpoint

`getEnabledMods(token: string)` in `src/lib/apis/mods/index.ts` — NEW module
(`src/lib/apis/mods/` did not exist). Calls
`GET ${WEBUI_API_BASE_URL}/mods/enabled` (i.e. `/api/v1/mods/enabled`). Consumes
the real T-A06 shape: `id`, `name`, `scopes` always; `bundle_url`, `view`,
`label`, `icon`, `add_to_nav` only when the mod declares a `frontend` block.

## Generic route chosen (for T-C02+)

`src/routes/(app)/mods/[id]/+page.svelte` — route id `/(app)/mods/[id]`, param
`id`. T-C02 onward builds the loader + mount container inside this file.

## Notes / could-not-verify

- Could not run vitest/eslint/svelte-check/build locally (infra policy: self.chat
  builds run in CI only). Files were written to pass those checks; not executed
  here. Self-reviewed for type soundness, tag balance, and import correctness.
- Written in the repo's legacy Svelte-5 style (`$:` reactive, `on:click`,
  store `$`-autosubscribe) rather than runes, to match every existing component
  and avoid a runes/legacy mixing warning under svelte-check.
- The typed `resolve('/(app)/mods/[id]', …)` requires `svelte-kit sync` to have
  generated the route type from the new `[id]` file — standard, and identical to
  the existing `(app)/channels/[id]` usage.
