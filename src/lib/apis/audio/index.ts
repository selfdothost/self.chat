import { AUDIO_API_BASE_URL, WEBUI_API_BASE_URL } from '$lib/constants';

export const getAudioConfig = async (token: string) => {
	let error = null;

	const res = await fetch(`${AUDIO_API_BASE_URL}/config`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.log(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// Matches the actual `{ tts, stt }` shape sent from Audio.svelte's
// updateConfigHandler — the previous `{ url, key, model, speaker }` shape
// here was stale and didn't match any real call site.
type TTSConfigForm = {
	OPENAI_API_BASE_URL: string;
	OPENAI_API_KEY: string;
	API_KEY: string;
	ENGINE: string;
	MODEL: string;
	VOICE: string;
	SPLIT_ON: string;
	AZURE_SPEECH_REGION: string;
	AZURE_SPEECH_OUTPUT_FORMAT: string;
};

type STTConfigForm = {
	OPENAI_API_BASE_URL: string;
	OPENAI_API_KEY: string;
	ENGINE: string;
	MODEL: string;
	WHISPER_MODEL: string;
};

type OpenAIConfigForm = {
	tts: TTSConfigForm;
	stt: STTConfigForm;
};

export const updateAudioConfig = async (token: string, payload: OpenAIConfigForm) => {
	let error = null;

	const res = await fetch(`${AUDIO_API_BASE_URL}/config/update`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({
			...payload
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.log(err);
			error = err.detail;
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const transcribeAudio = async (token: string, file: File) => {
	const data = new FormData();
	data.append('file', file);

	let error = null;
	const res = await fetch(`${AUDIO_API_BASE_URL}/transcriptions`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			authorization: `Bearer ${token}`
		},
		body: data
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail;
			console.log(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const synthesizeOpenAISpeech = async (
	token: string = '',
	speaker: string = 'alloy',
	text: string = '',
	model?: string
) => {
	let error = null;

	const res = await fetch(`${AUDIO_API_BASE_URL}/speech`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			input: text,
			voice: speaker,
			...(model && { model })
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res;
		})
		.catch((err) => {
			error = err.detail;
			console.log(err);

			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

interface AvailableModelsResponse {
	models: { name: string; id: string }[] | { id: string }[];
}

export const getModels = async (token: string = ''): Promise<AvailableModelsResponse> => {
	let error = null;

	const res = await fetch(`${AUDIO_API_BASE_URL}/models`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail;
			console.log(err);

			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getVoices = async (token: string = '') => {
	let error = null;

	const res = await fetch(`${AUDIO_API_BASE_URL}/voices`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail;
			console.log(err);

			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// The admin-enabled ("selectable") self-hosted TTS voices, from the typed
// voice-catalog surface (distinct from the legacy /audio/voices list). Returns
// [] when no self-hosted TTS connection / no enabled voices are configured —
// callers should treat an empty list as "no per-model voice picker to show".
export const getSelectableVoices = async (token: string = '') => {
	const res = await fetch(`${WEBUI_API_BASE_URL}/voice-catalog/voices/selectable`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			// A deployment without self-hosted TTS returns 400/empty — not an error
			// worth surfacing; the picker simply won't render.
			console.log(err);
			return null;
		});

	// Normalize to a plain voice array; null/absent -> [].
	return (res?.voices ?? []) as Array<{
		id: string;
		name?: string;
		language?: string | null;
		gender?: string | null;
	}>;
};

// ---------------------------------------------------------------------------
// Admin voice curation (cavekit-audio-voice-picker R1/R4, reached from the
// admin Audio surface per cavekit-audio-admin-surface R2).
//
// /voices/curation is the *admin* view of the same aggregated, source-attributed
// catalog /voices/selectable narrows: EVERY voice is listed, including disabled
// ones, each carrying an `enabled` flag plus the connection it came from. The
// toggle that flips that flag is POST /voices/{id}/enabled — both sides read and
// write the one AUDIO_TTS_ENABLED_VOICES map, so a toggle is reflected on the
// next load of the list and in the downstream (selectable) set.
// ---------------------------------------------------------------------------

export type VoiceCurationEntry = {
	id: string;
	name?: string;
	language?: string | null;
	gender?: string | null;
	enabled: boolean;
	source_connection_id?: string | null;
	source_connection_label?: string | null;
};

// Read the curation list, optionally narrowed by a text search (matched server
// side against id/name/language/gender/source connection).
//
// Deliberately null-tolerant, exactly like getSelectableVoices above: a
// deployment with no self-hosted TTS connection legitimately yields an empty
// list (or a 400 from the unconfigured-backend guard), which is correct
// behaviour rather than an error. Never throws, never toasts — the caller gets
// [] and simply renders nothing to curate. The mutation below is the one that
// may throw, because a failed toggle has to be surfaced.
export const getVoiceCuration = async (token: string = '', search: string = '') => {
	const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';

	const res = await fetch(`${WEBUI_API_BASE_URL}/voice-catalog/voices/curation${query}`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			// No self-hosted TTS connection -> empty/400. Not worth surfacing.
			console.log(err);
			return null;
		});

	// Normalize to a plain array; null/absent -> [].
	return (res?.voices ?? []) as VoiceCurationEntry[];
};

// Toggle whether end users may select a voice. Unlike the read above this is a
// mutation and DOES throw on failure, so a caller doing an optimistic toggle can
// revert it.
export const setVoiceEnabled = async (token: string, voiceId: string, enabled: boolean) => {
	let error = null;

	const res = await fetch(
		`${WEBUI_API_BASE_URL}/voice-catalog/voices/${encodeURIComponent(voiceId)}/enabled`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ enabled })
		}
	)
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.log(err);
			error = err.detail ?? err;
			return null;
		});

	if (error) {
		throw error;
	}

	return res as { id: string; enabled: boolean };
};

// ---------------------------------------------------------------------------
// Typed audio connections (the Connections surface's "Audio" section).
//
// These back the type-first chooser: /types returns the five selectable kinds,
// each carrying the fields IT presents (name/label/secret) plus a
// management_action for the two self-hosted kinds. The CRUD routes persist the
// connection set. Secret field values are masked in every response — the server
// never echoes a stored credential back.
// ---------------------------------------------------------------------------

export type AudioConnectionField = {
	name: string;
	label: string;
	secret: boolean;
};

export type AudioConnectionType = {
	type: string;
	label: string;
	self_hosted: boolean;
	capabilities: string[];
	fields: AudioConnectionField[];
	management_action: null | {
		kind: string;
		label: string;
		target: string;
		opens_in_surface: boolean;
		supports_download: boolean;
		download_target: string | null;
	};
};

export type AudioConnection = {
	id: string;
	type: string;
	label: string;
	fields: Record<string, string>;
	management_action: AudioConnectionType['management_action'];
};

const audioConnectionsUrl = `${WEBUI_API_BASE_URL}/audio/connections`;

const jsonOrThrow = async (res: Response) => {
	if (!res.ok) throw await res.json();
	return res.json();
};

export const getAudioConnectionTypes = async (token: string = '') => {
	const res = await fetch(`${audioConnectionsUrl}/types`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
	})
		.then(jsonOrThrow)
		.catch((err) => {
			console.log(err);
			return null;
		});

	return (res?.types ?? []) as AudioConnectionType[];
};

export const getAudioConnections = async (token: string = '') => {
	const res = await fetch(audioConnectionsUrl, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
	})
		.then(jsonOrThrow)
		.catch((err) => {
			console.log(err);
			return null;
		});

	return (res?.connections ?? []) as AudioConnection[];
};

export const createAudioConnection = async (
	token: string,
	type: string,
	fields: Record<string, string>
) => {
	let error = null;

	const res = await fetch(audioConnectionsUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ type, fields })
	})
		.then(jsonOrThrow)
		.catch((err) => {
			error = err.detail ?? err;
			return null;
		});

	if (error) throw error;
	return res as AudioConnection;
};

export const updateAudioConnection = async (
	token: string,
	id: string,
	fields: Record<string, string>
) => {
	let error = null;

	const res = await fetch(`${audioConnectionsUrl}/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ fields })
	})
		.then(jsonOrThrow)
		.catch((err) => {
			error = err.detail ?? err;
			return null;
		});

	if (error) throw error;
	return res as AudioConnection;
};

export const deleteAudioConnection = async (token: string, id: string) => {
	let error = null;

	const res = await fetch(`${audioConnectionsUrl}/${id}`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
	})
		.then(jsonOrThrow)
		.catch((err) => {
			error = err.detail ?? err;
			return null;
		});

	if (error) throw error;
	return res;
};
