// load the global Cypress types
/// <reference types="cypress" />

declare namespace Cypress {
	interface Chainable {
		login(email: string, password: string): Chainable<Element>;
		register(name: string, email: string, password: string): Chainable<Element>;
		registerAdmin(): Chainable<Element>;
		loginAdmin(): Chainable<Element>;
		enableSignup(): Chainable<Element>;
		stubModels(): Chainable<Element>;
		registerStubModelRecords(): Chainable<Element>;
		closeModals(): Chainable<Element>;
		dismissChangelog(): Chainable<Element>;
		stubChatCompletion(): Chainable<Element>;
		/** Write a folder's is_expanded over the API; reload after (self.chat#45). */
		setFolderExpanded(name: string, isExpanded?: boolean): Chainable<Element>;
		uploadTestDocument(suffix: string): Chainable<Element>;
		deleteTestDocument(suffix: string): Chainable<Element>;
	}
}
