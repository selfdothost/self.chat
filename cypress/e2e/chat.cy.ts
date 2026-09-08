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

		// The composer's context status line. After a real exchange the line must
		// exist under the prompt input with both token counters and a utilization
		// percentage against the stub model's published context_length (8192).
		//
		// TOLERANT BY DESIGN on the measured-vs-estimated axis: the e2e job runs
		// self.ai's api/ tree fetched LIVE from self.ai main, so whether the
		// exchange carries a real usage trailer depends on whether self.ai's
		// usage-capture MR has landed there. Both paths render ↑/↓/% (estimated
		// prefixes ↑ with ≈); asserting on those three proves the line exists,
		// is wired to the live history, and resolved a context window, without
		// coupling this gate to the other repo's deploy state. The unit tests
		// in src/lib/utils/context-status.test.ts pin the exact math.
		it('shows the context status line under the prompt after an exchange', () => {
			useRealCompletions();
			sendAndAwaitReply();

			cy.get('[data-testid="context-status-line"]').should('exist');
			cy.get('[data-testid="context-status-line"]').should('contain.text', '↑');
			cy.get('[data-testid="context-status-line"]').should('contain.text', '↓');
			cy.get('[data-testid="context-status-line"]').should('contain.text', '%');
		});

		// Manual compaction end to end: the Compact control in the status line
		// calls POST /api/v1/tasks/compact/completions on self.ai's API, which
		// serves it through the task-model machinery against the mock upstream
		// (the stub model is an openai-connection model, so the endpoint is
		// genuinely served). The mock's non-streaming branch replies "Stubbed
		// reply." -- which becomes the summary. A single exchange is below the
		// minimum compactable chain, so the exchanges are stacked until the
		// control enables.
		//
		// NOTE: this requires self.ai main to carry /compact/completions (the
		// e2e job fetches self.ai's api/ tree live). Until that lands the
		// click surfaces a toast and this spec fails -- do not merge the
		// self.chat compaction MR before the self.ai one.
		it('compacts a conversation into a summary card', () => {
			useRealCompletions();

			// MIN_CHAIN_MESSAGES is 6 nodes (3 exchanges); stack one more so
			// the retained-tail alignment always has room.
			const sendOne = () => {
				cy.get('#chat-input').clear({ force: true });
				cy.get('#chat-input').type('Tell me more.', { force: true });
				cy.get('button[type="submit"]').click();
				cy.get('.chat-assistant', { timeout: 30_000 }).should('exist');
			};
			sendAndAwaitReply();
			sendOne();
			sendOne();
			sendOne();

			cy.get('[data-testid="compact-button"]').should('not.be.disabled');
			cy.get('[data-testid="compact-button"]').click();

			cy.get('[data-testid="compacted-summary-card"]', { timeout: 30_000 }).should('exist');
			cy.get('[data-testid="compacted-summary-card"]').should('contain.text', 'Stubbed reply.');
			// The expander reveals the retired turns, still in the transcript —
			// with the same [turn N] labels the summary cites. Assert on the
			// markers (stable) rather than the typed prompts: the markers are
			// what a citation must resolve against.
			cy.get('[data-testid="compacted-turns-toggle"]').click();
			cy.get('[data-testid="compacted-summary-card"]').should('contain.text', '[turn 1] USER');
			cy.get('[data-testid="compacted-summary-card"]').should('contain.text', '[turn 2] ASSISTANT');

			// And the conversation continues from the summary onward.
			sendOne();
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
