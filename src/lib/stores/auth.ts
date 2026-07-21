import { type Writable, writable } from 'svelte/store';

// Session / auth
export const user: Writable<SessionUser | undefined> = writable(undefined);

export type SessionUser = {
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
