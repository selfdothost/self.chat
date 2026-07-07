import { CODE_EVAL_API_BASE_URL } from '$lib/constants';

type CodeEvalConfig = {
	ENABLE_CODE_EVAL_API: boolean;
	CODE_EVAL_BASE_URLS: string[];
};

export const getCodeEvalConfig = async (token: string = ''): Promise<CodeEvalConfig> => {
	const res = await fetch(`${CODE_EVAL_API_BASE_URL}/config`, {
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

export const updateCodeEvalConfig = async (
	token: string = '',
	config: CodeEvalConfig
): Promise<CodeEvalConfig> => {
	const res = await fetch(`${CODE_EVAL_API_BASE_URL}/config/update`, {
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

export const verifyCodeEvalConnection = async (
	token: string = '',
	url: string = ''
): Promise<any> => {
	const res = await fetch(`${CODE_EVAL_API_BASE_URL}/verify`, {
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
