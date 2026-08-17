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
		cy.get('#sidebar')
			.contains('Folders')
			.parents('.relative')
			.first()
			.within(() => {
				cy.get('button').last().click({ force: true });
			});
		// Rename the freshly created "Untitled" folder by double-clicking it.
		//
		// force: true because the row is not "visible" to Cypress' own
		// definition until the sidebar settles -- cy.dblclick() failed here
		// with "this element is not visible" on every run. scrollIntoView
		// first so the click lands on the row rather than on whatever overlaps
		// it.
		cy.get('#sidebar').contains('Untitled').scrollIntoView();
		// dblclick the BUTTON that carries the handler, not the inner text node
		// cy.contains() resolves to (RecursiveFolder.svelte: the ondblclick sits
		// on #folder-<id>-button).
		cy.get('#sidebar').contains('Untitled').closest('button').dblclick({ force: true });
		// Target the rename input by id rather than cy.focused(). The component
		// focuses it imperatively via document.getElementById(...).focus() a
		// tick later, so cy.focused() raced it and failed 6/6 with "Expected to
		// find element: `focused`". The id shape is `folder-<uuid>-input`.
		const renameInput = '#sidebar input[id^="folder-"][id$="-input"]';
		cy.get(renameInput).should('be.visible');
		cy.get(renameInput).clear();
		cy.get(renameInput).type(`${name}{enter}`);
	};

	// Helper: open a folder's options menu and click an item.
	//
	// `action` is a data-testid suffix, NOT visible text. Matching on text was
	// ambiguous: the menu content is PORTALLED TO BODY (DropdownMenuContent
	// uses bits-ui `forceMount` + a custom child snippet, which opts out of the
	// automatic portal and re-portals manually), so it is not inside #sidebar
	// and cannot be scoped by it. `cy.contains('New Chat')` therefore searched
	// the whole document and matched BOTH the portalled menu item and the
	// sidebar's own new-chat button -- sometimes erroring with "can only be
	// called on a single element", and sometimes silently clicking the WRONG
	// one, which started an unfoldered chat and left the URL without
	// `folder_id`. That is what produced the `expected '.../' to include
	// 'folder_id='` failures; the app was doing the right thing all along.
	const folderMenuAction = (name: string, action: string) => {
		// The trigger is `invisible group-hover:visible`, so it is genuinely
		// not visible until the row is hovered -- force the click rather than
		// simulating hover, which Cypress cannot do natively.
		cy.get('#sidebar')
			.contains(name)
			.parents('.group')
			.first()
			.within(() => {
				cy.get('button').last().click({ force: true });
			});
		cy.get(`[data-testid="folder-menu-${action}"]`).should('exist');
		cy.get(`[data-testid="folder-menu-${action}"]`).click({ force: true });
	};

	// CS/R1 — a per-folder "New Chat" affordance creates a chat that belongs to
	// the folder without an intermediate unfoldered-then-move step.
	context('CS/R1: folder-scoped new chat', () => {
		it('creates a chat that belongs to the folder (not the flat list)', () => {
			createFolder(folderName);

			// Invoke the per-folder "New Chat" affordance.
			folderMenuAction(folderName, 'new-chat');

			// The URL should carry the folder context.
			cy.url().should('include', 'folder_id=');

			// Send a first message to actually create/persist the chat.
			// #model-selector-0-button, not the aria-label: the folder-config modal
			// mounts its OWN ModelSelector (id="folder-config-model"), and both
			// render the same aria-label, so the label selector matched two elements
			// once a config modal existed. The composer's selector is index 0 -- the
			// app addresses it the same way (Chat.svelte:612).
			cy.get('#model-selector-0-button').click();
			cy.get('button[aria-label="model-item"]').first().click();
			cy.get('#chat-input').type('Hello from a folder-scoped chat', { force: true });
			cy.get('button[type="submit"]').click();
			cy.get('.chat-user', { timeout: 10_000 }).should('exist');

			// After creation, the chat belongs to the folder: it appears under the
			// expanded folder, and NOT in the flat unfoldered list.
			// Set is_expanded BEFORE reloading, so the reload applies it. Clicking to
			// expand is a toggle over server-persisted state, and after a reload it can
			// COLLAPSE the folder and hide the very links this asserts (self.chat#45).
			cy.setFolderExpanded(folderName);
			cy.reload();
			cy.dismissChangelog();
			cy.closeModals();
			cy.get('#sidebar')
				.contains(folderName)
				.parents('.relative')
				.first()
				.within(() => {
					// Assert a CHAT LINK exists under the folder, not the literal text
					// "New Chat". The requirement is "the chat belongs to this folder";
					// its title is transient (see the title.auto pin in support/e2e.ts)
					// and asserting on it made this test race the rename.
					cy.get('a[href^="/c/"]').should('have.length.greaterThan', 0);
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
			folderMenuAction(presetFolder, 'configure');
			// :visible because a FolderConfigModal is mounted PER FOLDER and each
			// renders this same id -- so once a spec has created more than one
			// folder the plain id selector matches several elements and
			// cy.click() refuses ("can only be called on a single element").
			// Duplicate DOM ids are invalid HTML; scoping here is the test-side
			// workaround, not the real fix.
			// :visible AND .last(). Folders persist in the DB across tests in this
			// spec (only the page is reset in beforeEach), so by the later tests the
			// sidebar renders many folders -- and every FolderConfigModal hard-codes
			// the SAME element id (self.chat#39). :visible alone still matched two.
			// Each test creates its folder first, so that folder's modal is the last
			// one mounted. Workaround, not a fix: the real fix is keying the id per
			// folder in the app, which also touches FolderConfigModal.test.ts.
			cy.get('[id^="model-selector-folder-config-model-"][id$="-button"]:visible').last().click();
			cy.get('button[aria-label="model-item"]')
				.first()
				.invoke('text')
				.then((modelLabel) => {
					cy.get('button[aria-label="model-item"]').first().click();
					cy.get('[data-testid="folder-config-save"]:visible').last().click();
			cy.closeModals();

					// Create a chat scoped to that folder.
					folderMenuAction(presetFolder, 'new-chat');
					cy.url().should('include', 'folder_id=');

					// The composer's model selector reflects the seeded default model.
					cy.get('#model-selector-0-button').should(
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
			cy.get('#model-selector-0-button')
				.invoke('text')
				.then((baselineModel) => {
					const emptyFolder = `empty-${Date.now()}`;
					createFolder(emptyFolder);

					// No Configure step -> the folder has no preset.
					folderMenuAction(emptyFolder, 'new-chat');
					cy.url().should('include', 'folder_id=');

					// Same initial model as the unfoldered baseline (no seeding occurred).
					cy.get('#model-selector-0-button').should(
						'contain.text',
						baselineModel.trim()
					);
				});
		});

		it('a partial preset (model only) leaves tools/knowledge at defaults', () => {
			const partialFolder = `partial-${Date.now()}`;
			createFolder(partialFolder);

			// Configure only the model; leave tools + knowledge empty.
			folderMenuAction(partialFolder, 'configure');
			cy.get('[id^="model-selector-folder-config-model-"][id$="-button"]:visible').last().click();
			cy.get('button[aria-label="model-item"]').first().click();
			cy.get('[data-testid="folder-config-save"]:visible').last().click();
			cy.closeModals();

			folderMenuAction(partialFolder, 'new-chat');
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
			folderMenuAction(folder, 'configure');
			cy.get('[id^="model-selector-folder-config-model-"][id$="-button"]:visible').last().click();
			cy.get('button[aria-label="model-item"]')
				.first()
				.invoke('text')
				.then((presetModel) => {
					cy.get('button[aria-label="model-item"]').first().click();
					cy.get('[data-testid="folder-config-save"]:visible').last().click();
			cy.closeModals();

					// Create a folder-scoped chat, then change its model to a different one.
					folderMenuAction(folder, 'new-chat');
					cy.get('#model-selector-0-button').click();
					cy.get('button[aria-label="model-item"]').eq(1).click();

					// Assert the folder preset is UNCHANGED: reopen Configure and verify the
					// model picker still shows the original preset model (no write-back).
					folderMenuAction(folder, 'configure');
					cy.get('[id^="model-selector-folder-config-model-"][id$="-button"]:visible').last().should(
						'contain.text',
						presetModel.trim()
					);
					cy.get('[data-testid="folder-config-cancel"]:visible').last().click();
			cy.closeModals();
				});
		});

		it('keeps changed settings after reload (folder does not re-assert its preset)', () => {
			const folder = `reassert-${Date.now()}`;
			createFolder(folder);
			folderMenuAction(folder, 'configure');
			cy.get('[id^="model-selector-folder-config-model-"][id$="-button"]:visible').last().click();
			cy.get('button[aria-label="model-item"]').first().click();
			cy.get('[data-testid="folder-config-save"]:visible').last().click();
			cy.closeModals();

			folderMenuAction(folder, 'new-chat');
			// Change the model, send a message to persist the chat, then reload.
			cy.get('#model-selector-0-button').click();
			cy.get('button[aria-label="model-item"]')
				.eq(1)
				.invoke('text')
				.then((changedModel) => {
					cy.get('button[aria-label="model-item"]').eq(1).click();
					cy.get('#chat-input').type('persisted change{enter}', { force: true });
					cy.get('.chat-user', { timeout: 10_000 }).should('exist');

					cy.reload();
		cy.dismissChangelog();
		cy.closeModals();
					// The changed model persists; the folder did not re-apply its preset.
					cy.get('#model-selector-0-button').should(
						'contain.text',
						changedModel.trim()
					);
				});
		});
	});
});

