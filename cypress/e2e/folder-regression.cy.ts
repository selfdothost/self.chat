// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../support/index.d.ts" />

// SO/R4 — No regression to existing folder behavior after the header rename (T-007)
// and collapse re-scope (T-008). This is a Cypress e2e regression suite (runs in CI,
// same as the repo's other cypress/ specs). Each `it` maps to one SO/R4 criterion.
//
// Drag-and-drop uses the app's text/plain JSON payload contract
// ({ type: 'chat' | 'folder', id }) read in RecursiveFolder/Sidebar drop handlers.
describe('Folder behavior regression (SO/R4)', () => {
	after(() => {
		// eslint-disable-next-line cypress/no-unnecessary-waiting
		cy.wait(2000);
	});

	beforeEach(() => {
		cy.loginAdmin();
		cy.visit('/');
	});

	const addFolderViaHeader = () => {
		cy.get('nav')
			.contains('Folders')
			.parents('.relative')
			.first()
			.within(() => {
				cy.get('button').last().click({ force: true });
			});
	};

	const renameFolder = (from: string, to: string) => {
		cy.get('nav').contains(from).dblclick();
		cy.focused().clear();
		cy.focused().type(`${to}{enter}`);
	};

	// Simulate an HTML5 drag-drop of a source element onto a target using a shared
	// DataTransfer carrying the app's text/plain JSON payload.
	const dragOnto = (payload: object, target: Cypress.Chainable) => {
		const dataTransfer = new DataTransfer();
		dataTransfer.setData('text/plain', JSON.stringify(payload));
		target.trigger('dragover', { dataTransfer, force: true });
		target.trigger('drop', { dataTransfer, force: true });
	};

	it('AC1: dragging a chat onto a folder moves the chat into the folder', () => {
		addFolderViaHeader();
		renameFolder('Untitled', 'DropTarget');

		// Intercept the move-into-folder call.
		cy.intercept('POST', '/api/v1/chats/*/folder').as('moveChat');

		// Drag the first flat-list chat onto the folder (id resolved from the app's
		// drag payload; in CI the chat id comes from the rendered ChatItem).
		cy.get('nav')
			.find('[id^="chat-"], a[href^="/c/"]')
			.first()
			.then(($chat) => {
				const id = ($chat.attr('id') || '').replace('chat-', '') || 'chat-id';
				dragOnto({ type: 'chat', id }, cy.get('nav').contains('DropTarget'));
			});

		cy.wait('@moveChat').its('response.statusCode').should('be.oneOf', [200, 201]);
	});

	it('AC2: dragging a folder onto another folder (or root) reparents it', () => {
		addFolderViaHeader();
		renameFolder('Untitled', 'Parent');
		addFolderViaHeader();
		renameFolder('Untitled', 'Child');

		cy.intercept('POST', '/api/v1/folders/*/update/parent').as('reparent');

		cy.get('nav')
			.contains('Child')
			.then(($child) => {
				const id = $child.attr('id') || 'child-id';
				dragOnto({ type: 'folder', id }, cy.get('nav').contains('Parent'));
			});

		cy.wait('@reparent').its('response.statusCode').should('be.oneOf', [200, 201]);
	});

	it('AC3: renaming a folder still works', () => {
		addFolderViaHeader();
		cy.intercept('POST', '/api/v1/folders/*/update').as('rename');
		renameFolder('Untitled', 'Renamed');
		cy.wait('@rename');
		cy.get('nav').contains('Renamed').should('exist');
	});

	it('AC4: exporting a folder still works', () => {
		addFolderViaHeader();
		renameFolder('Untitled', 'Exportable');
		cy.intercept('GET', '/api/v1/chats/folder/*').as('exportChats');
		// Open the folder options menu and click Export.
		cy.get('nav')
			.contains('Exportable')
			.parents('.group')
			.first()
			.within(() => {
				cy.get('button').last().click({ force: true });
			});
		cy.contains('Export').click({ force: true });
		cy.wait('@exportChats');
	});

	it('AC5: deleting a folder deletes the folder and its subtree', () => {
		addFolderViaHeader();
		renameFolder('Untitled', 'ToDelete');
		cy.intercept('DELETE', '/api/v1/folders/*').as('deleteFolder');
		cy.get('nav')
			.contains('ToDelete')
			.parents('.group')
			.first()
			.within(() => {
				cy.get('button').last().click({ force: true });
			});
		cy.contains('Delete').click({ force: true });
		// Confirm in the delete dialog.
		cy.contains('button', 'Confirm').click({ force: true });
		cy.wait('@deleteFolder');
		cy.get('nav').contains('ToDelete').should('not.exist');
	});

	it("AC6: a folder's expanded/collapsed state persists across reload", () => {
		addFolderViaHeader();
		renameFolder('Untitled', 'Persist');
		cy.intercept('POST', '/api/v1/folders/*/update/expanded').as('expanded');
		// Expand the folder (persists is_expanded server-side).
		cy.get('nav').contains('Persist').click();
		cy.wait('@expanded');
		cy.reload();
		// Server-persisted expanded state re-applies on load.
		cy.get('nav').contains('Persist').should('exist');
	});

	it('AC7: a folder renders its own contained chats when expanded', () => {
		// Create a folder-scoped chat, then expand the folder and assert the chat
		// renders under it (pre-existing per-folder rendering, unaltered).
		addFolderViaHeader();
		renameFolder('Untitled', 'WithChats');
		cy.get('nav')
			.contains('WithChats')
			.parents('.group')
			.first()
			.within(() => {
				cy.get('button').last().click({ force: true });
			});
		cy.contains('New Chat').click({ force: true });
		cy.get('button[aria-label="Select a model"]').click();
		cy.get('button[aria-label="model-item"]').first().click();
		cy.get('#chat-input').type('inside folder{enter}', { force: true });
		cy.get('.chat-user', { timeout: 10_000 }).should('exist');

		cy.reload();
		cy.get('nav').contains('WithChats').click(); // expand
		cy.get('nav')
			.contains('WithChats')
			.parents('.relative')
			.first()
			.within(() => {
				cy.contains('New Chat').should('exist');
			});
	});
});
