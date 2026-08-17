// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../support/index.d.ts" />

// These tests run through the various settings pages, ensuring that the user can interact with them as expected
describe('Settings', () => {
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
		// Click on the user menu
		cy.get('button[aria-label="User Menu"]').click();
		// Click on the settings link
		cy.get('button').contains('Settings').click();
	});

	// Every tab/button click below is scoped to the OPEN SETTINGS DIALOG and matched
	// EXACTLY. Both matter:
	//
	//   * `cy.get('button').contains('Chats')` matched a SIDEBAR FOLDER named
	//     "WithChats" -- folder rows are <button id="folder-<id>-button">, and
	//     .contains() is a SUBSTRING match returning the first DOM hit, which is the
	//     sidebar, not the dialog. That row then sits behind the dialog's own
	//     overlay, so the click failed with "covered by another element" and pointed
	//     at the innocent folder.
	//   * the folder exists because folder-regression.cy.ts created it earlier in the
	//     same run -- specs share a database, so any bare text match is hostage to
	//     whatever another spec happened to name something.
	//
	// The anchors carry \s* padding ON PURPOSE: Cypress matches a regex against an
	// element's TEXT CONTENT, which here has surrounding whitespace, so a bare
	// /^General$/ matched nothing and took all six tests down (0/6, from 5/6).
	// \s* keeps the match exact enough to exclude "WithChats" while tolerating
	// the padding.
	context('General', () => {
		it('user can open the General modal and hit save', () => {
			cy.get('.modal').contains('button', /^\s*General\s*$/).click();
			cy.get('.modal').contains('button', /^\s*Save\s*$/).click();
		});
	});

	context('Interface', () => {
		it('user can open the Interface modal and hit save', () => {
			cy.get('.modal').contains('button', /^\s*Interface\s*$/).click();
			cy.get('.modal').contains('button', /^\s*Save\s*$/).click();
		});
	});

	context('Audio', () => {
		it('user can open the Audio modal and hit save', () => {
			cy.get('.modal').contains('button', /^\s*Audio\s*$/).click();
			cy.get('.modal').contains('button', /^\s*Save\s*$/).click();
		});
	});

	context('Chats', () => {
		it('user can open the Chats modal', () => {
			cy.get('.modal').contains('button', /^\s*Chats\s*$/).click();
		});
	});

	context('Account', () => {
		it('user can open the Account modal and hit save', () => {
			cy.get('.modal').contains('button', /^\s*Account\s*$/).click();
			cy.get('.modal').contains('button', /^\s*Save\s*$/).click();
		});
	});

	context('About', () => {
		it('user can open the About modal', () => {
			cy.get('.modal').contains('button', /^\s*About\s*$/).click();
		});
	});
});
