---
created: "2026-07-23"
last_edited: "2026-07-23"
---
# Implementation tracking — mods frontend client, T-C09

Build site (in the self.ai repo): context/plans/build-site-mods-frontend-loading.md

## Task

- **T-C09 — The reference mod's status view proves the whole chain**
  (`cavekit-mods-frontend-client.md` R7, **AC2–AC6**). AC1 (compiles + self-
  registers) and AC7 (exactly one view) were already proven by **T-C08** in the
  self.ai repo; this task proves the remaining five, end to end, through the
  running client against the real running API.

Built on `wt/mods-frontend-tC09` (self.chat), off `cavekit/mods-frontend-client`
@ `1730538` (T-C01…T-C07 merged + the stale-mock fix). Tier 7 — the last task in
the build; genuine build-order dependency on **T-A08** (api R6 serves the bundle)
and **T-A09** (`POST /reference/submit`), both merged on the self.ai side.

## Which e2e tool, and why

**Cypress, not Playwright.** This repo has standardised on Cypress: `package.json`
ships `cy:open`/`cy:run` and `cypress`/`eslint-plugin-cypress`; `cypress.config.ts`
sets `baseUrl: http://localhost:8080`; `cypress/e2e/*.cy.ts` holds four existing
specs; and `.gitlab-ci.yml`'s `e2e:cypress` job is the real orchestration. There
is **no Playwright** anywhere in the repo. The kit's word "Playwright" is a generic
stand-in for "a real end-to-end browser test"; the faithful expression of that
here is a Cypress spec matching the existing conventions, not a second runner.

## The real full-boot orchestration (from `.gitlab-ci.yml`)

The `e2e:cypress` job is a genuine full app boot, exactly what R7's proof needs:
it fetches self.ai's `api/` tree, `pip install`s the API-tier deps into a venv,
`npm run build`s self.chat's static bundle, starts `uvicorn selfai_ui.main:app`
on `:8080` with `FRONTEND_BUILD_DIR` pointed at that bundle (same-origin, no
CORS), waits for `/health`, then runs `npm run cy:run`. So the spec runs against
the **real client served by the real API** — no mocked backend, no fabricated
harness. The spec follows the existing specs' conventions (`cy.loginAdmin()` +
`cy.session`, relative URLs to the same origin, `cy.request` for backend
round-trips, the trailing `after(() => cy.wait(2000))` video guard).

## File

- `cypress/e2e/mods-reference.cy.ts` — one `describe` with a `beforeEach`
  (loginAdmin → visit `/` → grant `mods.reference.use` via the admin
  default-permissions round-trip) and **one comprehensive `it`** that walks the
  whole chain in one pass: nav discovery → load → mount → live update → teardown.
  One test, because the chain is sequential and the reference mod's `count` state
  is process-global (each step builds on the prior mount).

## How each AC (AC2–AC6) is proven — exact step

- **AC2 (discovered as a nav entry from the real registry; click → generic
  route).** After `cy.wait('@registry')` (the real `GET /api/v1/mods/enabled`),
  the spec asserts `nav a[data-mod-id="reference"]` exists, contains text
  "Reference" (the mod.yaml `label`), and its `href` matches `/mods/reference`.
  Clicking it asserts `cy.url()` matches `/mods/reference` and
  `[data-mod-view="reference"]` renders — the ONE generic id-parameterized route,
  no per-mod `src/routes/` file (that structural fact is locked at unit level by
  `route-structure.test.ts`; here the generic route is observed resolving live).
- **AC3 (loads via fetch-manifest-then-import through the real endpoints; context
  by property; authenticates).** `cy.wait('@manifest')` asserts the real
  `GET /api/v1/mods/reference/frontend-manifest` returns `status:"ok"`,
  `tag:"mod-reference"`, and a content-hashed `bundle_url` under
  `/static/mods/reference/entry.*.js`; `cy.wait('@bundle')` asserts that exact
  asset was then imported (fetch → import through the real asset server, not a
  cached/hardcoded URL). The mount is confirmed by
  `[data-mod-state="ready"][data-mod-tag="mod-reference"]` containing a live
  `<mod-reference>` element whose shadow root renders `[data-testid=
  "reference-status"]`. Property-assigned context is observed through the running
  view: the footer renders "as &lt;admin identity&gt;" (the `currentUser`
  property) and the `@state` intercept confirms `GET /reference/state` carried
  `Authorization: Bearer …` (the `authToken` property) and returned 200 (apiBase,
  stripped of `/api/v1`, resolved the call to the mod's origin route) — the view
  authenticating against the reference mod's own route.
- **AC4 (shows `{task_id, status}` and updates LIVE over the /reference namespace,
  not a poll).** First the subscription precondition: the shadow-DOM badge `.conn`
  has class `online` and text "live" — set only inside the socket `connect`
  handler. Then the **isolation proof**: read the current `count` (`dl.state dd`
  eq(2)), drive a state change through the **backend** (`cy.request` POST to
  `/reference/submit`, from outside the app), and assert the rendered `count`
  advances by one **without the view itself fetching**. The view runs no polling,
  so the only channel by which its DOM can move is the `/reference` namespace push
  (`emit_state_update` → `reference:state`) — a live namespace update by
  construction. The pushed snapshot's `status` field also renders "submitted".
- **AC5 (button triggers the tool via T-A09's route; state change observed live).**
  With `cy.intercept('POST', '/reference/submit').as('submitRoute')` set, the spec
  clicks the shadow-DOM **"Submit work"** button, `cy.wait('@submitRoute')`
  asserts 200 (the real T-A09 backend route, no live model), and the rendered
  `count` advances once more — the tool-triggered state change observed live in
  the running view (the fetch-then-observe pattern the component implements).
- **AC6 (contained by T-C05's `<svelte:boundary>`; tears down on nav away).**
  Render-path evidence: `[data-mod-state="ready"]` (which `+page.svelte` renders
  as the boundary's slot content, with the mod mounted inside) is present for this
  instance. `<svelte:boundary>` compiles to **no DOM wrapper**, so it cannot be
  selected directly — and R7 deliberately does not re-trigger a crash (that is
  R4's own `boundary.test.ts`'s job); the boundary being in the render path for
  this mounted instance is what's confirmed. Teardown: an in-SPA navigation away
  via the core `#sidebar-new-chat-button` (a built-in nav item), after which
  `[data-mod-view="reference"]` and the `<mod-reference>` element are both gone
  from the DOM — the observable end of teardown. The Socket.IO disconnect rides
  the element's `disconnectedCallback` → the mod's `onDestroy` (covered at unit
  level by `teardown.test.ts`).

## Selector cross-check (every selector matches real, current markup)

- `nav a[data-mod-id="reference"]`, label `{mod.label}`, `href` `/mods/reference`
  → `src/lib/components/layout/Sidebar/ModNav.svelte:26-48` (`data-mod-id={mod.id}`,
  `resolve('/(app)/mods/[id]', { id: mod.id })`, `{mod.label ?? mod.name}`). Label
  "Reference" / icon "puzzle" from `api/mods/reference/mod.yaml` (T-A07).
- `[data-mod-view="reference"]`, `[data-mod-state="ready"]`, `data-mod-tag=
  "mod-reference"`, the `<mod-reference>` mount, and the `<svelte:boundary>`
  wrapping the ready branch → `src/routes/(app)/mods/[id]/+page.svelte:263`
  (`data-mod-view={modId}`), `:332-337` (`data-mod-state="ready"
  data-mod-tag={tag} use:mountMod`), `:327` (`<svelte:boundary>`). `tag` is
  `mod-reference` (T-A05 manifest / naming.custom_element_tag_for).
- Shadow-DOM reads pierce `<mod-reference>`'s shadow root (Svelte custom-element
  default) → `api/mods/reference/frontend-src/src/ReferenceStatus.svelte` (self.ai
  repo): `data-testid="reference-status"` `:173`; `.conn`/`.conn.online`/"live"
  `:176`; `dl.state` dt/dd pairs task_id/status/count `:181-188` (count is the 3rd
  `<dd>`); button "Submit work" `:190-192`; footer "as {userLabel}" `:198`.
- Endpoints: `GET /api/v1/mods/enabled` (T-A06), `GET /api/v1/mods/reference/
  frontend-manifest` → `{status, tag, bundle_url}` (T-A05), `/static/mods/
  reference/entry.*.js` (T-A03/T-A08), `GET /reference/state` Bearer→200 (Phase 1
  T-005), `POST /reference/submit` → `{task_id, status}` + live emit (T-A09),
  `GET`/`POST /api/v1/users/default/permissions` for the scope grant (mirrors
  `test_reference_r8_boot.py`'s `grant_reference_scope_for_everyone`).
- `#chat-search` (post-login readiness, used by `cypress/support/e2e.ts`) and
  `#sidebar-new-chat-button` (`src/lib/components/layout/Sidebar.svelte:463`).

## Validation posture (write-only, per host policy)

Per the confirmed host constraint (self.chat's dev server, a full `npm install`,
the API, and a real browser cannot be stood up together on this box), the test was
authored with full rigor and **self-reviewed by reading it back against the real
component markup** (every selector cross-checked above to a file:line), but **not
executed** here. No `npm install`, no dev server, no `uvicorn`, no `cy:run` was
run. This matches the caveat every prior T-Cxx task carries in the self.ai shared
impl doc (no local self.chat execution on this host).

## Issues / how this test would actually run (could not verify without executing)

- **Reference-mod enablement.** The spec requires the running API to boot with the
  reference mod ENABLED (its nav entry, `/reference/state`, `/reference` namespace,
  manifest, and served bundle all live). The current `e2e:cypress` job sets no
  `ENABLED_MODS`; whether the reference mod is enabled by default in self.ai is a
  self.ai config fact not readable from this repo. Standing this spec up for real
  needs the job to enable the reference mod.
- **self.ai ref.** The job pins `SELFAI_REF=main`. The spec needs a self.ai build
  that includes T-A07 (frontend block), T-A08 (served bundle bytes), T-C08 (the
  compiled `<mod-reference>` artifact committed under `api/mods/reference/`), and
  T-A09 (`POST /reference/submit`). Those are merged on the self.ai side per the
  shared impl doc; a real run must point at a ref that carries them.
- **Socket.IO transport.** The live-update assertions assume the `/reference`
  namespace is reachable same-origin at `/ws/socket.io` with websocket/polling —
  consistent with Phase 1's `test_reference_r8_boot.py` live-delivery proof, but
  the browser-side handshake in the CI image was not exercised here.
- **Scope grant timing.** The grant writes instance default permissions, which
  T-A09's route reads at call time (`request.app.state.config.USER_PERMISSIONS`);
  no reload is needed for it to take effect for the admin. Confirmed against the
  backend proof's own grant path, not executed here.
