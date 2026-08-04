import { WEBUI_BASE_URL } from '$lib/constants';

const BASE = `${WEBUI_BASE_URL}/api`;

export type QueueItem = {
	id: string;
	job_type: string;
	priority: 'run_now' | 'high' | 'normal';
	status: string;
	created_at: number;
	label: string;
	model_id?: string;
	// Why the job is sitting where it is (self.ai#88). A curation run that
	// cannot get the GPU stays `queued` carrying the broker's refusal — who is
	// holding the card and what they said — so a row that never moves explains
	// itself instead of looking stuck.
	status_detail?: string;
};

async function queueFetch<T>(
	token: string,
	path: string,
	options: RequestInit = {}
): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			...((options.headers as Record<string, string>) ?? {})
		}
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ detail: res.statusText }));
		throw err?.detail ?? 'Request failed';
	}
	return res.json();
}

export const getQueue = (token: string) => queueFetch<QueueItem[]>(token, '/queue');

export const runNow = (token: string, jobType: string, jobId: string) =>
	queueFetch<{ message: string }>(token, `/jobs/${jobType}/${jobId}/run-now`, {
		method: 'POST'
	});

export const promoteJob = (token: string, jobType: string, jobId: string) =>
	queueFetch<{ message: string }>(token, `/jobs/${jobType}/${jobId}/promote`, {
		method: 'POST'
	});
