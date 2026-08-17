/// <reference types="cypress" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../support/index.d.ts" />

export const adminUser = {
	name: 'Admin User',
	email: 'admin@example.com',
	password: 'password'
};

/**
 * A single fake model, shaped like a real `GET /api/models` entry.
 *
 * Field shape was taken from a live self.ai response rather than invented:
 * `{ data: [{ id, name, object, created, owned_by, urlIdx, actions, ... }] }`.
 * Keeping it faithful matters -- Selector.svelte branches on `owned_by`, so a
 * plausible-but-wrong shape would render a different code path than production.
 *
 * This exists because CI runs NO inference engine: self.ai serves models via
 * self.llamolotl, which is not part of this pipeline, so `/api/models` is
 * genuinely empty and every spec that selects a model fails on
 * `button[aria-label="model-item"]`. Stubbing the LIST lets the model-selection
 * UI be tested honestly. It does NOT stub generation -- see chat.cy.ts.
 */
export const stubModel = {
	id: 'cypress-stub-model',
	name: 'Cypress Stub Model',
	object: 'model',
	created: 0,
	owned_by: 'openai',
	urlIdx: 0,
	actions: []
};

/**
 * A SECOND stub model.
 *
 * Not decoration: the CS/R4 specs assert that changing a CHAT's model does not
 * mutate its folder's preset, which they do by picking
 * `model-item` index 1 — i.e. a model that is not the one the preset holds.
 * With a single-model stub that index does not exist and the test failed with
 * "Expected to find element: `1`". Two entries is the minimum that makes
 * "change the model" a meaningful action.
 */
export const stubModelAlt = {
	...stubModel,
	id: 'cypress-stub-model-alt',
	name: 'Cypress Stub Model Alt'
};

const login = (email: string, password: string) => {
	return cy.session(
		email,
		() => {
			// Make sure to test against us english to have stable tests,
			// regardless on local language preferences
			localStorage.setItem('locale', 'en-US');
			// Open the sidebar. Sidebar.svelte:349 does
			//   showSidebar.set(!$mobile ? localStorage.sidebar === 'true' : false)
			// so with this unset the sidebar stays collapsed, its contents are
			// `invisible`, and every spec that reaches into #sidebar fails with
			// "this element is not visible". Same reasoning as the locale line
			// above: pin the state the tests assume instead of inheriting a
			// default.
			localStorage.setItem('sidebar', 'true');
			// Suppress the changelog dialog for the whole session.
			// (app)/+layout.svelte:166 only raises it when the user is an admin AND
			// `settings.showChangelog` is not false AND settings.version differs from
			// config.version -- and these specs log in as the admin, so it fires on
			// every fresh load. It renders a full-screen z-[9999] overlay, which is
			// what blocked sidebar clicks after an in-test cy.reload() with
			// "failed because this element is being covered by another element".
			localStorage.setItem(
				'settings',
				JSON.stringify({
					showChangelog: false,
					// Stop chats renaming themselves mid-test. Chat.svelte:1609 sends
					// `title_generation: $settings?.title?.auto ?? true`, so by DEFAULT a
					// chat is created as "New Chat" and then renamed once the first
					// exchange completes. Any assertion on a chat's sidebar title is
					// therefore racing that rename -- which is exactly how
					// folder-chat-seeding CS/R1 failed intermittently on a COMMENT-ONLY
					// MR after passing 6/6 three runs running.
					title: { auto: false }
				})
			);
			// Visit auth page
			cy.visit('/auth');
			// Fill out the form
			cy.get('input[autocomplete="email"]').type(email);
			cy.get('input[type="password"]').type(password);
			// Submit the form
			cy.get('button[type="submit"]').click();
			// Wait until the user is redirected to the home page
			// 30s, not Cypress' default 4s. This is the readiness gate for the WHOLE
			// suite -- it runs inside cy.session setup, so when it times out the
			// session fails and every test in that spec is skipped behind it (the
			// "1 failed, N skipped" signature). A cold first load here does a lot:
			// the SPA boots, fetches config/models/chats, and the API may still be
			// warming. 4s was fine most of the time, which is the worst kind of
			// fine -- it made the gate flaky rather than failing honestly.
			//
			// This is a READINESS wait, not a masked bug: if the app genuinely never
			// renders the search box, 30s still fails and says so.
			cy.get('#chat-search', { timeout: 30_000 }).should('exist');
			// Dismiss the changelog dialog IF it is showing.
			//
			// The old form branched on `localStorage.getItem('version')`, which
			// is read SYNCHRONOUSLY while the cy.* calls above are still
			// queued -- so it evaluated before login had happened, was always
			// null, and then asserted a modal that is only conditionally
			// rendered (ChangelogModal.svelte). That single line failed the
			// shared login helper, which is a `before each` hook for most
			// specs, so it took 5 spec files down with it. Ask the DOM, inside
			// the command queue, and click only if the button is really there.
			cy.get('body').then(($body) => {
				const button = $body.find('button:contains("Okay, Let\'s Go!")');
				if (button.length) {
					cy.wrap(button.first()).click();
				}
			});
		},
		{
			validate: () => {
				cy.request({
					method: 'GET',
					url: '/api/v1/auths/',
					headers: {
						Authorization: 'Bearer ' + localStorage.getItem('token')
					}
				});
			}
		}
	);
};

const register = (name: string, email: string, password: string) => {
	return cy
		.request({
			method: 'POST',
			url: '/api/v1/auths/signup',
			body: {
				name: name,
				email: email,
				password: password
			},
			failOnStatusCode: false
		})
		.then((response) => {
			// 403 is EXPECTED here on every run after the very first user.
			// self.ai deliberately disables signup once an admin exists
			// (api/selfai_ui/routers/auths.py: "Disable signup after the first
			// user is created"), which upstream Open-WebUI did not do -- these
			// specs were written against the upstream behaviour. So:
			//   200 -> we just created the admin (fresh database)
			//   400 -> the admin already exists
			//   403 -> signup is closed, which also means the admin exists
			// In all three cases the admin is present and the login that
			// follows is what actually has to succeed.
			expect(response.status).to.be.oneOf([200, 400, 403]);
		});
};

/**
 * Re-open registration.
 *
 * Required by any spec that exercises the sign-up UI, because the first
 * user's creation switches ENABLE_SIGNUP off (see above). Runs as the admin
 * against the same endpoint the admin settings page uses, so it exercises a
 * real code path rather than reaching into the database.
 */
const enableSignup = () => {
	return cy.loginAdmin().then(() => {
		return cy
			.request({ method: 'GET', url: '/api/v1/auths/admin/config' })
			.then((current) => {
				return cy.request({
					method: 'POST',
					url: '/api/v1/auths/admin/config',
					body: { ...current.body, ENABLE_SIGNUP: true }
				});
			})
			.then((response) => {
				expect(response.status).to.eq(200);
				expect(response.body.ENABLE_SIGNUP).to.eq(true);
			});
	});
};

const registerAdmin = () => {
	return register(adminUser.name, adminUser.email, adminUser.password);
};

const loginAdmin = () => {
	return login(adminUser.email, adminUser.password);
};

/**
 * Serve the stub model list for every request the app makes.
 *
 * Matches `/api/models` and `/api/models/base` (apis/index.ts appends `/base`
 * when `base: true`), with or without a query string. Registered in a global
 * beforeEach so it is in place before the app's first fetch on load -- an
 * intercept declared after the request has gone out does nothing.
 */
/**
 * Serve a canned SSE completion so a chat can actually be created.
 *
 * Stubbing /api/models alone was not enough: any spec that SENDS A MESSAGE
 * (the folder specs create a chat to assert it lands in the folder) then waits
 * on a real generation that CI has no engine for. Those tests did not fail
 * cleanly -- they went nondeterministic, which is why folder-chat-seeding
 * drifted 4/6 -> 3/6 across two runs with no relevant code change.
 *
 * The app posts to `${WEBUI_BASE_URL}/api/chat/completions`
 * (apis/openai/index.ts:285, default url arg) and reads an OpenAI-style SSE
 * stream, so this returns text/event-stream with chunks and a [DONE] sentinel
 * rather than a JSON fixture -- a JSON body would not parse as a stream and
 * the UI would hang waiting for tokens.
 */
const stubChatCompletion = () => {
	const chunk = (delta: object, finish: string | null) =>
		`data: ${JSON.stringify({
			id: 'cypress-stub-completion',
			object: 'chat.completion.chunk',
			created: 0,
			model: stubModel.id,
			choices: [{ index: 0, delta, finish_reason: finish }]
		})}\n\n`;

	return cy
		.intercept({ method: 'POST', url: /\/api\/chat\/completions(\?.*)?$/ }, (req) => {
			req.reply({
				statusCode: 200,
				headers: {
					'content-type': 'text/event-stream',
					'cache-control': 'no-cache',
					connection: 'keep-alive'
				},
				body:
					chunk({ role: 'assistant', content: '' }, null) +
					chunk({ content: 'Stubbed reply.' }, null) +
					chunk({}, 'stop') +
					'data: [DONE]\n\n'
			});
		})
		.as('stubbedCompletion');
};

/**
 * Dismiss the changelog dialog if it is on screen.
 *
 * Belt-and-braces alongside the settings pin above: `settings` may be
 * overwritten by whatever the server returns for the user, in which case the
 * modal can still appear after a reload. Safe to call unconditionally -- it
 * asks the DOM and does nothing when the button is absent.
 */
const dismissChangelog = () => {
	return cy.get('body').then(($body) => {
		const button = $body.find('button:contains("Okay, Let\'s Go!")');
		if (button.length) {
			cy.wrap(button.first()).click();
		}
	});
};

/**
 * Close any modal overlay still on screen, then assert none remain.
 *
 * FolderConfigModal is mounted PER FOLDER and every instance renders the same
 * ids (#39), so the `.last()` disambiguation the specs use can click a
 * DIFFERENT folder's Save button — leaving the intended modal open. Its
 * overlay is `.modal ... z-[9999]`, which then swallows every subsequent click
 * with "failed because this element is being covered by another element" —
 * an error that points at the innocent target rather than the stuck dialog.
 *
 * Escape first (bits-ui closes on it), then assert. The assertion matters more
 * than the escape: if a modal is genuinely stuck the test now fails HERE, on a
 * sentence that says what is wrong, instead of 20 lines later on a mystery
 * covered-element error.
 */
const closeModals = () => {
	cy.get('body').then(($body) => {
		if ($body.find('.modal:visible').length) {
			cy.get('body').type('{esc}', { force: true });
		}
	});
	return cy.get('.modal:visible', { timeout: 4000 }).should('not.exist');
};

/**
 * Register the stub models as real WORKSPACE MODEL RECORDS on the server.
 *
 * The cy.intercept below stubs `/api/models` in the BROWSER only — the server
 * has never heard of those ids. That is fine until something is validated
 * server-side, and the folder preset is: POST /folders/{id}/update runs
 * `unresolved_preset_references`, which calls `Models.get_model_by_id()` and
 * rejects the whole update with 400 when the id does not resolve. The CS/R4
 * specs then reopened the config modal, found the picker on its placeholder,
 * and failed with `expected 'Select a model ' to equal 'Cypress Stub Model'` —
 * a message that points at the picker and says nothing about the rejected write.
 *
 * `Models.get_model_by_id` reads the WORKSPACE MODELS table, not the live
 * `/api/models` list, so creating a record here satisfies validation WITHOUT any
 * inference engine. Idempotent: the endpoint 401s with MODEL_ID_TAKEN when the
 * record already exists, which is a success for our purposes.
 */
const registerStubModelRecords = () => {
	return cy.loginAdmin().then(() => {
		[stubModel, stubModelAlt].forEach((m) => {
			cy.request({
				method: 'POST',
				url: '/api/v1/models/create',
				failOnStatusCode: false,
				body: {
					id: m.id,
					name: m.name,
					base_model_id: null,
					meta: { profile_image_url: '/static/favicon.png', description: 'cypress stub' },
					params: {},
					is_active: true
				}
			}).then((res) => {
				// 200 = created, 401 = already exists (MODEL_ID_TAKEN). Anything else is real.
				expect(res.status, `register stub model ${m.id}`).to.be.oneOf([200, 401]);
			});
		});
	});
};

const stubModels = () => {
	return cy
		.intercept(
			{ method: 'GET', url: /\/api\/models(\/base)?(\?.*)?$/ },
			{ statusCode: 200, body: { data: [stubModel, stubModelAlt] } }
		)
		.as('stubbedModels');
};

/**
 * Ensure a folder is EXPANDED, deterministically, without toggling it.
 *
 * self.chat#45. The folder specs used to do `cy.get('#sidebar').contains(name).click()`
 * with the comment "expand the folder". That click is a TOGGLE, and a folder's
 * expanded state is SERVER-PERSISTED: RecursiveFolder loads it in onMount
 * (`open = folders[folderId].is_expanded`) and writes it back through a 500ms
 * debounced $effect (`POST /folders/:id/update/expanded`).
 *
 * So after a `cy.reload()` the folder may already be open, and the "expand"
 * click COLLAPSES it -- the chat links vanish and the following assertion times
 * out with "Expected to find element: a[href^='/c/'], but never found it."
 * Whether the debounce landed before the reload is a coin flip, which is why
 * this presented as flakiness with no relation to the diff under test.
 *
 * This writes `is_expanded` over the API. It does NOT reload -- call it before
 * the spec's own `cy.reload()`, which is what applies the state. An earlier
 * version reloaded internally and produced a second reload in specs that had
 * already reloaded; the app had not finished mounting and `#sidebar` was not
 * found. One reload, owned by the caller.
 *
 * It never clicks, so it cannot toggle the wrong way, and it is idempotent.
 */
const setFolderExpanded = (name: string, isExpanded = true) => {
	return cy
		.request({
			method: 'GET',
			url: '/api/v1/folders/',
			headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
		})
		.then((res) => {
			const folder = (res.body ?? []).find((f: { name: string }) => f.name === name);
			expect(folder, `folder ${name} exists before setting is_expanded`).to.not.equal(undefined);
			return cy.request({
				method: 'POST',
				url: `/api/v1/folders/${folder.id}/update/expanded`,
				headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
				body: { is_expanded: isExpanded }
			});
		});
};

Cypress.Commands.add('login', (email, password) => login(email, password));
Cypress.Commands.add('register', (name, email, password) => register(name, email, password));
Cypress.Commands.add('registerAdmin', () => registerAdmin());
Cypress.Commands.add('loginAdmin', () => loginAdmin());
Cypress.Commands.add('enableSignup', () => enableSignup());
Cypress.Commands.add('stubModels', () => stubModels());
Cypress.Commands.add('registerStubModelRecords', () => registerStubModelRecords());
Cypress.Commands.add('closeModals', () => closeModals());
Cypress.Commands.add('dismissChangelog', () => dismissChangelog());
Cypress.Commands.add('stubChatCompletion', () => stubChatCompletion());
Cypress.Commands.add('setFolderExpanded', (name: string, isExpanded?: boolean) =>
	setFolderExpanded(name, isExpanded)
);

before(() => {
	cy.registerAdmin();
	cy.registerStubModelRecords();
});

beforeEach(() => {
	cy.stubModels();
	cy.stubChatCompletion();
});
