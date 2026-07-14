// Shared shape for Svelte `export let` callback props whose exact call
// signature genuinely varies by call site (onClose(), onSubmit(payload),
// saveHandler(id, value), ...). Centralizing the two `any` usages here —
// instead of repeating `(...args: any[]) => any` at ~130 prop declarations —
// keeps @typescript-eslint/no-explicit-any's one legitimate escape hatch in
// a single, documented place rather than scattered eslint-disable comments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- callback prop signature intentionally unconstrained, see comment above
export type AnyFn = (...args: any[]) => any;

export type Banner = {
	id: string;
	type: string;
	title?: string;
	content: string;
	url?: string;
	dismissible?: boolean;
	timestamp: number;
};

export enum TTS_RESPONSE_SPLIT {
	PUNCTUATION = 'punctuation',
	PARAGRAPHS = 'paragraphs',
	NONE = 'none'
}
