// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../support/index.d.ts" />

// T-C09 — client R7 AC2..AC6: the reference mod's status view proves the whole
// chain, end to end, through the RUNNING client against the REAL running API.
//
// This is the client-side completion of the proof api R6 begins (T-A08 serves;
// this mounts). It is deliberately NOT a fabricated harness that mounts the
// custom element directly — the Verification Convention
// (cavekit-mods-overview.md) forbids that. Every fact below is exercised through
// the running client: nav discovered from the real registry response → loaded
// through the real fetch-manifest-then-import loader against the real asset /
// manifest endpoints → mounted → live-updated over the real /reference Socket.IO
// namespace → torn down on navigation away. The live update is observed in the
// rendered DOM over the real namespace, never asserted on the component's
// internal state.
//
// Framework note: this repo standardised on Cypress for end-to-end (package.json
// `cy:open`/`cy:run`, cypress.config.ts, cypress/e2e/*.cy.ts, and the
// `e2e:cypress` job in .gitlab-ci.yml that boots self.ai's API and serves
// self.chat's built bundle same-origin at http://localhost:8080). The kit's
// mention of "Playwright" is a generic label for "a real end-to-end browser
// test"; the faithful expression of that here is a Cypress spec matching the four
// existing specs' conventions (loginAdmin/session, baseUrl, `cy.request` for
// backend round-trips), NOT a second, foreign runner. See the impl doc.
//
// What the RUNNING API this spec points at must already provide (orchestration
// preconditions — see cypress/context/impl/impl-mods-frontend-client-tC09.md):
//   * the reference mod ENABLED (its nav entry, /reference/state route,
//     /reference namespace, per-mod manifest + served bundle all live);
//   * a self.ai build that includes T-A07 (the reference mod's `frontend`
//     block), T-A08 (the served, content-hashed bundle bytes), T-C08 (the
//     compiled <mod-reference> custom element artifact), and T-A09 (the
//     `POST /reference/submit` route this test's button + isolation push drive).
// The current `e2e:cypress` job pins SELFAI_REF=main and sets no ENABLED_MODS;
// standing this spec up for real needs those two knobs (reference-mod enablement
// + a self.ai ref carrying those merges). Flagged, not silently assumed.

describe('T-C09 — reference mod status view proves the whole chain (client R7 AC2-6)', () => {
	// The reference mod's own contract, stated here so the assertions read against
	// the real artifact. mod id: api/mods/reference/mod.yaml (T-A07). The gating
	// scope itself ('mods.reference.use') is used inline below, in
	// grantReferenceScope's permissions payload, not hoisted to a constant here.
	// Derived custom-element tag: naming.custom_element_tag_for("reference")
	// === "mod-reference" (T-A05/T-C08). Nav label/icon: mod.yaml `label:
	// Reference`, `icon: puzzle`.
	const MOD_ID = 'reference';
	const MOD_TAG = 'mod-reference';

	// Wait for 2s after the run so Cypress's video captures the final frames —
	// the same trailing-wait guard the other specs in this suite use.
	after(() => {
		// eslint-disable-next-line cypress/no-unnecessary-waiting
		cy.wait(2000);
	});

	// Grant `mods.reference.use` to the instance default permissions through the
	// REAL admin round-trip (GET -> mutate -> POST), mirroring the backend proof's
	// `grant_reference_scope_for_everyone` (test_reference_r8_boot.py). The nav
	// entry itself is admin-visible regardless of scope (api R5-3), but T-A09's
	// `POST /reference/submit` route has NO admin bypass — it requires this exact
	// scope (has_permission(user.id, "mods.reference.use", defaults)) — so both
	// the isolated namespace push (AC4) and the button trigger (AC5) need it held.
	const grantReferenceScope = () => {
		cy.window().then((win) => {
			const token = win.localStorage.getItem('token');
			const headers = { Authorization: `Bearer ${token}` };
			cy.request({ method: 'GET', url: '/api/v1/users/default/permissions', headers }).then((res) => {
				const perms = res.body ?? {};
				perms.mods = perms.mods || {};
				perms.mods[MOD_ID] = { ...(perms.mods[MOD_ID] || {}), use: true };
				cy.request({
					method: 'POST',
					url: '/api/v1/users/default/permissions',
					headers,
					body: perms
				})
					.its('status')
					.should('eq', 200);
			});
		});
	};

	// POST the reference mod's `submit` tool through T-A09's REAL backend route,
	// as the logged-in admin, from OUTSIDE the app (a separate HTTP client). Used
	// only to prove AC4's live namespace push in isolation: the running view did
	// NOT itself fetch, so any change it renders can only have arrived over the
	// /reference Socket.IO subscription.
	const backendSubmit = () =>
		cy.window().then((win) => {
			const token = win.localStorage.getItem('token');
			return cy
				.request({
					method: 'POST',
					url: '/reference/submit',
					headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
					body: {}
				})
				.then((res) => {
					expect(res.status, 'T-A09 POST /reference/submit succeeds for the scoped admin').to.eq(200);
					expect(res.body, 'submit returns the {task_id, status} async handle').to.have.all.keys(
						'task_id',
						'status'
					);
				});
		});

	// The mounted mod is a Svelte 5 custom element with shadow DOM ON (Svelte's
	// default) — its markup (data-testid="reference-status", the state <dl>, the
	// "Submit work" button, the live/offline badge) lives in <mod-reference>'s
	// shadow root, so every read pierces the shadow boundary explicitly.
	const modShadow = () => cy.get(MOD_TAG, { timeout: 20_000 }).shadow();

	// The `count` field is the 3rd <dd> in `dl.state` (dt/dd pairs: task_id,
	// status, count — ReferenceStatus.svelte). Read it as a number; the `.should`
	// callback retries the shadow query until the live push lands.
	const expectCountToBecome = (expected: number, why: string) =>
		modShadow()
			.find('dl.state dd')
			.eq(2)
			.should(($dd) => {
				expect(parseInt($dd.text().trim(), 10), why).to.eq(expected);
			});

	beforeEach(() => {
		cy.loginAdmin();
		cy.visit('/');
		// #chat-search is the post-login readiness signal the shared login helper
		// already waits on; assert the shell is up before touching mod nav.
		cy.get('#chat-search').should('exist');
		grantReferenceScope();
	});

	it('discovers, loads, mounts, live-updates, and tears down the reference view', () => {
		// -- intercepts: pin the REAL loader surfaces before the nav click so we can
		//    prove fetch-manifest-then-import through the actual API endpoints ------
		cy.intercept('GET', '/api/v1/mods/enabled').as('registry');
		cy.intercept('GET', `/api/v1/mods/${MOD_ID}/frontend-manifest`).as('manifest');
		cy.intercept('GET', `/static/mods/${MOD_ID}/entry.*.js`).as('bundle');
		cy.intercept('GET', '/reference/state').as('state');

		// ============================================================== AC2 ========
		// AC2: the view is DISCOVERED as a nav entry from the real registry response
		// and clicking it navigates to the generic /(app)/mods/[id] route.
		//
		// The nav entry is rendered by ModNav.svelte purely from the registry
		// response (`a[data-mod-id={mod.id}]`, label `{mod.label}`), not from any
		// per-mod route file. The reference mod.yaml declares label "Reference"
		// (T-A07). We reload once so the boot-time `GET /api/v1/mods/enabled` fetch
		// runs after the scope grant (belt-and-suspenders; admin sees it regardless).
		cy.reload();
		cy.get('#chat-search').should('exist');
		cy.wait('@registry').its('response.statusCode').should('eq', 200);

		cy.get(`nav a[data-mod-id="${MOD_ID}"]`, { timeout: 20_000 })
			.should('exist')
			.and('contain.text', 'Reference')
			// href resolves to the ONE generic id-parameterized route — there is no
			// src/routes/ file named for `reference`; adding this mod needed no
			// client rebuild (that structural fact is locked by
			// route-structure.test.ts at the unit level; here we observe the generic
			// route actually resolving with the id).
			.and('have.attr', 'href')
			.and('match', /\/mods\/reference$/);

		cy.get(`nav a[data-mod-id="${MOD_ID}"]`).click();

		// Navigated to the generic route with the mod id; the route's own wrapper
		// carries data-mod-view={modId} (+page.svelte). This is SPA navigation
		// (SvelteKit <a>), not a reload — the shell/Sidebar persist.
		cy.url().should('match', /\/mods\/reference$/);
		cy.get('[data-mod-view="reference"]', { timeout: 20_000 }).should('exist');

		// ============================================================== AC3 ========
		// AC3: the view LOADS through the real fetch-manifest-then-import loader
		// (real asset/manifest endpoints — no per-mod src/routes/ file, no client
		// rebuild), receives auth token / API base / current user by property
		// assignment, and authenticates against the reference mod's route/namespace.

		// The loader fetched the fresh per-mod manifest, which resolved status "ok",
		// the derived tag, and a content-hashed bundle URL under the asset prefix...
		cy.wait('@manifest').then(({ response }) => {
			expect(response?.statusCode).to.eq(200);
			expect(response?.body.status).to.eq('ok');
			expect(response?.body.tag).to.eq(MOD_TAG);
			expect(response?.body.bundle_url).to.match(/^\/static\/mods\/reference\/entry\..+\.js$/);
		});
		// ...and then dynamic-import()ed exactly that bundle URL from the real asset
		// server (T-A03/T-A08). Proving both requests fire proves fetch-then-import
		// through the real endpoints, not a hardcoded/cached URL.
		cy.wait('@bundle').its('response.statusCode').should('eq', 200);

		// The mod element mounted inside the generic route's ready container, tagged
		// with the resolved custom-element tag (mount happened via T-C04's property
		// assignment; the host never called customElements.define — the imported
		// bundle self-registered <mod-reference>).
		cy.get('[data-mod-state="ready"]', { timeout: 20_000 })
			.should('have.attr', 'data-mod-tag', MOD_TAG)
			.find(MOD_TAG)
			.should('exist');

		// The mounted view rendered its shadow-DOM root — the concrete evidence the
		// custom element instantiated and its inner Svelte component ran.
		modShadow().find('[data-testid="reference-status"]').should('exist');

		// AC3 — property-assigned context, observed through the running view:
		//  * currentUser (a property) → the footer renders "as <admin identity>".
		modShadow()
			.find('footer')
			.should('contain.text', 'as ')
			.and('not.contain.text', 'unknown');
		//  * authToken (a property) → the view authenticated to the mod's own route
		//    with a Bearer header, and apiBase (a property, stripped of /api/v1)
		//    resolved that call to the mod's origin route. A 200 here is the view
		//    authenticating against the reference mod's route/namespace.
		cy.wait('@state').then(({ request, response }) => {
			expect(request.headers.authorization, 'authToken property used as Bearer').to.match(/^Bearer .+/);
			expect(response?.statusCode).to.eq(200);
		});

		// ============================================================== AC4 ========
		// AC4: the view shows the current {task_id, status} state and updates LIVE
		// via a real Socket.IO subscription to the /reference namespace — NOT a poll.
		//
		// Precondition: the subscription is genuinely established — the view's badge
		// flips to "live" only inside the socket 'connect' handler (ReferenceStatus
		// .svelte: connected=true → `.conn.online`, text "live").
		modShadow().find('.conn').should('have.class', 'online').and('contain.text', 'live');

		// Isolation: read the current count, then drive a state change through the
		// BACKEND (cy.request → T-A09 route), WITHOUT touching the view. The view
		// runs no polling; the only channel by which its rendered count can move is
		// the /reference namespace push (emit_state_update → "reference:state"). So
		// a rendered increment here is a live namespace update by construction.
		modShadow()
			.find('dl.state dd')
			.eq(2)
			.invoke('text')
			.then((txt) => {
				const before = parseInt(txt.trim(), 10);
				backendSubmit();
				expectCountToBecome(before + 1, 'count advances LIVE over the /reference namespace (no view-side fetch)');
				// The pushed snapshot also carries the tool's {task_id, status}: the
				// status field renders "submitted" from the same live push.
				modShadow().find('dl.state dd').eq(1).should('contain.text', 'submitted');

				// ========================================================== AC5 ======
				// AC5: clicking the "Submit work" button triggers the tool via T-A09's
				// real POST /reference/submit route (no live model), and the resulting
				// state change is observed LIVE in the view.
				cy.intercept('POST', '/reference/submit').as('submitRoute');
				modShadow().find('button').contains('Submit work').click();
				cy.wait('@submitRoute').its('response.statusCode').should('eq', 200);
				// The change from the button-triggered tool is observed in the view
				// (fetch-then-observe pattern the component implements, over the same
				// namespace). Count advances once more, from the running view.
				expectCountToBecome(before + 2, 'button-triggered tool state change observed live in the view');
			});

		// ============================================================== AC6 ========
		// AC6: the mounted view is contained by T-C05's <svelte:boundary> (in the
		// render path for THIS instance) and tears down cleanly on navigation away.
		//
		// <svelte:boundary> compiles to no DOM wrapper element, so it cannot be
		// selected directly; its render-path evidence is that the ready mount
		// container ([data-mod-state="ready"]) — which +page.svelte renders as the
		// boundary's slot content, with the mod mounted inside it — is present for
		// this instance. (That the boundary actually CATCHES a post-mount crash is
		// R4's own job, proven by boundary.test.ts; R7 does not re-trigger a crash.)
		cy.get('[data-mod-state="ready"]').should('exist').find(MOD_TAG).should('exist');

		// Teardown: navigate away via the running client (SPA nav — the core
		// "New Chat" affordance, a built-in nav item untouched by the mod surface).
		// Real DOM removal of the {#if} ready branch removes the custom element,
		// firing disconnectedCallback → the mod's onDestroy (which disconnects its
		// Socket.IO connection) → Svelte destroys the inner component next tick.
		cy.get('#sidebar-new-chat-button').click();
		cy.url().should('not.match', /\/mods\/reference$/);

		// After teardown the mod route wrapper and the custom element are gone from
		// the DOM (the observable end of teardown; the socket disconnect rides the
		// element's disconnectedCallback → onDestroy, which teardown.test.ts covers
		// at the unit level). Re-navigating would mount a fresh instance.
		cy.get('[data-mod-view="reference"]').should('not.exist');
		cy.get(MOD_TAG).should('not.exist');
	});
});
