import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Tokenization Studio Shell R2-AC2 — T-201.
//
// A tokenization session must not appear in the chat sidebar, and an ordinary
// chat must not appear in a session's history. The server side is self.ai's
// `chat.kind` column, its list filters and its allowlist (!443, !448); this is
// the client half that actually declares a kind.
//
// The failure mode if this is missing is SILENT and was nearly shipped: the
// column, the model parameter and the filters all existed while `ChatForm`
// carried only `chat`, so every session persisted as ordinary chat and would
// have appeared in the sidebar with nothing erroring.

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const apiSrc = read('src/lib/apis/chats/index.ts');
const chatSrc = read('src/lib/components/chat/Chat.svelte');
const sessionSrc = read('src/routes/(app)/studio/tokenization/session/+page.svelte');
const chatRouteSrc = read('src/routes/(app)/+page.svelte');

const codeOnly = (src: string) =>
	src
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
		.join('\n');

describe('T-201 — the session declares which surface owns it', () => {
	it('the session passes a kind', () => {
		expect(sessionSrc).toMatch(/sessionKind="tokenization"/);
	});

	it('the create API can carry a kind', () => {
		expect(apiSrc).toMatch(/createNewChat = async \(token: string, chat: object, kind\?: string\)/);
	});

	it('an omitted kind sends the body chat has always sent (R2-AC4)', () => {
		// Spread-when-truthy, not `kind: kind`. A null would be a NEW field in
		// every chat request; omission keeps the ordinary path byte-identical.
		const code = codeOnly(apiSrc);
		expect(code).toMatch(/\.\.\.\(kind \? \{ kind \} : \{\}\)/);
		expect(code).not.toMatch(/kind:\s*kind\b/);
		expect(code).not.toMatch(/kind:\s*kind\s*\?\?\s*null/);
	});

	it('ordinary chat declares no kind', () => {
		expect(chatRouteSrc).not.toContain('sessionKind');
	});

	it('the kind is sent as an argument, not buried in the chat blob', () => {
		// `kind` is a COLUMN the server filters lists on. Inside the JSON blob it
		// would be somewhere no query can reach — the chat would persist, look
		// right, and still show up in the sidebar.
		const call = chatSrc.slice(
			chatSrc.indexOf('createNewChat(localStorage.token, {'),
			chatSrc.indexOf('sessionKind);') + 'sessionKind);'.length
		);
		expect(call).toContain('sessionKind);');
		expect(call).not.toMatch(/^\s*kind:/m);
	});

	it('Chat forwards the kind without reading it', () => {
		// Same census discipline as the other props: declaration, destructuring
		// and the forward. Chat must not branch on which surface it is serving.
		const codeLines = chatSrc
			.split('\n')
			.filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'));
		const uses = codeLines.filter((l) => l.includes('sessionKind'));
		const allowed = [
			/sessionKind\?\s*:\s*string;/,
			/^\s*sessionKind = undefined,?$/,
			/^\s*sessionKind\);$/
		];
		for (const line of uses) {
			expect(
				allowed.some((re) => re.test(line)),
				`Chat.svelte reads or branches on sessionKind rather than forwarding it:\n  ${line.trim()}`
			).toBe(true);
		}
		expect(uses.length).toBe(3);
	});

	it('no chat component learns what the kind means', () => {
		expect(chatSrc.toLowerCase()).not.toContain('tokenization');
	});
});
