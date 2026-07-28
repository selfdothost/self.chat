import { writable, type Writable } from 'svelte/store';
import type { ModelConfig } from '$lib/apis';

// Model catalog / download state
export const MODEL_DOWNLOAD_POOL = writable({});
export const models: Writable<Model[]> = writable([]);

// Maps model IDs to load status: "loaded", "loading", or "unloaded"
export const modelLoadStatus: Writable<Record<string, string>> = writable({});

export type Model = OpenAIModel | OllamaModel | ArenaModel | LlamolotlModel | AnthropicModel;

type BaseModel = {
	id: string;
	name: string;
	info?: ModelConfig;
	owned_by: 'ollama' | 'openai' | 'arena' | 'llamolotl' | 'anthropic';
	// Client-side-only flags used to exclude local/preset or arena pseudo-model
	// entries when picking a real base model (never sent by the backend on the
	// wire; set/read only in this frontend).
	preset?: boolean;
	arena?: boolean;
};

// Arena models (model-vs-model comparison entries) are filtered out of most
// model pickers via `owned_by !== 'arena'` (Leaderboard.svelte, ModelEditor.svelte,
// Permissions.svelte, ArenaModelModal.svelte) — a real, used category, not a typo.
export interface ArenaModel extends BaseModel {
	owned_by: 'arena';
	meta?: {
		profile_image_url?: string;
		description?: string;
		model_ids?: string[];
		filter_mode?: string;
		access_control?: object;
	};
}

// self.llamolotl-backed models — served through llamolotl's connection type
// (distinct from a generic OpenAI-compatible connection; see
// AddConnectionModal.svelte's separate `llamolotl` connection flag).
export interface LlamolotlModel extends BaseModel {
	owned_by: 'llamolotl';
	external?: boolean;
	source?: string;
}

// Anthropic Messages API models. Not an OpenAI-compatible connection: the backend
// router owns the payload/response conversion, so by the time a model reaches this
// store it is already OpenAI-shaped (self.ai#59).
export interface AnthropicModel extends BaseModel {
	owned_by: 'anthropic';
	external?: boolean;
	source?: string;
}

export interface OpenAIModel extends BaseModel {
	owned_by: 'openai';
	external: boolean;
	source?: string;
}

export interface OllamaModel extends BaseModel {
	owned_by: 'ollama';
	details: OllamaModelDetails;
	size: number;
	description: string;
	model: string;
	modified_at: string;
	digest: string;
	ollama?: {
		name?: string;
		model?: string;
		modified_at: string;
		size?: number;
		digest?: string;
		details?: {
			parent_model?: string;
			format?: string;
			family?: string;
			families?: string[];
			parameter_size?: string;
			quantization_level?: string;
		};
		urls?: number[];
	};
}

type OllamaModelDetails = {
	parent_model: string;
	format: string;
	family: string;
	families: string[] | null;
	parameter_size: string;
	quantization_level: string;
};
