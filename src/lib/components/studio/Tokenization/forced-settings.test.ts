import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_TOP_LOGPROBS, tokenizationRequestExtras } from './constants';

// Tokenization Studio Shell R3 — T-205.
//
// The load-bearing requirement is R3-AC1/AC2: the stream must ignore
// `splitLargeChunks`, and the user's STORED preference must survive the visit.
// `streamLargeDeltasAsRandomChunks` re-chops content into random 1-3 character
// pieces for a typewriter effect — in chat a preference, here it would destroy
// every token boundary Phase 3 depends on.

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const chatSrc = read('src/lib/components/chat/Chat.svelte');
const sessionSrc = read('src/routes/(app)/studio/tokenization/session/+page.svelte');
const chatRouteSrc = read('src/routes/(app)/+page.svelte');

// Comments legitimately NAME the setting being forced -- explaining why
// `splitLargeChunks` must not reach this stream is the useful part of the file.
// The requirement is that no CODE writes it, so strip comments before asserting
// absence, rather than forbidding the explanation.
const codeOnly = (src: string) =>
	src
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
		.join('\n');

const sessionCode = codeOnly(sessionSrc);

describe('R3 — request fields', () => {
	it('a session request carries logprobs and top_logprobs (R3-AC3)', () => {
		const extras = tokenizationRequestExtras();
		expect(extras.logprobs).toBe(true);
		expect(extras).toHaveProperty('top_logprobs');
	});

	it('the default lives in exactly one place (R3-AC4)', () => {
		expect(tokenizationRequestExtras().top_logprobs).toBe(DEFAULT_TOP_LOGPROBS);
		// No call site may restate the field names or the number.
		expect(sessionSrc).not.toMatch(/top_logprobs\s*:/);
		expect(sessionSrc).not.toMatch(/logprobs\s*:\s*true/);
		expect(sessionSrc).toContain('DEFAULT_TOP_LOGPROBS');
	});

	it('the per-session value overrides the default (R3-AC4)', () => {
		expect(tokenizationRequestExtras(5).top_logprobs).toBe(5);
		// still asks for the distributions at any depth, including zero
		expect(tokenizationRequestExtras(0).logprobs).toBe(true);
	});

	it('defaults to streaming no alternatives, per the Phase 1 measurement', () => {
		// 968 bytes/token at top_logprobs=10 vs ~110 KiB/1000 tokens at 0;
		// alternatives are 92% of payload and Phase 3 fetches them on click.
		expect(DEFAULT_TOP_LOGPROBS).toBe(0);
	});
});

describe('R3-AC1/AC2/AC6 — the stream is forced, and the preference is not touched', () => {
	it('the session forces re-chunking off (R3-AC1, R3-AC6)', () => {
		expect(sessionSrc).toMatch(/splitLargeDeltas=\{false\}/);
	});

	it('the session never writes the stored preference (R3-AC2)', () => {
		// An override, not a setter. Anything that assigns to settings here would
		// leak this surface's needs into the user's own chat experience.
		expect(sessionCode).not.toContain('settings.set');
		expect(sessionCode).not.toContain('splitLargeChunks');
	});

	it('Chat prefers the override but still falls back to the setting', () => {
		// The fallback is what makes ordinary chat behaviourally unchanged: an
		// omitted override must read exactly what it read before.
		expect(chatSrc).toMatch(/splitLargeDeltas\s*\?\?\s*\$settings\.splitLargeChunks/);
	});

	it('ordinary chat passes no override at all', () => {
		expect(chatRouteSrc).not.toContain('splitLargeDeltas');
		expect(chatRouteSrc).not.toContain('requestExtras');
	});
});

describe('R2-AC4 — the extras cannot rewrite the request', () => {
	it('requestExtras is spread before every field Chat sets', () => {
		// A caller may ADD parameters; it must not be able to swap the model,
		// messages, stream flag or chat identifiers out from under the component.
		const bodyStart = chatSrc.indexOf('...(requestExtras ?? {})');
		expect(bodyStart, 'requestExtras spread not found').toBeGreaterThan(-1);
		for (const field of ['stream: stream', 'model: model.id', 'messages: messages', 'chat_id:']) {
			expect(
				chatSrc.indexOf(field, bodyStart),
				`${field} must be set AFTER the extras spread so it always wins`
			).toBeGreaterThan(bodyStart);
		}
	});

	it('Chat forwards the extras without inspecting them', () => {
		const codeLines = chatSrc
			.split('\n')
			.filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'));
		const uses = codeLines.filter((l) => l.includes('requestExtras'));
		const allowed = [
			/requestExtras\?\s*:\s*Record/, // declaration
			// destructuring, with the trailing comma OPTIONAL.
			//
			// Whether this entry ends the $props() block is decided by whichever
			// prop happens to be added last, so pinning the comma made the guard
			// fail on a purely cosmetic change. THREE separate pieces of work hit
			// this independently (T-208, T-209, T-210), which makes it a flaw in
			// how the census was written rather than bad luck: a guard that fires
			// on formatting trains people to edit guards.
			//
			// What the census actually protects is unchanged -- the prop may be
			// declared, destructured and forwarded, and read nowhere.
			/^\s*requestExtras = undefined,?$/,
			/^\s*\.\.\.\(requestExtras \?\? \{\}\),$/ // the spread
		];
		for (const line of uses) {
			expect(
				allowed.some((re) => re.test(line)),
				`Chat.svelte reads requestExtras rather than only forwarding it:\n  ${line.trim()}`
			).toBe(true);
		}
		expect(uses.length).toBe(3);
	});
});
