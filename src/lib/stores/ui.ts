import { type Writable, writable } from 'svelte/store';
import type { Banner } from '$lib/types';

import emojiShortCodes from '$lib/emoji-shortcodes.json';

// General UI visibility / layout state
export const mobile = writable(false);

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

export const banners: Writable<Banner[]> = writable([]);

export const showSidebar = writable(false);
export const showSettings = writable(false);
export const showArchivedChats = writable(false);
export const showChangelog = writable(false);

export const showControls = writable(false);
export const showOverview = writable(false);
export const showArtifacts = writable(false);
export const showCallOverlay = writable(false);

export const isLastActiveTab = writable(true);
export const playingNotificationSound = writable(false);
