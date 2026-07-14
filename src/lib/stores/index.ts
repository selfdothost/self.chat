import { APP_NAME } from '$lib/constants';
import { type Writable, writable } from 'svelte/store';
import type { ModelConfig } from '$lib/apis';
import type { Banner } from '$lib/types';
import type { Socket } from 'socket.io-client';

import emojiShortCodes from '$lib/emoji-shortcodes.json';

// Backend
export const WEBUI_NAME = writable(APP_NAME);
export const config: Writable<Config | undefined> = writable(undefined);
export const user: Writable<SessionUser | undefined> = writable(undefined);

// Frontend
export const MODEL_DOWNLOAD_POOL = writable({});

export const mobile = writable(false);

export const socket: Writable<null | Socket> = writable(null);
export const activeUserIds: Writable<null | string[]> = writable(null);
export const USAGE_POOL: Writable<null | string[]> = writable(null);

export const theme = writable('system');

export const shortCodesToEmojis = writable(
	Object.entries(emojiShortCodes).reduce((acc, [key, value]) => {
		if (typeof value === 'string') {
			acc[value] = key;
		} else {
			for (const v of value) {
				acc[v] = key;
			}
		}

		return acc;
	}, {})
);

export const chatId = writable('');
export const chatTitle = writable('');

export const channels = writable([]);
export const chats = writable([]);
export const pinnedChats = writable([]);
export const tags = writable([]);

export const models: Writable<Model[]> = writable([]);

export const prompts: Writable<null | Prompt[]> = writable(null);
export const knowledge: Writable<null | Document[]> = writable(null);
export const tools = writable(null);
export const functions = writable(null);

export const banners: Writable<Banner[]> = writable([]);

// Maps model IDs to load status: "loaded", "loading", or "unloaded"
export const modelLoadStatus: Writable<Record<string, string>> = writable({});

export const settings: Writable<Settings> = writable({});

export const showSidebar = writable(false);
export const showSettings = writable(false);
export const showArchivedChats = writable(false);
export const showChangelog = writable(false);

export const showControls = writable(false);
export const showOverview = writable(false);
export const showArtifacts = writable(false);
export const showCallOverlay = writable(false);

export const temporaryChatEnabled = writable(false);
export const scrollPaginationEnabled = writable(false);
export const currentChatPage = writable(1);

export const isLastActiveTab = writable(true);
export const playingNotificationSound = writable(false);

export type Model = OpenAIModel | OllamaModel | ArenaModel | LlamolotlModel;

type BaseModel = {
	id: string;
	name: string;
	info?: ModelConfig;
	owned_by: 'ollama' | 'openai' | 'arena' | 'llamolotl';
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

type Settings = {
	models?: string[];
	conversationMode?: boolean;
	speechAutoSend?: boolean;
	responseAutoPlayback?: boolean;
	audio?: AudioSettings;
	showUsername?: boolean;
	notificationEnabled?: boolean;
	title?: TitleSettings;
	splitLargeDeltas?: boolean;
	// Only non-optional field in this type, but the store is initialized
	// `writable({})` before settings load -- optional like everything else.
	chatDirection?: 'LTR' | 'RTL';

	system?: string;
	requestFormat?: string;
	keepAlive?: string;
	seed?: number;
	temperature?: string;
	repeat_penalty?: string;
	top_k?: string;
	top_p?: string;
	num_ctx?: string;
	num_batch?: string;
	num_keep?: string;
	options?: ModelOptions;

	autoTags?: boolean;
	backgroundImageUrl?: string;
	chatBubble?: boolean;
	hapticFeedback?: boolean;
	imageCompression?: boolean;
	imageCompressionSize?: { width?: string; height?: string };
	landingPageMode?: string;
	largeTextAsFile?: boolean;
	memory?: boolean;
	notificationSound?: boolean;
	notifications?: { webhook_url?: string };
	// Spread directly into request payloads alongside per-request overrides --
	// genuinely an open bag of advanced-params fields, not a fixed shape.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	params?: Record<string, any>;
	responseAutoCopy?: boolean;
	richTextInput?: boolean;
	scrollOnBranchChange?: boolean;
	showChangelog?: boolean;
	showEmojiInCall?: boolean;
	splitLargeChunks?: boolean;
	userLocation?: boolean;
	version?: string;
	voiceInterruption?: boolean;
	widescreenMode?: boolean;
};

type ModelOptions = {
	stop?: boolean;
};

type AudioSettings = {
	STTEngine?: string;
	TTSEngine?: string;
	speaker?: string;
	model?: string;
	nonLocalVoices?: boolean;
	tts?: {
		voice?: string;
		defaultVoice?: string;
		playbackRate?: number;
		nonLocalVoices?: boolean;
	};
	stt?: { engine?: string };
};

type TitleSettings = {
	auto?: boolean;
	model?: string;
	modelExternal?: string;
	prompt?: string;
};

type Prompt = {
	command: string;
	user_id: string;
	title: string;
	content: string;
	timestamp: number;
};

type Document = {
	id?: string;
	collection_name: string;
	filename: string;
	name: string;
	title: string;
	description?: string;
	legacy?: boolean;
	meta?: { document?: boolean; tags?: { name: string }[]; name?: string };
	files?: Record<string, unknown>[];
};

type Config = {
	status: boolean;
	name: string;
	version: string;
	default_locale: string;
	default_models: string;
	default_prompt_suggestions: PromptSuggestion[];
	features: {
		auth: boolean;
		auth_trusted_header: boolean;
		enable_api_key: boolean;
		enable_signup: boolean;
		enable_login_form: boolean;
		enable_web_search?: boolean;
		enable_websocket?: boolean;
		enable_ldap?: boolean;
		enable_curator?: boolean;
		enable_message_rating?: boolean;
		enable_channels?: boolean;
		enable_google_drive_integration: boolean;
		enable_image_generation: boolean;
		enable_admin_export: boolean;
		enable_admin_chat_access: boolean;
		enable_community_sharing: boolean;
	};
	oauth: {
		providers: {
			[key: string]: string;
		};
	};
	audio?: {
		stt?: { engine?: string };
		tts?: { engine?: string; voice?: string; split_on?: string };
	};
	file?: { max_size?: number; max_count?: number };
	onboarding?: boolean;
};

type PromptSuggestion = {
	content: string;
	title: [string, string];
};

type SessionUser = {
	id: string;
	email: string;
	name: string;
	role: string;
	profile_image_url: string;
	token?: string;
	// Spans multiple independent namespaces (chat.*, model.*, workspace.*) --
	// genuinely an open permission bag, not a fixed shape.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	permissions?: Record<string, any>;
};
