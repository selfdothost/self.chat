// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../support/index.d.ts" />

// These tests run through the chat flow.
//
// UNSKIPPED. They were `describe.skip` because CI runs no inference engine; that
// is now handled in cypress/support/e2e.ts, which stubs `/api/models` and returns
// a canned SSE stream for `POST /api/chat/completions`, so a message can be sent
// and answered deterministically.
//
// Two selectors in here were DEAD -- not "needed inference", simply ABSENT from
// this codebase, so they could never have passed. Both are named in the tests
// that used them. Same shape as the `cy.get('nav')` finding (#33): specs written
// against a DOM that is not this one.
//
// The completion stub described above is NOT what makes the chat tests work, and
// the note claiming it was has been corrected. `generateOpenAIChatCompletion`
// calls `res.json()` and reads only `res.task_id`; the assistant's reply arrives
// over SOCKET.IO from self.ai's API. Intercepting POST /api/chat/completions
// therefore removes the request that makes the API emit those events, so no stub
// body could ever produce a reply -- the earlier "the stub's stream shape is
// wrong" reading was a misdiagnosis, since nothing on that path reads a stream.
//
// The chat tests below let the request through to the real API, which talks to
// cypress/support/mock-openai.mjs (started by the e2e job). They exercise
// browser -> API -> upstream -> Socket.IO -> DOM.
//
// Renamed from describe('Settings') too -- these are chat tests; 'Settings' was
// inherited Open-WebUI scaffolding.
describe('Chat', () => {
	// Wait for 2 seconds after all tests to fix an issue with Cypress's video recording missing the last few frames
	after(() => {
		// eslint-disable-next-line cypress/no-unnecessary-waiting
		cy.wait(2000);
	});

	beforeEach(() => {
		// Login as the admin user
		cy.loginAdmin();
		// Visit the home page
		cy.visit('/');
	});

	// Let the completion request reach the real API instead of the global stub in
	// support/e2e.ts. Cypress applies the LAST matching intercept, so registering
	// this inside a test overrides the suite-wide one for that test only --
	// every other spec keeps the stub it relies on.
	const useRealCompletions = () =>
		cy.intercept({ method: 'POST', url: /\/api\/chat\/completions(\?.*)?$/ }, (req) =>
			req.continue()
		);

	// Select a model, send a prompt, and wait for the reply the mock upstream
	// streams back. The assertion is on the rendered text, so it proves the whole
	// chain delivered -- not merely that a request was made.
	const sendAndAwaitReply = () => {
		cy.get('#model-selector-0-button').click();
		cy.get('button[aria-label="model-item"]').first().click();
		cy.get('#chat-input').type('Hi, what can you do? A single sentence only please.', {
			force: true
		});
		cy.get('button[type="submit"]').click();
		cy.get('.chat-user').should('exist');
		// .chat-assistant appears once the first token arrives over the socket.
		cy.get('.chat-assistant', { timeout: 30_000 }).should('exist');
		cy.get('.chat-assistant', { timeout: 30_000 }).should('contain.text', 'Stubbed reply.');
	};

	// Renamed from 'Ollama': this fork serves models via self.llamolotl and the
	// OpenAI-compatible surface, never Ollama.
	context('text chat', () => {
		it('user can select a model', () => {
			// Click on the model selector
			cy.get('#model-selector-0-button').click();
			// Select the first model
			cy.get('button[aria-label="model-item"]').first().click();
		});

		// Runs against the real API and the mock upstream, not a stubbed response --
		// see the header. The assertion is on rendered text, so a pass means the
		// socket stream actually reached the DOM.
		it('user can perform text chat', () => {
			useRealCompletions();
			sendAndAwaitReply();
		});

		// The share selectors were already verified to exist
		// (#chat-context-menu-button, #chat-share-button in layout/Navbar/Menu.svelte,
		// #copy-and-share-chat-button in ShareChatModal); this only ever needed a real
		// reply to share.
		it('user can share chat', () => {
			useRealCompletions();
			sendAndAwaitReply();

			const spy = cy.spy();
			cy.intercept('POST', '/api/v1/chats/**/share', spy);

			cy.get('#chat-context-menu-button').click();
			cy.get('#chat-share-button').click();
			cy.get('#copy-and-share-chat-button').should('exist');
			cy.get('#copy-and-share-chat-button').click();
			cy.wrap({}, { timeout: 5_000 }).should(() => {
				expect(spy).to.be.callCount(1);
			});
		});

		// STILL SKIPPED, and not for the reason the other two were. This one is not
		// an inference problem: the `[aria-label="Generate Image"]` trigger does not
		// exist anywhere in src/, so there is nothing to click. The mock upstream
		// does not help -- unskipping needs the affordance to exist first, then an
		// image-endpoint mock alongside mock-openai.mjs. Tracked in #33.
		it.skip('user can generate image', () => {
			// Click on the model selector
			cy.get('#model-selector-0-button').click();
			// Select the first model
			cy.get('button[aria-label="model-item"]').first().click();
			// Type a message
			cy.get('#chat-input').type('Hi, what can you do? A single sentence only please.', {
				force: true
			});
			// Send the message
			cy.get('button[type="submit"]').click();
			// User's message should be visible
			cy.get('.chat-user').should('exist');
			// Wait for the response
			// .chat-assistant is created after the first token is received
			cy.get('.chat-assistant', { timeout: 10_000 }).should('exist');
			// The stubbed completion streams a known body, so asserting on it proves the
			// reply was received AND rendered. This replaced a 120s wait on a Generation
			// Info element that does not exist anywhere in src/ -- it could never pass.
			cy.get('.chat-assistant', { timeout: 20_000 }).should('contain.text', 'Stubbed reply.');
			// Click on the generate image button
			cy.get('[aria-label="Generate Image"]').click();
			// Wait for image to be visible
			cy.get('img[data-cy="image"]', { timeout: 60_000 }).should('be.visible');
		});
	});
});
