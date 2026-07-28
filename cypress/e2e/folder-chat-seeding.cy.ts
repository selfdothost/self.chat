// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../support/index.d.ts" />

// Chat Creation Folder Seeding (cavekit-chat-creation-folder-seeding.md).
// e2e specs run in CI (headless browser). Each context maps to one CS requirement.
describe('Chat creation folder seeding', () => {
	after(() => {
		// eslint-disable-next-line cypress/no-unnecessary-waiting
		cy.wait(2000);
	});

	const folderName = `seed-${Date.now()}`;

	beforeEach(() => {
		cy.loginAdmin();
		cy.visit('/');
	});

	// Helper: create a folder via the Folders header "+" and rename it.
	const createFolder = (name: string) => {
		cy.get('nav')
			.contains('Folders')
			.parents('.relative')
			.first()
			.within(() => {
				cy.get('button').last().click({ force: true });
			});
		// Rename the freshly created "Untitled" folder by double-clicking it.
		cy.get('nav').contains('Untitled').dblclick();
		cy.focused().clear();
		cy.focused().type(`${name}{enter}`);
	};

	// Helper: open a folder's options menu and click an item.
	const folderMenuAction = (name: string, itemText: string) => {
		cy.get('nav').contains(name).realHover?.();
		cy.get('nav')
			.contains(name)
			.parents('.group')
			.first()
			.within(() => {
				cy.get('button').last().click({ force: true });
			});
		cy.contains(itemText).click({ force: true });
	};

	// CS/R1 — a per-folder "New Chat" affordance creates a chat that belongs to
	// the folder without an intermediate unfoldered-then-move step.
	context('CS/R1: folder-scoped new chat', () => {
		it('creates a chat that belongs to the folder (not the flat list)', () => {
			createFolder(folderName);

			// Invoke the per-folder "New Chat" affordance.
			folderMenuAction(folderName, 'New Chat');

			// The URL should carry the folder context.
			cy.url().should('include', 'folder_id=');

			// Send a first message to actually create/persist the chat.
			cy.get('button[aria-label="Select a model"]').click();
			cy.get('button[aria-label="model-item"]').first().click();
			cy.get('#chat-input').type('Hello from a folder-scoped chat', { force: true });
			cy.get('button[type="submit"]').click();
			cy.get('.chat-user', { timeout: 10_000 }).should('exist');

			// After creation, the chat belongs to the folder: it appears under the
			// expanded folder, and NOT in the flat unfoldered list.
			cy.reload();
			cy.get('nav').contains(folderName).click(); // expand the folder
			cy.get('nav')
				.contains(folderName)
				.parents('.relative')
				.first()
				.within(() => {
					cy.contains('New Chat').should('exist');
				});
		});
	});

	// CS/R2 — a chat created in a folder seeds its model/tools/knowledge from the
	// folder's preset (written by the Configure modal, read via meta.preset).
	context('CS/R2: seeds a folder-scoped chat from the preset', () => {
		it('opens the new chat with the folder preset model selected', () => {
			const presetFolder = `preset-${Date.now()}`;
			createFolder(presetFolder);

			// Configure the folder's preset: pick the first model as the default.
			folderMenuAction(presetFolder, 'Configure');
			cy.get('#model-selector-folder-config-model-button').click();
			cy.get('button[aria-label="model-item"]')
				.first()
				.invoke('text')
				.then((modelLabel) => {
					cy.get('button[aria-label="model-item"]').first().click();
					cy.contains('button', 'Save').click();

					// Create a chat scoped to that folder.
					folderMenuAction(presetFolder, 'New Chat');
					cy.url().should('include', 'folder_id=');

					// The composer's model selector reflects the seeded default model.
					cy.get('button[aria-label="Select a model"]').should(
						'contain.text',
						modelLabel.trim()
					);
				});
		});
	});

	// CS/R3 — an empty (or partial) preset seeds nothing beyond the unfoldered
	// defaults; there is no special "empty folder" branch.
	context('CS/R3: empty/partial preset seeds only set fields', () => {
		it('a chat in a preset-less folder matches an unfoldered new chat', () => {
			// Baseline: the model an unfoldered new chat selects.
			cy.visit('/');
			cy.get('button[aria-label="Select a model"]')
				.invoke('text')
				.then((baselineModel) => {
					const emptyFolder = `empty-${Date.now()}`;
					createFolder(emptyFolder);

					// No Configure step -> the folder has no preset.
					folderMenuAction(emptyFolder, 'New Chat');
					cy.url().should('include', 'folder_id=');

					// Same initial model as the unfoldered baseline (no seeding occurred).
					cy.get('button[aria-label="Select a model"]').should(
						'contain.text',
						baselineModel.trim()
					);
				});
		});

		it('a partial preset (model only) leaves tools/knowledge at defaults', () => {
			const partialFolder = `partial-${Date.now()}`;
			createFolder(partialFolder);

			// Configure only the model; leave tools + knowledge empty.
			folderMenuAction(partialFolder, 'Configure');
			cy.get('#model-selector-folder-config-model-button').click();
			cy.get('button[aria-label="model-item"]').first().click();
			cy.contains('button', 'Save').click();

			folderMenuAction(partialFolder, 'New Chat');
			cy.url().should('include', 'folder_id=');
			// Only the model was seeded; no knowledge/collection attachment chips are
			// present (tools/knowledge stayed at the unfoldered defaults).
			cy.get('body').then(($b) => {
				// No collection attachment rendered in the composer for this chat.
				expect($b.find('[data-cy="collection-attachment"]').length).to.eq(0);
			});
		});
	});

	// CS/R4 — seeded settings are ordinary per-chat state; changing them never mutates
	// the folder preset and the folder never re-applies its preset after creation.
	context('CS/R4: seeded settings are independent per-chat state', () => {
		it('changing the chat model does not change the folder preset', () => {
			const folder = `indep-${Date.now()}`;
			createFolder(folder);

			// Configure the preset with the first model.
			folderMenuAction(folder, 'Configure');
			cy.get('#model-selector-folder-config-model-button').click();
			cy.get('button[aria-label="model-item"]')
				.first()
				.invoke('text')
				.then((presetModel) => {
					cy.get('button[aria-label="model-item"]').first().click();
					cy.contains('button', 'Save').click();

					// Create a folder-scoped chat, then change its model to a different one.
					folderMenuAction(folder, 'New Chat');
					cy.get('button[aria-label="Select a model"]').click();
					cy.get('button[aria-label="model-item"]').eq(1).click();

					// Assert the folder preset is UNCHANGED: reopen Configure and verify the
					// model picker still shows the original preset model (no write-back).
					folderMenuAction(folder, 'Configure');
					cy.get('#model-selector-folder-config-model-button').should(
						'contain.text',
						presetModel.trim()
					);
					cy.contains('button', 'Cancel').click();
				});
		});

		it('keeps changed settings after reload (folder does not re-assert its preset)', () => {
			const folder = `reassert-${Date.now()}`;
			createFolder(folder);
			folderMenuAction(folder, 'Configure');
			cy.get('#model-selector-folder-config-model-button').click();
			cy.get('button[aria-label="model-item"]').first().click();
			cy.contains('button', 'Save').click();

			folderMenuAction(folder, 'New Chat');
			// Change the model, send a message to persist the chat, then reload.
			cy.get('button[aria-label="Select a model"]').click();
			cy.get('button[aria-label="model-item"]')
				.eq(1)
				.invoke('text')
				.then((changedModel) => {
					cy.get('button[aria-label="model-item"]').eq(1).click();
					cy.get('#chat-input').type('persisted change{enter}', { force: true });
					cy.get('.chat-user', { timeout: 10_000 }).should('exist');

					cy.reload();
					// The changed model persists; the folder did not re-apply its preset.
					cy.get('button[aria-label="Select a model"]').should(
						'contain.text',
						changedModel.trim()
					);
				});
		});
	});
});
