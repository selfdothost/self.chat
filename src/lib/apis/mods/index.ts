import { WEBUI_API_BASE_URL } from '$lib/constants';

// A single entry as returned by `GET /api/v1/mods/enabled`
// (cavekit-mods-frontend-api.md R1/R5). The API filters by scope server-side:
// a mod the caller cannot see is simply ABSENT from the array — there is no
// partial entry and no null-field entry, so the client renders exactly what it
// receives and adds no gating of its own (client R1).
//
// `id`, `name`, and `scopes` are always present. The frontend/nav fields
// (`bundle_url`, `view`, `label`, `icon`, `add_to_nav`) are present only for a
// mod that declares a `frontend` block; they are optional here for that reason.
export type ModRegistryEntry = {
	id: string;
	name: string;
	scopes: string[];
	bundle_url?: string;
	view?: string;
	label?: string;
	icon?: string;
	add_to_nav?: boolean;
};

// Reads the enabled-mods registry. Returns the array the server produced,
// already scope-filtered for this caller (client R1: no second gating path).
export const getEnabledMods = async (token: string = ''): Promise<ModRegistryEntry[]> => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/mods/enabled`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.then((json) => {
			return json;
		})
		.catch((err) => {
			error = err.detail ?? err;
			console.log(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res ?? [];
};

// A mod's declared scopes with descriptions, as returned by
// `GET /api/v1/mods/scopes` (admin-only) — unlike ModRegistryEntry.scopes
// (held scope ids only), this is every scope the mod declares, regardless of
// current grant state, for the admin permissions editor to render toggles for.
export type ModScopeEntry = { id: string; desc: string };
export type ModScopesResponse = {
	id: string;
	name: string;
	scopes: ModScopeEntry[];
};

// Reads every loaded mod's full declared scope list (admin-only). Used by the
// permissions editor (Default Permissions + Group Permissions) to render one
// toggle per declared scope, labelled with its description.
export const getModScopes = async (token: string = ''): Promise<ModScopesResponse[]> => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/mods/scopes`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			authorization: `Bearer ${token}`
		}
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.then((json) => {
			return json;
		})
		.catch((err) => {
			error = err.detail ?? err;
			console.log(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res ?? [];
};
