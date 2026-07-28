import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEnabledMods } from './index';

// client R1 — the registry API client. Confirms the loader reads the real
// endpoint (`GET /api/v1/mods/enabled`), attaches the Bearer token the same way
// every sibling api module does, and returns the array the server produced.

describe('getEnabledMods', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('GETs /api/v1/mods/enabled with a Bearer token and returns the response array', async () => {
		const payload = [
			{ id: 'reference', name: 'Reference', scopes: ['mods.reference.use'], view: 'status', label: 'Reference Status', icon: '🛰️', add_to_nav: true }
		];
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => payload
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await getEnabledMods('tok-123');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, opts] = fetchMock.mock.calls[0];
		expect(String(url)).toContain('/api/v1/mods/enabled');
		expect(opts.method).toBe('GET');
		expect(opts.headers.authorization).toBe('Bearer tok-123');
		expect(result).toEqual(payload);
	});

	it('returns an empty array (not null) when the endpoint yields no body', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => null
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(getEnabledMods('tok')).resolves.toEqual([]);
	});

	it('throws the error detail when the endpoint responds not-ok', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			json: async () => ({ detail: 'nope' })
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(getEnabledMods('tok')).rejects.toBe('nope');
	});
});
