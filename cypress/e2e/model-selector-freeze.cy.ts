// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../support/index.d.ts" />

// The model dropdown freeze regression.
//
// Opening the model selector parses every listed model's description into a
// Tooltip synchronously on the UI thread -- the dropdown content only mounts at
// open, so all of that work lands in one turn of the event loop. marked's
// inline tokenizer is quadratic in a single delimiter run, and the dropdown's
// old call site flattened the whole description onto one line before parsing
// (replaceAll('\n', '<br>')), which is precisely the worst case: 20KB of `**`
// parsed in ~6.2s against this repo's marked 18.0.6. One curated model card of
// that shape in /api/models froze the whole tab when the dropdown opened.
//
// The support suite's global beforeEach stubs /api/models with two models that
// have NO description -- which is why the e2e gate never saw this. This spec
// re-stubs the list (Cypress applies the last matching intercept) with one
// hostile description and opens the dropdown: pre-fix, the frozen main thread
// cannot render the items within Cypress's command timeout; post-fix
// (clamped input in $lib/utils/model-description-tooltip), the parse is ~70ms
// worst case and the items appear immediately.
describe('Model selector dropdown', () => {
	beforeEach(() => {
		const hostileDescriptionModel = {
			// Same shape as stubModel in support/e2e.ts, plus the field under
			// test: a 20KB single-line emphasis run.
			id: 'cypress-hostile-description-model',
			name: 'Cypress Hostile Description Model',
			object: 'model',
			created: 0,
			owned_by: 'openai',
			urlIdx: 0,
			actions: [],
			info: { meta: { description: '**'.repeat(10_000) } }
		};

		cy.intercept(
			{ method: 'GET', url: /\/api\/models(\/base)?(\?.*)?$/ },
			{ statusCode: 200, body: { data: [hostileDescriptionModel] } }
		).as('hostileModels');

		cy.loginAdmin();
		cy.visit('/');
	});

	it('opens without freezing when a model carries a hostile description', () => {
		cy.get('#model-selector-0-button').click();

		// Default command timeout on purpose: this is the assertion. Pre-fix,
		// the description parse (~6.2s for this input) owned the main thread and
		// the items never appeared in time.
		cy.get('button[aria-label="model-item"]').should('be.visible');
		cy.get('button[aria-label="model-item"]').should(
			'contain.text',
			'Cypress Hostile Description Model'
		);
	});
});
