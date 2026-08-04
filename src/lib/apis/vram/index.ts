import { WEBUI_BASE_URL } from '$lib/constants';

// The VRAM lease broker's admin surface is mounted at /api/vram-leases (NOT
// under /api/v1) on the self.ai API server — see main.include_router.
export const VRAM_LEASES_API_BASE_URL = `${WEBUI_BASE_URL}/api/vram-leases`;

export type ReleaseAllResult = {
	consumer_id: string;
	ok: boolean;
	detail?: Record<string, unknown> | null;
};

export type ReleaseAllSummary = {
	results: ReleaseAllResult[];
};

/**
 * System-wide GPU e-stop: FORCE-unload every GPU model (llamolotl LLM,
 * self.speak TTS engines, self.sketch image gen) in parallel. Admin only.
 * Bypasses the cooperative VRAM-lease priority negotiation — "stop now".
 */
export const releaseAllVram = async (token: string): Promise<ReleaseAllSummary> => {
	let error = null;

	const res = await fetch(`${VRAM_LEASES_API_BASE_URL}/release-all`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err?.detail ?? err;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};
