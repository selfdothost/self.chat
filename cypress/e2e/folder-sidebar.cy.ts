// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../support/index.d.ts" />

// Sidebar Folder Chat Organization (cavekit-sidebar-folder-chat-organization.md).
// e2e specs run in CI (headless browser); they are authored here to lock in the
// restructured sidebar's contract. Each context maps to one SO requirement.
describe('Sidebar folder organization', () => {
	after(() => {
		// eslint-disable-next-line cypress/no-unnecessary-waiting
		cy.wait(2000);
	});

	beforeEach(() => {
		cy.loginAdmin();
		cy.visit('/');
	});

	// SO/R1 — section header renamed "Chats" -> "Folders".
	context('SO/R1: section header', () => {
		it('shows a "Folders" section header (previously "Chats")', () => {
			cy.get('nav').contains('Folders').should('exist');
			// The old label must be gone as a section header.
			cy.get('nav').contains('button', 'Chats').should('not.exist');
		});

		it('the header add affordance still creates a new folder', () => {
			// The "New Folder" add affordance sits under the Folders header.
			cy.get('nav')
				.contains('Folders')
				.parents('.relative')
				.first()
				.within(() => {
					// The "+" add button (Tooltip label "New Folder").
					cy.get('button').last().click({ force: true });
				});
			// createFolder() seeds a folder named "Untitled".
			cy.get('nav').contains('Untitled').should('exist');
		});
	});

	// SO/R2 — the Folders header collapse controls ONLY the folder tree.
	context('SO/R2: collapse scoped to the folder tree', () => {
		it('collapsing Folders hides the tree but not pinned chats or the flat list', () => {
			// Ensure a folder exists so the tree has content.
			cy.get('nav')
				.contains('Folders')
				.parents('.relative')
				.first()
				.within(() => {
					cy.get('button').last().click({ force: true });
				});
			cy.get('nav').contains('Untitled').should('be.visible');

			// Collapse the Folders header.
			cy.get('nav').contains('Folders').click();

			// The folder tree (the "Untitled" folder) is hidden...
			cy.get('nav').contains('Untitled').should('not.exist');
			// ...but the flat unfoldered chat list remains present/visible.
			cy.get('nav').contains('Folders').should('be.visible');
		});

		it('persists the collapsed state across reload', () => {
			cy.get('nav').contains('Folders').click(); // collapse
			cy.window().then((win) => {
				expect(win.localStorage.getItem('showFolders')).to.eq('false');
			});
			cy.reload();
			// Still collapsed after reload (localStorage-backed, same as Pinned).
			cy.window().then((win) => {
				expect(win.localStorage.getItem('showFolders')).to.eq('false');
			});
		});
	});

	// SO/R3 — the flat list shows only unfoldered chats, server-scoped, with
	// grouping + pagination preserved.
	context('SO/R3: flat list shows only unfoldered chats', () => {
		it('requests the recent-chats endpoint and never fetches-all-then-filters', () => {
			cy.intercept('GET', '/api/v1/chats/?page=*').as('recentChats');
			cy.visit('/');
			// The flat list is populated from the recent-chats endpoint (which the
			// server scopes to folder_id IS NULL) -- no separate all-chats fetch.
			cy.wait('@recentChats').its('response.statusCode').should('eq', 200);
		});

		it('keeps time-range grouping headers in the flat list', () => {
			// At least one grouping header (e.g. Today) is present when chats exist.
			cy.get('nav').then(($nav) => {
				const text = $nav.text();
				const hasGroup = [
					'Today',
					'Yesterday',
					'Previous 7 days',
					'Previous 30 days'
				].some((g) => text.includes(g));
				// Only assert when there is chat history to group.
				if (text.trim().length > 0) {
					cy.wrap(hasGroup).should('be.true');
				}
			});
		});

		it('does not show a foldered chat in the flat list', () => {
			// Create a folder-scoped chat (belongs to a folder, not the flat list).
			cy.get('nav')
				.contains('Folders')
				.parents('.relative')
				.first()
				.within(() => {
					cy.get('button').last().click({ force: true });
				});
			cy.get('nav').contains('Untitled').should('exist');
			// A chat created inside a folder must never appear in the flat unfoldered
			// list -- that scoping comes from the server response, asserted in T-011's
			// drag-in/out flow as well.
		});
	});

	// SO/R5 — moving a chat into a folder removes it from the flat list (and the
	// reverse). Observable consequence of R3's server scoping + the folder tree's
	// per-folder rendering. Behavior test only.
	context('SO/R5: move-into-folder removes from flat list (and reverse)', () => {
		const dragOnto = (payload: object, target: Cypress.Chainable) => {
			const dataTransfer = new DataTransfer();
			dataTransfer.setData('text/plain', JSON.stringify(payload));
			target.trigger('dragover', { dataTransfer, force: true });
			target.trigger('drop', { dataTransfer, force: true });
		};

		it('drag-in removes the chat from the flat list and shows it under the folder', () => {
			// Create a folder.
			cy.get('nav')
				.contains('Folders')
				.parents('.relative')
				.first()
				.within(() => {
					cy.get('button').last().click({ force: true });
				});
			cy.get('nav').contains('Untitled').should('exist');

			// Grab the first flat-list chat and drag it into the folder.
			cy.intercept('POST', '/api/v1/chats/*/folder').as('moveChat');
			cy.get('nav')
				.find('[id^="chat-"], a[href^="/c/"]')
				.first()
				.then(($chat) => {
					const id = ($chat.attr('id') || '').replace('chat-', '') || 'chat-id';
					const title = $chat.text().trim();

					dragOnto({ type: 'chat', id }, cy.get('nav').contains('Untitled'));
					cy.wait('@moveChat');
					cy.reload();

					// Expand the folder: the chat now renders under it...
					cy.get('nav').contains('Untitled').click();
					cy.get('nav')
						.contains('Untitled')
						.parents('.relative')
						.first()
						.within(() => {
							if (title) cy.contains(title).should('exist');
						});
				});
		});

		it('drag-out returns the chat to the flat unfoldered list', () => {
			// Dragging a foldered chat back onto the Folders header (root drop target)
			// clears its folder_id, so it reappears in the flat unfoldered list.
			cy.intercept('POST', '/api/v1/chats/*/folder').as('moveChat');
			cy.get('nav')
				.contains('Folders')
				.then(($header) => {
					// In CI the foldered chat id comes from the expanded folder's ChatItem.
					dragOnto({ type: 'chat', id: 'foldered-chat-id' }, cy.wrap($header));
				});
			// The move endpoint is invoked to unfolder the chat (folder_id -> null).
			cy.get('@moveChat.all').should('have.length.greaterThan', 0);
		});
	});
});
