import { CURATOR_API_BASE_URL } from '$lib/constants';

export const verifyCuratorConnection = async (
	token: string = '',
	url: string = '',
	key: string = ''
) => {
	let error = null;

	const res = await fetch(`${CURATOR_API_BASE_URL}/verify`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			url,
			key
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = `Curator: ${err?.error?.message ?? err?.detail ?? 'Network Problem'}`;
			return [];
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getCuratorConfig = async (token: string = '') => {
	let error = null;

	const res = await fetch(`${CURATOR_API_BASE_URL}/config`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.log(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

type CuratorConfig = {
	ENABLE_CURATOR_API: boolean;
	CURATOR_BASE_URLS: string[];
	CURATOR_API_CONFIGS: object;
};

export const updateCuratorConfig = async (token: string = '', config: CuratorConfig) => {
	let error = null;

	const res = await fetch(`${CURATOR_API_BASE_URL}/config/update`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify({
			...config
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.log(err);
			if ('detail' in err) {
				error = err.detail;
			} else {
				error = 'Server connection failed';
			}
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

type StageConfig = {
	type: string;
	// Stage-specific params vary per stage `type` and are only ever
	// round-tripped through the API as JSON, never read here.
	params: Record<string, unknown>;
};

type CurationJobCreate = {
	name: string;
	input_path: string;
	output_path: string;
	text_field: string;
	stages: StageConfig[];
	max_lines?: number | null;
	output_format?: string;
	scheduled_for?: string | null;
};

async function curatorFetch<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(`${CURATOR_API_BASE_URL}${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...(token && { Authorization: `Bearer ${token}` }),
			...((options.headers as Record<string, string>) ?? {})
		}
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ detail: res.statusText }));
		throw err?.detail ?? 'Request failed';
	}
	return res.json();
}

// Only the fields actually read by callers (see PipelineJobsPanel.svelte) —
// the curator daemon's job records carry more than this, but nothing here
// destructures beyond job_id/name/status/created_at.
export type CuratorJob = {
	job_id: string;
	name: string;
	status: string;
	created_at: string | number;
};

export const listCuratorJobs = (token: string = '') =>
	curatorFetch<CuratorJob[]>(token, '/api/jobs');

export const getCuratorJobLogs = (token: string = '', jobId: string, tail = 50) =>
	curatorFetch<{ lines: string[] }>(token, `/api/jobs/${jobId}/logs?tail=${tail}`);

// schedule/unschedule/approve/cancel aren't called anywhere in the app yet
// (see the eslint burn-down issue) — `unknown` rather than a guessed shape,
// since no caller exists to infer one from.
export const scheduleCuratorJob = (token: string = '', jobId: string, scheduledFor: number) =>
	curatorFetch<unknown>(token, `/api/jobs/${jobId}/schedule`, {
		method: 'POST',
		body: JSON.stringify({ scheduled_for: scheduledFor })
	});

export const unscheduleCuratorJob = (token: string = '', jobId: string) =>
	curatorFetch<unknown>(token, `/api/jobs/${jobId}/unschedule`, { method: 'POST', body: '{}' });

export const approveCuratorJob = (token: string = '', jobId: string) =>
	curatorFetch<unknown>(token, `/api/jobs/${jobId}/approve`, { method: 'POST', body: '{}' });

export const cancelCuratorJob = (token: string = '', jobId: string) =>
	curatorFetch<unknown>(token, `/api/jobs/${jobId}/cancel`, { method: 'POST', body: '{}' });

// Legacy: direct-to-curator job creation (used internally by daemon proxy)
// Frontend should use queueCuratorJob() instead.
export const createCuratorJob = async (token: string = '', job: CurationJobCreate) => {
	const res = await fetch(`${CURATOR_API_BASE_URL}/api/jobs`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && {Authorization: `Bearer ${token}`})
		},
		body: JSON.stringify(job)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		});

	return res;
};

type QueueCuratorJobRequest = {
	pipeline_id: string;
	pipeline_config: CurationJobCreate;
	scheduled_for?: number | null;
	priority?: string;
	dataset_name?: string;
};

export const queueCuratorJob = (token: string = '', req: QueueCuratorJobRequest) =>
	curatorFetch<{ id: string }>(token, '/queue', {
		method: 'POST',
		body: JSON.stringify(req)
	});
