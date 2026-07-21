import { writable, type Writable } from 'svelte/store';

// Workspace resources: prompts, knowledge, tools, functions
export const prompts: Writable<null | Prompt[]> = writable(null);
export const knowledge: Writable<null | Document[]> = writable(null);
export const tools = writable(null);
export const functions = writable(null);

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
