import { writable, type Writable } from 'svelte/store';

// Studio resources: prompts, knowledge, tools, functions, voices
export const prompts: Writable<null | Prompt[]> = writable(null);
export const knowledge: Writable<null | Document[]> = writable(null);
export const tools = writable(null);
export const functions = writable(null);
export const voices: Writable<null | Voice[]> = writable(null);

type Voice = {
	id: string;
	user_id: string;
	name: string;
	description?: string;
	graph?: Record<string, unknown> | null;
	meta?: Record<string, unknown> | null;
	access_control?: Record<string, unknown> | null;
	created_at?: number;
	updated_at?: number;
	files?: Record<string, unknown>[];
	user?: Record<string, unknown>;
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
