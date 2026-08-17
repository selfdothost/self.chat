// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../support/index.d.ts" />
import { adminUser } from '../support/e2e';

// These tests assume the following defaults:
// 1. No users exist in the database or that the test admin user is an admin
// 2. Language is set to English
// 3. The default role for new users is 'pending'
describe('Registration and Login', () => {
	// Wait for 2 seconds after all tests to fix an issue with Cypress's video recording missing the last few frames
	after(() => {
		// eslint-disable-next-line cypress/no-unnecessary-waiting
		cy.wait(2000);
	});

	beforeEach(() => {
		cy.visit('/');
	});

	it('should register a new user as pending', () => {
		// self.ai switches ENABLE_SIGNUP off as soon as the first user exists
		// (routers/auths.py), so the sign-up UI this test drives is not
		// reachable by default. Re-open it as the admin first -- that is the
		// real precondition for self-registration in this product, and
		// asserting it here keeps the test honest rather than depending on a
		// database that happens to be empty.
		cy.enableSignup();

		// enableSignup() authenticates as the admin to flip the flag, which
		// leaves this browser LOGGED IN -- and a logged-in visit to '/' renders
		// the app, not the auth page, so there is no "Sign up" toggle to click.
		// (That is what made this test fail with "Expected to find content:
		// 'Sign up'": the precondition helper had quietly changed who we are.)
		// Drop the session and land on /auth explicitly, so the page fetches a
		// fresh /api/config -- the toggle only renders when
		// `$config.features.enable_signup` is true (auth/+page.svelte:287).
		cy.clearCookies();
		cy.clearLocalStorage();
		cy.visit('/auth');

		const userName = `Test User - ${Date.now()}`;
		const userEmail = `cypress-${Date.now()}@example.com`;
		// Toggle from sign in to sign up
		cy.contains('Sign up').click();
		// Fill out the form
		cy.get('input[autocomplete="name"]').type(userName);
		cy.get('input[autocomplete="email"]').type(userEmail);
		cy.get('input[type="password"]').type('password');
		// Submit the form
		cy.get('button[type="submit"]').click();
		// Wait until the user is redirected to the home page
		cy.contains(userName);
		// Expect the user to be pending
		cy.contains('Check Again');
	});

	it('can login with the admin user', () => {
		// Fill out the form
		cy.get('input[autocomplete="email"]').type(adminUser.email);
		cy.get('input[type="password"]').type(adminUser.password);
		// Submit the form
		cy.get('button[type="submit"]').click();
		// Wait until the user is redirected to the home page
		cy.contains(adminUser.name);
		// Dismiss the changelog dialog IF it is showing.
		//
		// The previous check read `ls['version']` off getAllLocalStorage(),
		// which returns storage keyed BY ORIGIN -- so `ls['version']` was
		// always undefined and the branch always ran, then failed whenever the
		// modal was not on screen. Ask the DOM instead of inferring from
		// storage: the modal is conditional (ChangelogModal.svelte), so a
		// conditional dismissal is what this needs.
		cy.get('body').then(($body) => {
			const button = $body.find('button:contains("Okay, Let\'s Go!")');
			if (button.length) {
				cy.wrap(button.first()).click();
			}
		});
	});
});
