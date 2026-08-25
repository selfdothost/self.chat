import { APP_NAME } from '$lib/constants';
import { type Writable, writable } from 'svelte/store';

// Backend / app-level config
export const WEBUI_NAME = writable(APP_NAME);
export const config: Writable<Config | undefined> = writable(undefined);

export type Config = {
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
		enable_deep_research?: boolean;
		enable_web_crawl?: boolean;
		// self.chat#54 / self.ai#142. NOT a bare mirror of
		// ENABLE_IMAGE_INPUT_DESCRIBER: the server publishes it as that flag AND a
		// non-empty IMAGE_INPUT_DESCRIBER_MODEL, so an enabled-but-unconfigured
		// instance reads as false here and never offers the toggle. Consume it as
		// given — re-deriving the model half client-side is how the two drift.
		enable_image_input_describer?: boolean;
		enable_websocket?: boolean;
		enable_ldap?: boolean;
		enable_curator?: boolean;
		enable_message_rating?: boolean;
		enable_channels?: boolean;
		// Optional like its siblings above: the backend only includes it for an
		// authenticated user (api/selfai_ui/main.py's `if user is not None`
		// block), so it is genuinely absent from an anonymous /api/config.
		// Consumers already guard with `!$config?.features?.enable_piston_execution`,
		// which reads a missing flag as "no sandbox" — the safe default.
		enable_piston_execution?: boolean;
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

export type PromptSuggestion = {
	content: string;
	title: [string, string];
};
