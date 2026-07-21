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

export type PromptSuggestion = {
	content: string;
	title: [string, string];
};
