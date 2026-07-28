// Pure seeding logic for a folder-scoped new chat (Chat Creation Folder Seeding kit).
// Given a folder's stored preset and the currently-available models/tools/knowledge,
// compute which chat settings to seed. Seeding is a plain no-op per unset field
// (CS/R3): only fields the preset actually sets appear in the result, so the caller
// leaves the rest at the unfoldered defaults.

export type FolderPreset = {
	default_model_id?: string | null;
	tool_ids?: string[];
	knowledge_ids?: string[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KnowledgeBase = { id: string; [key: string]: any };

export type FolderSeed = {
	selectedModels?: string[];
	selectedToolIds?: string[];
	webSearchEnabled?: boolean;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	knowledgeCollections?: Array<Record<string, any>>;
};

export type FolderSeedOptions = {
	modelIds: string[];
	toolIds: string[];
	knowledgeBases: KnowledgeBase[];
	// Whether Web Search is currently enabled system-wide ($config.features.enable_web_search).
	// A preset referencing the reserved "web_search" tool_id only seeds it when true --
	// mirrors the backend's own gating in resolve_tool_ref (self.ai's folder_presets.py).
	webSearchEnabled?: boolean;
};

// Reserved tool_id standing in for the Web Search toggle (self.ai's
// BUILTIN_TOOL_IDS) -- not a row in the tool table, so it's carried separately
// from `selectedToolIds` rather than filtered against `toolIds`.
const WEB_SEARCH_TOOL_ID = 'web_search';

/**
 * Reads the `meta.preset.{default_model_id, tool_ids, knowledge_ids}` shape the
 * config modal writes (CS/R2) and returns only the fields the preset sets:
 * - model: seeded only if the default model currently exists.
 * - tools: filtered to tools that currently exist (mirrors model-metadata seeding).
 * - knowledge: resolved to full collection attachments (composer's collection shape).
 * An empty/undefined preset returns `{}` (CS/R3 — no special empty-folder branch).
 */
export function seedFromFolderPreset(
	preset: FolderPreset | null | undefined,
	{ modelIds, toolIds, knowledgeBases, webSearchEnabled = false }: FolderSeedOptions
): FolderSeed {
	const seed: FolderSeed = {};

	if (!preset) {
		return seed;
	}

	if (preset.default_model_id && modelIds.includes(preset.default_model_id)) {
		seed.selectedModels = [preset.default_model_id];
	}

	if (Array.isArray(preset.tool_ids) && preset.tool_ids.length > 0) {
		seed.selectedToolIds = preset.tool_ids.filter(
			(id) => id !== WEB_SEARCH_TOOL_ID && toolIds.includes(id)
		);

		// The "web_search" sentinel never appears in `toolIds` (it's not a real
		// tool row) and is seeded separately, gated on the capability currently
		// being enabled -- same rule the backend enforces on write.
		if (webSearchEnabled && preset.tool_ids.includes(WEB_SEARCH_TOOL_ID)) {
			seed.webSearchEnabled = true;
		}
	}

	if (Array.isArray(preset.knowledge_ids) && preset.knowledge_ids.length > 0) {
		seed.knowledgeCollections = knowledgeBases
			.filter((k) => preset.knowledge_ids!.includes(k.id))
			.map((k) => ({ ...k, type: 'collection', status: 'processed' }));
	}

	return seed;
}
