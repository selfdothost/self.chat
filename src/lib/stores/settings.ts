import { writable, type Writable } from 'svelte/store';

// User settings + theme
export const theme = writable('system');
export const settings: Writable<Settings> = writable({});

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
