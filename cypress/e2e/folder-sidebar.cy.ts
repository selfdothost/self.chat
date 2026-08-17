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
			cy.get('#sidebar').contains('Folders').should('exist');
			// The old label must be gone as a section header.
			cy.get('#sidebar').contains('button', 'Chats').should('not.exist');
		});

		it('the header add affordance still creates a new folder', () => {
			// The "New Folder" add affordance sits under the Folders header.
			cy.get('#sidebar')
				.contains('Folders')
				.parents('.relative')
				.first()
				.within(() => {
					// The "+" add button (Tooltip label "New Folder").
					cy.get('button').last().click({ force: true });
				});
			// createFolder() seeds a folder named "Untitled".
			cy.get('#sidebar').contains('Untitled').should('exist');
		});
	});

	// SO/R2 — the Folders header collapse controls ONLY the folder tree.
	context('SO/R2: collapse scoped to the folder tree', () => {
		it('collapsing Folders hides the tree but not pinned chats or the flat list', () => {
			// Ensure a folder exists so the tree has content.
			cy.get('#sidebar')
				.contains('Folders')
				.parents('.relative')
				.first()
				.within(() => {
					cy.get('button').last().click({ force: true });
				});
			cy.get('#sidebar').contains('Untitled').should('be.visible');

			// Collapse the Folders header.
			cy.get('#sidebar').contains('Folders').click();

			// The folder tree (the "Untitled" folder) is hidden...
			cy.get('#sidebar').contains('Untitled').should('not.exist');
			// ...but the flat unfoldered chat list remains present/visible.
			cy.get('#sidebar').contains('Folders').should('be.visible');
		});

		it('persists the collapsed state across reload', () => {
			cy.get('#sidebar').contains('Folders').click(); // collapse
			cy.window().then((win) => {
				expect(win.localStorage.getItem('showFolders')).to.eq('false');
			});
			cy.reload();
		cy.dismissChangelog();
		cy.closeModals();
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
			// A REGEX, not a glob string. Cypress treats a string url as a minimatch
			// glob, where `?` matches exactly ONE CHARACTER -- so '/api/v1/chats/?page=*'
			// could never match a literal '?' and the intercept never fired
			// ("No request ever occurred"). The pattern was wrong a second way too:
			// getChatList builds `/chats/?${searchParams}` and passes page=null on the
			// initial load, so the real URL is '/api/v1/chats/?' with NO page= at all.
			cy.intercept({ method: 'GET', url: /\/api\/v1\/chats\/\?/ }).as('recentChats');
			cy.visit('/');
			// The flat list is populated from the recent-chats endpoint (which the
			// server scopes to folder_id IS NULL) -- no separate all-chats fetch.
			cy.wait('@recentChats').its('response.statusCode').should('eq', 200);
		});

		it('keeps time-range grouping headers in the flat list', () => {
			// At least one grouping header (e.g. Today) is present when chats exist.
			cy.get('#sidebar').then(($nav) => {
				// Guard on actual CHATS, not on the sidebar having any text at all.
				// The old guard was `text.trim().length > 0`, which is true for an
				// empty sidebar -- it always has buttons and section headers -- so the
				// assertion ran even with nothing to group and failed with a bare
				// "expected false to be true". Earlier tests in this spec move the
				// only chat into a folder, so the flat list is legitimately empty here.
				const flatChats = $nav.find('a[href^="/c/"]').length;
				if (flatChats === 0) {
					cy.log('no unfoldered chats in the flat list — nothing to group');
					return;
				}

				// Sidebar.svelte renders `{$i18n.t(chat.time_range)}`, and time_range
				// is NOT limited to the four recent buckets: anything older than 30
				// days is grouped under a MONTH name (the i18n key list in that file
				// enumerates January..December alongside Today/Yesterday/Previous N).
				// Accepting only the recent four would fail on an aged fixture.
				const text = $nav.text();
				const months = [
					'January', 'February', 'March', 'April', 'May', 'June',
					'July', 'August', 'September', 'October', 'November', 'December'
				];
				const hasGroup = [
					'Today',
					'Yesterday',
					'Previous 7 days',
					'Previous 30 days',
					...months
				].some((g) => text.includes(g));
				cy.wrap(hasGroup).should('be.true');
			});
		});

		it('does not show a foldered chat in the flat list', () => {
			// Create a folder-scoped chat (belongs to a folder, not the flat list).
			cy.get('#sidebar')
				.contains('Folders')
				.parents('.relative')
				.first()
				.within(() => {
					cy.get('button').last().click({ force: true });
				});
			cy.get('#sidebar').contains('Untitled').should('exist');
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
			cy.get('#sidebar')
				.contains('Folders')
				.parents('.relative')
				.first()
				.within(() => {
					cy.get('button').last().click({ force: true });
				});
			cy.get('#sidebar').contains('Untitled').should('exist');

			// Grab the first flat-list chat and drag it into the folder.
			cy.intercept('POST', '/api/v1/chats/*/folder').as('moveChat');
			cy.get('#sidebar')
				.find('a[href^="/c/"]')
				.first()
				.then(($chat) => {
					// ChatItem renders <a href="/c/<id>"> with no id attribute, so the
					// attr('id') read was always undefined and fell back to a literal
					// placeholder -- which 404s and crashed the app's drop handler
					// (self.chat#38). Resolve from the href instead.
					const href = $chat.attr('href') || '';
					const id = href.split('/c/')[1] || '';
					expect(id, 'chat id resolved from the sidebar item').to.match(/^[0-9a-f-]{8,}$/);
					const title = $chat.text().trim();

					dragOnto({ type: 'chat', id }, cy.get('#sidebar').contains('Untitled'));
					cy.wait('@moveChat');
					// Expand the folder: the chat now renders under it. Set is_expanded
					// BEFORE the reload rather than clicking after it -- the click is a
					// toggle over server-persisted state (self.chat#45).
					cy.setFolderExpanded('Untitled');
					cy.reload();
					cy.dismissChangelog();
					cy.closeModals();
					cy.get('#sidebar')
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
			// This previously passed a hard-coded placeholder id while its own comment
			// claimed the id "comes from the expanded folder's ChatItem" -- it never
			// did. A bogus id 404s, which is what produced the null-deref crash
			// rather than any real drag-out defect. Resolve a REAL foldered chat:
			// expand the folder the previous test filled and read its href.
			// see self.chat#45 -- set is_expanded then re-enter the app, rather than
			// clicking to toggle server-persisted state. cy.visit('/') rather than
			// cy.reload(): this test had no reload of its own, and a bare reload here
			// did not bring #sidebar back within the default timeout. visit('/') is
			// the same entry the beforeEach uses, which is known to render the sidebar.
			cy.setFolderExpanded('Untitled');
			cy.visit('/');
			cy.dismissChangelog();
			cy.closeModals();
			cy.get('#sidebar')
				.contains('Untitled')
				.parents('.relative')
				.first()
				.find('a[href^="/c/"]')
				.first()
				.then(($chat) => {
					const id = ($chat.attr('href') || '').split('/c/')[1] || '';
					expect(id, 'foldered chat id').to.match(/^[0-9a-f-]{8,}$/);
					dragOnto({ type: 'chat', id }, cy.get('#sidebar').contains('Folders'));
				});
			// The move endpoint is invoked to unfolder the chat (folder_id -> null).
			cy.get('@moveChat.all').should('have.length.greaterThan', 0);
		});
	});
});
