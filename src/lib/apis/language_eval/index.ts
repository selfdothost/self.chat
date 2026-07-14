import { LANGUAGE_EVAL_API_BASE_URL } from '$lib/constants';

export type LanguageEvalConfig = {
	ENABLE_LANGUAGE_EVAL_API: boolean;
	LANGUAGE_EVAL_BASE_URLS: string[];
};

export const getLanguageEvalConfig = async (token: string = ''): Promise<LanguageEvalConfig> => {
	const res = await fetch(`${LANGUAGE_EVAL_API_BASE_URL}/config`, {
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { Authorization: `Bearer ${token}` })
		}
	}).then(async (r) => {
		if (!r.ok) throw await r.json();
		return r.json();
	});
	return res;
};

export const updateLanguageEvalConfig = async (
	token: string = '',
	config: LanguageEvalConfig
): Promise<LanguageEvalConfig> => {
	const res = await fetch(`${LANGUAGE_EVAL_API_BASE_URL}/config/update`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { Authorization: `Bearer ${token}` })
		},
		body: JSON.stringify(config)
	}).then(async (r) => {
		if (!r.ok) throw await r.json();
		return r.json();
	});
	return res;
};

// Not called anywhere yet (no caller to infer a response shape from).
export const verifyLanguageEvalConnection = async (
	token: string = '',
	url: string = ''
): Promise<unknown> => {
	const res = await fetch(`${LANGUAGE_EVAL_API_BASE_URL}/verify`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(token && { Authorization: `Bearer ${token}` })
		},
		body: JSON.stringify({ url })
	}).then(async (r) => {
		if (!r.ok) throw await r.json();
		return r.json();
	});
	return res;
};
