import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Tokenization Studio Shell R2 — T-204.
//
// The session renders the SAME Chat component the chat route does, configured by
// an optional predicate, rather than a copy of its 2207 lines. These guards
// exist because that decision is only safe while two properties hold: the chat
// path is behaviourally unchanged, and the chat components never learn what
// tokenization is. Both are easy to erode with a well-meant edit, and neither
// shows up as a failing feature test.
//
// R2-AC4 as amended (see the kit): additive optional configuration is allowed;
// tokenization concepts inside chat components are not.

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const chatSrc = read('src/lib/components/chat/Chat.svelte');
const navbarSrc = read('src/lib/components/chat/Navbar.svelte');
const selectorSrc = read('src/lib/components/chat/ModelSelector.svelte');
const sessionSrc = read('src/routes/(app)/studio/tokenization/session/+page.svelte');
const chatRouteSrc = read('src/routes/(app)/+page.svelte');

const CHAT_COMPONENTS: [string, string][] = [
	['Chat.svelte', chatSrc],
	['Navbar.svelte', navbarSrc],
	['ModelSelector.svelte', selectorSrc]
];

describe('T-204 — the session reuses Chat rather than duplicating it', () => {
	it('renders the real Chat component', () => {
		expect(sessionSrc).toContain("from '$lib/components/chat/Chat.svelte'");
		expect(sessionSrc).toMatch(/<Chat\b/);
	});

	it('owns the model rule itself and passes it in', () => {
		expect(sessionSrc).toContain('isTokenizationSelectable');
		expect(sessionSrc).toMatch(/modelFilter/);
	});
});

describe('T-204 — chat carries none of tokenization (R2-AC4, amended)', () => {
	it('no chat component knows what tokenization is', () => {
		for (const [name, src] of CHAT_COMPONENTS) {
			expect(src.toLowerCase(), `${name} must not reference tokenization`).not.toContain(
				'tokenization'
			);
			expect(src, `${name} must not import the tokenization rule`).not.toContain(
				'Tokenization/selectable'
			);
		}
	});

	it('the chat route is untouched by this work', () => {
		// The ordinary chat page renders Chat with no configuration at all. If a
		// tokenization concern ever needs to appear here, it has leaked.
		expect(chatRouteSrc).not.toContain('modelFilter');
		expect(chatRouteSrc.toLowerCase()).not.toContain('tokenization');
	});

	it('every added prop is optional and defaults to prior behaviour', () => {
		// The whole safety argument: an omitted filter must mean "every model",
		// which is exactly what these components showed before.
		expect(chatSrc).toMatch(/modelFilter\?\s*:/);
		expect(navbarSrc).toMatch(/modelFilter\?\s*:/);
		expect(selectorSrc).toMatch(/modelFilter\?\s*:/);
		expect(selectorSrc, 'ModelSelector must default to admitting every model').toMatch(
			/modelFilter\s*=\s*\(\)\s*=>\s*true/
		);
	});

	it('Chat forwards the predicate without reading it', () => {
		// Chat must not branch on the filter. Forwarding is fine; interpreting it
		// would be Chat learning a caller's semantics.
		//
		// An occurrence CENSUS rather than a list of forbidden syntaxes. The first
		// version of this test banned `modelFilter(` and `if (modelFilter`, and a
		// mutation adding `const isNarrowed = modelFilter ? true : false` sailed
		// through it -- there are more ways to read a value than one can enumerate,
		// so this counts where it appears instead and rejects anything else.
		const codeLines = chatSrc
			.split('\n')
			.filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'));

		const uses = codeLines.filter((l) => l.includes('modelFilter'));
		const allowed = [
			/modelFilter\?\s*:\s*\(model/, // the Props declaration
			// destructuring, in either formatting: prettier splits the $props()
			// block across lines once it grows past one prop, so the entry may sit
			// on its own line. Matching only the single-line form made this guard
			// fail the moment a SECOND prop was added -- a false positive on a
			// purely cosmetic change.
			/^\s*let \{[^}]*modelFilter = undefined[^}]*\}: Props = \$props\(\);/,
			/^\s*modelFilter = undefined,?$/,
			/^\s*\{modelFilter\}\s*$/ // forwarded to Navbar, verbatim
		];

		for (const line of uses) {
			expect(
				allowed.some((re) => re.test(line)),
				`Chat.svelte reads or branches on modelFilter here, rather than only ` +
					`declaring and forwarding it:\n  ${line.trim()}`
			).toBe(true);
		}
		expect(uses.length, 'expected exactly declaration, destructuring and forward').toBe(3);
	});

	it('the params bag is exposed, not reinterpreted (T-210)', () => {
		// T-210 needs to SHOW the sampler the rail is sending, which means reading
		// Chat's advanced-params bag. That bag was already Chat's own state and is
		// already bound down into the rail, so exposing it upward teaches Chat
		// nothing -- it is the one prop here that Chat legitimately reads, which is
		// why it gets these guards instead of an occurrence census.
		expect(chatSrc).toMatch(/params\?\s*:\s*Record<string, any>;/);
		expect(chatSrc, 'params must be bindable so the rail edits reach the host').toMatch(
			/^\s*params = \$bindable\(\{\}\),?$/m
		);
		// The default must be the exact initial value it held as local state, or
		// unbound chat starts from something it did not start from before.
		expect(chatSrc, 'the local $state declaration must be replaced, not duplicated').not.toMatch(
			/let params(:[^=]*)? = \$state\(/
		);
		// And the rail must still be bound to it, or the display would show a bag
		// nothing writes.
		expect(chatSrc).toMatch(/bind:params/);
	});

	it('ordinary chat binds nothing, so it keeps the old default', () => {
		expect(chatRouteSrc).not.toContain('bind:params');
		expect(chatRouteSrc).not.toContain('params');
	});

	it('Chat was configured, not forked', () => {
		// A copy would show up as a second orchestrator. There must be exactly one
		// component importing the chat message pipeline.
		expect(sessionSrc).not.toContain('createOpenAITextStream');
		// A SIZE bound, not a style rule, and not the guarantee: the assertion
		// above is what actually rejects a second orchestrator. What this one
		// guards against is a copy of Chat.svelte's 2207 lines of orchestration
		// creeping in a few at a time.
		//
		// Raised 60 -> 100 as T-208, T-209 and T-210 each added configuration and
		// the reasoning for it. That reasoning IS the deliverable in those tasks,
		// so trading it away to sit under an arbitrary number would be the wrong
		// trade. 100 is still an order of magnitude below a fork, which is the
		// only signal this line is here to give.
		//
		// Move it again for CONFIGURATION. Never to make room for logic -- logic
		// on this page is the thing that would make it a second orchestrator.
		expect(sessionSrc.split('\n').length).toBeLessThan(100);
	});
});
