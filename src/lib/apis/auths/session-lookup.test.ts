import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSessionUser, SessionLookupFailedError } from './index';

// A session lookup has THREE outcomes, and the third one is the whole point of
// this file. `+layout.svelte` answers a falsy session user by DELETING
// `localStorage.token`, so "the server rejected your token" and "the request
// never got there" must not arrive at the caller wearing the same face. They
// used to: the shared `.catch((err) => { error = err.detail; return null; })`
// shape swallows a fetch-level TypeError (no `.detail`), resolved to null, and
// one aborted request signed the reader out permanently.
describe('getSessionUser', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('GETs /api/v1/auths/ with a Bearer token and returns the session user', async () => {
		const payload = { id: 'u1', email: 'admin@example.com', role: 'admin', token: 'jwt' };
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => payload
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await getSessionUser('tok-123');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, opts] = fetchMock.mock.calls[0];
		expect(String(url)).toContain('/api/v1/auths/');
		expect(opts.method).toBe('GET');
		expect(opts.headers.Authorization).toBe('Bearer tok-123');
		// The cookie carries the session on same-origin deploys; dropping it here
		// would sign out every reader who has no bearer token in localStorage.
		expect(opts.credentials).toBe('include');
		expect(result).toEqual(payload);
	});

	// The SERVER judged the credential and said no. Unchanged contract: the
	// reply's `detail` is thrown, and the caller is right to clear the token.
	it('throws the reply detail when the server rejects the credential', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			json: async () => ({ detail: 'Invalid token' })
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(getSessionUser('tok')).rejects.toBe('Invalid token');
	});

	it('throws something truthy when the server rejects without a detail body', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 403,
			json: async () => {
				throw new SyntaxError('Unexpected end of JSON input');
			}
		});
		vi.stubGlobal('fetch', fetchMock);

		// The old shape read `err.detail` off this and got undefined, so
		// `if (error) throw error` never fired and the function RESOLVED to null --
		// the caller could not tell it apart from a rejection it should act on.
		await expect(getSessionUser('tok')).rejects.toBe('403');
	});

	// The request never reached the server. Nothing has been learned about the
	// token, so this must NOT resolve to null (which reads as "signed out") and
	// must be distinguishable from the rejection above.
	it('throws SessionLookupFailedError when the request never reaches the server', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		vi.stubGlobal('fetch', fetchMock);

		await expect(getSessionUser('tok')).rejects.toBeInstanceOf(SessionLookupFailedError);
	});

	it('throws SessionLookupFailedError when the document navigates away mid-flight', async () => {
		// What Cypress' second `cy.visit('/')` does to the first boot's lookup, and
		// what an ordinary reload-during-boot does in a real browser.
		const aborted = new DOMException('The user aborted a request.', 'AbortError');
		const fetchMock = vi.fn().mockRejectedValue(aborted);
		vi.stubGlobal('fetch', fetchMock);

		await expect(getSessionUser('tok')).rejects.toBeInstanceOf(SessionLookupFailedError);
	});

	it('never resolves to null: an undelivered lookup rejects instead', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		vi.stubGlobal('fetch', fetchMock);

		// Guards the exact regression: a resolved null is what `+layout.svelte`
		// treats as "invalid session, delete the token".
		let resolved: unknown = Symbol('did not resolve');
		await getSessionUser('tok').then(
			(v) => {
				resolved = v;
			},
			() => {}
		);
		expect(resolved).not.toBeNull();
	});

	it('keeps the original failure as the error cause', async () => {
		const boom = new TypeError('Failed to fetch');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(boom));

		await expect(getSessionUser('tok')).rejects.toMatchObject({ cause: boom });
	});
});
