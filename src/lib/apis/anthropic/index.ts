import { ANTHROPIC_API_BASE_URL } from '$lib/constants';

export type AnthropicConnectionConfig = {
	enable?: boolean;
	// Anthropic authenticates with x-api-key, and the key lives inside the per-URL config
	// bag rather than a parallel keys array as on the OpenAI side (self.ai#59).
	key?: string;
	prefix_id?: string;
	model_ids?: string[];
};

export type AnthropicConfig = {
	ENABLE_ANTHROPIC_API: boolean | null;
	ANTHROPIC_BASE_URLS: string[];
	ANTHROPIC_API_CONFIGS: Record<string, AnthropicConnectionConfig>;
};

export const getAnthropicConfig = async (token: string = '') => {
	let error = null;

	const res = await fetch(`${ANTHROPIC_API_BASE_URL}/config`, {
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
			console.error(err);
			error = `Anthropic: ${err?.detail ?? 'Network Problem'}`;
			return null;
		});

	if (error) {
		throw error;
	}

	return res as AnthropicConfig;
};

export const updateAnthropicConfig = async (token: string = '', config: AnthropicConfig) => {
	let error = null;

	const res = await fetch(`${ANTHROPIC_API_BASE_URL}/config/update`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { authorization: `Bearer ${token}` })
		},
		body: JSON.stringify(config)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = `Anthropic: ${err?.detail ?? 'Network Problem'}`;
			return null;
		});

	if (error) {
		throw error;
	}

	return res as AnthropicConfig;
};

export const verifyAnthropicConnection = async (
	token: string = '',
	url: string = 'https://api.anthropic.com',
	key: string = ''
) => {
	let error = null;

	const res = await fetch(`${ANTHROPIC_API_BASE_URL}/verify`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ url, key })
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = `Anthropic: ${err?.detail ?? 'Network Problem'}`;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getAnthropicModels = async (token: string = '', urlIdx?: number) => {
	let error = null;

	const res = await fetch(
		`${ANTHROPIC_API_BASE_URL}/models${typeof urlIdx === 'number' ? `/${urlIdx}` : ''}`,
		{
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				...(token && { authorization: `Bearer ${token}` })
			}
		}
	)
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = `Anthropic: ${err?.detail ?? 'Network Problem'}`;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};
