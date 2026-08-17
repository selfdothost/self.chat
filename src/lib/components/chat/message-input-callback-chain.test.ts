import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// self.chat#31, dispatcher batch 4 (the MessageInput cluster): MessageInput,
// Commands, Commands/Knowledge and Commands/Models.
//
// Same reasoning as the Markdown batch's guards. The payload crosses three
// links, each link reshapes it, and a stale listener at any of them still
// compiles and still renders -- the `#knowledge` and `@model` command pickers
// would simply stop doing anything. Mounting the chain means mounting the whole
// chat composer, so the wiring is pinned in source instead.
//
// THE SHAPES, which are not uniform and are the actual contract:
//   Knowledge.onSelect(item)        -- the whole knowledge item, spread into `files`
//   Knowledge.onUrl(url)            -- a bare STRING
//   Knowledge.onYoutube(url)        -- a bare STRING
//   Commands.onUpload({ type, data })  -- wraps those URLs as 'web' / 'youtube'
//   Commands.onSelect()             -- NO ARGUMENT, after a knowledge pick
//   Commands.onSelect({ type: 'model', data })  -- after a model pick
//   MessageInput.onSubmit(prompt)   -- a bare STRING
//
// That dual-arity `onSelect` is the trap: MessageInput branches on
// `data?.type === 'model'`, so making the argument mandatory, or always passing
// an object, changes behaviour while still type-checking.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const INPUT = read('src/lib/components/chat/MessageInput.svelte');
const COMMANDS = read('src/lib/components/chat/MessageInput/Commands.svelte');
const KNOWLEDGE = read('src/lib/components/chat/MessageInput/Commands/Knowledge.svelte');
const MODELS = read('src/lib/components/chat/MessageInput/Commands/Models.svelte');
const CHAT = read('src/lib/components/chat/Chat.svelte');
const PLACEHOLDER = read('src/lib/components/chat/Placeholder.svelte');

const CLUSTER = { INPUT, COMMANDS, KNOWLEDGE, MODELS };

describe('the MessageInput cluster is off createEventDispatcher', () => {
	it('declares no dispatcher in any of the four', () => {
		for (const [name, src] of Object.entries(CLUSTER)) {
			expect(src, name).not.toMatch(/createEventDispatcher/);
			expect(src, name).not.toMatch(/[^a-zA-Z]dispatch\(/);
		}
	});

	it('leaves no legacy listener on any of them', () => {
		for (const [name, src] of Object.entries({ ...CLUSTER, CHAT, PLACEHOLDER })) {
			expect(src, name).not.toMatch(/on:(upload|youtube|url)=/);
		}
		// `on:submit` must be gone from the two consumers of this component. It is
		// not asserted globally: a native <form on:submit> elsewhere is unrelated.
		expect(CHAT).not.toMatch(/on:submit=/);
		expect(PLACEHOLDER).not.toMatch(/on:submit=/);
	});
});

describe('the leaf pickers emit their documented payloads', () => {
	it('Knowledge emits the item for select and bare URL strings for url/youtube', () => {
		expect(KNOWLEDGE).toMatch(/onSelect\(item\)/);
		expect(KNOWLEDGE).toMatch(/onUrl\(url\)/);
		expect(KNOWLEDGE).toMatch(/onYoutube\(url\)/);
	});

	it('Models emits the whole model object', () => {
		expect(MODELS).toMatch(/onSelect\(model\)/);
	});
});

describe('Commands reshapes each payload for MessageInput', () => {
	it('wraps a knowledge URL as web and a youtube URL as youtube', () => {
		expect(COMMANDS).toMatch(/onYoutube=\{\(url\)[\s\S]{0,160}?type:\s*'youtube'/);
		expect(COMMANDS).toMatch(/onUrl=\{\(url\)[\s\S]{0,160}?type:\s*'web'/);
	});

	it('calls onSelect with NO argument after a knowledge pick', () => {
		// MessageInput reads `data?.type`; passing an object here would make it
		// look like a model selection.
		expect(COMMANDS).toMatch(/onSelect\(\);/);
	});

	it("calls onSelect with { type: 'model', data } after a model pick", () => {
		expect(COMMANDS).toMatch(/onSelect\(\{[\s\S]{0,80}?type:\s*'model'[\s\S]{0,60}?data:\s*model/);
	});
});

describe('MessageInput and its two consumers agree', () => {
	it('MessageInput emits the prompt string and forwards the upload detail', () => {
		expect(INPUT).toMatch(/onSubmit\(prompt\)/);
		expect(INPUT).toMatch(/onUpload\(detail\)/);
		// the model branch survives the conversion
		expect(INPUT).toMatch(/data\?\.type === 'model'/);
	});

	it('Chat destructures the upload detail and takes the prompt directly', () => {
		expect(CHAT).toMatch(/onUpload=\{async \(\{ type, data \}\)/);
		expect(CHAT).toMatch(/onSubmit=\{async \(detail\)/);
	});

	it('Placeholder forwards its own callbacks straight through', () => {
		expect(PLACEHOLDER).toMatch(/\{onUpload\}/);
		expect(PLACEHOLDER).toMatch(/\{onSubmit\}/);
	});
});
