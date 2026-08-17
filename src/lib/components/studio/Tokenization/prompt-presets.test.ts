import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { offerablePrompts, usesVariables } from './prompt-presets';

// Tokenization Studio Shell R6 — T-209.
//
// Two halves, deliberately. The RULE (which prompts may be offered) is a pure
// function, tested directly. The WIRING (a picker in the composer, absent when
// there is nothing to offer, and chat components that still do not know what
// tokenization is) is guarded at source level, because component tests cannot
// load in this repo locally at all — `@tailwindcss/postcss` is missing from the
// shared node_modules, which is pre-existing and not this task's to fix.

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const pickerSrc = read('src/lib/components/studio/Tokenization/PromptPresets.svelte');
const ruleSrc = read('src/lib/components/studio/Tokenization/prompt-presets.ts');
const chatSrc = read('src/lib/components/chat/Chat.svelte');
const inputSrc = read('src/lib/components/chat/MessageInput.svelte');
const placeholderSrc = read('src/lib/components/chat/Placeholder.svelte');
const sessionSrc = read('src/routes/(app)/studio/tokenization/session/+page.svelte');
const chatRouteSrc = read('src/routes/(app)/+page.svelte');
const promptsApiSrc = read('src/lib/apis/prompts/index.ts');

// Comments legitimately NAME what they promise not to do -- "we do not filter on
// access_control here, the server already did" is the useful part of the file.
// The requirement is that no CODE reads it, so strip comments before asserting
// absence rather than forbidding the explanation.
const codeOnly = (src: string) =>
	src
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
		.join('\n');

const p = (title: string, content: string, command = `/${title.toLowerCase()}`) => ({
	command,
	title,
	content
});

describe('R6-AC1 — the rule offers what the user may access, and only narrows it', () => {
	it('offers ordinary prompts', () => {
		const offered = offerablePrompts([p('Portrait', 'Describe a face in one paragraph.')]);
		expect(offered).toHaveLength(1);
		expect(offered[0].content).toBe('Describe a face in one paragraph.');
		expect(offered[0].command).toBe('/portrait');
	});

	it('never invents a prompt the caller did not pass', () => {
		// The whole access-control argument rests on this: the server hands us the
		// prompts this user may see, and every prompt we display came out of that
		// list. A rule that could ADD an entry would be reimplementing access
		// control by accident.
		const input = [p('B', 'b body'), p('A', 'a body'), p('C', '{{var}}')];
		const offered = offerablePrompts(input);
		for (const o of offered) {
			expect(input.some((i) => i.command === o.command && i.content === o.content)).toBe(true);
		}
		expect(offered.length).toBeLessThanOrEqual(input.length);
	});

	it('orders by title, matching the /command list', () => {
		const offered = offerablePrompts([p('Zebra', 'z'), p('Apple', 'a'), p('Mango', 'm')]);
		expect(offered.map((o) => o.title)).toEqual(['Apple', 'Mango', 'Zebra']);
	});

	it('survives an absent or failed fetch without throwing', () => {
		expect(offerablePrompts(null)).toEqual([]);
		expect(offerablePrompts(undefined)).toEqual([]);
		expect(offerablePrompts([])).toEqual([]);
		expect(offerablePrompts([null, undefined, {}])).toEqual([]);
	});
});

describe('R6-AC3 — the variables decision: unsupported here, so excluded', () => {
	it('excludes auto-substituted variables, which would vary the prompt between runs', () => {
		// The premise of the surface (Decision 8) is a FIXED prompt across models.
		// `{{CURRENT_TIME}}` resolves differently on every insertion, so the token
		// stream would differ for reasons that are not the model.
		for (const v of [
			'{{CURRENT_TIME}}',
			'{{CURRENT_DATE}}',
			'{{CURRENT_DATETIME}}',
			'{{CURRENT_WEEKDAY}}',
			'{{CURRENT_TIMEZONE}}',
			'{{USER_NAME}}',
			'{{USER_LOCATION}}',
			'{{USER_LANGUAGE}}',
			'{{CLIPBOARD}}'
		]) {
			expect(usesVariables(`Describe ${v} in detail`), `${v} must count as a variable`).toBe(true);
			expect(offerablePrompts([p('X', `Describe ${v}`)]), `${v} must not be offered`).toEqual([]);
		}
	});

	it('excludes user-filled slots, which this picker cannot fill', () => {
		expect(usesVariables('Write about {{topic}}')).toBe(true);
		expect(offerablePrompts([p('X', 'Write about {{topic}}')])).toEqual([]);
		// whitespace and multiple slots included
		expect(usesVariables('{{ a }} then {{b}}')).toBe(true);
	});

	it('keeps prompts with lookalike text that is not a slot', () => {
		expect(usesVariables('use a single brace { like this }')).toBe(false);
		expect(usesVariables('{{ unclosed')).toBe(false);
		expect(offerablePrompts([p('X', 'a { b } c')])).toHaveLength(1);
	});

	it('answers the same way twice for the same input', () => {
		// A `/g` regex carries `lastIndex` between `.test()` calls, so a shared
		// global pattern would alternate true/false on identical input. That is the
		// classic way this predicate rots, and it would present as a prompt that
		// appears in the picker every other page load.
		const text = 'Write about {{topic}}';
		expect(usesVariables(text)).toBe(true);
		expect(usesVariables(text)).toBe(true);
		expect(usesVariables(text)).toBe(true);
	});

	it('states the decision where the rule lives', () => {
		// The kit requires the decision be stated, not merely implemented.
		expect(ruleSrc).toMatch(/variables are \*\*NOT supported\*\*/i);
	});

	it('drops empty bodies, which would insert nothing', () => {
		expect(offerablePrompts([p('X', ''), p('Y', '   \n ')])).toEqual([]);
	});
});

describe('R6-AC4 — Prompts storage, API and access control are untouched', () => {
	it('the picker reads the existing endpoint and writes nothing', () => {
		expect(pickerSrc).toContain("from '$lib/apis/prompts'");
		expect(pickerSrc).toContain('getPrompts(');
		for (const mutator of ['createNewPrompt', 'updatePromptByCommand', 'deletePromptByCommand']) {
			expect(pickerSrc, `the picker must not ${mutator}`).not.toContain(mutator);
		}
	});

	it('no tokenization file re-implements access control', () => {
		// Filtering by `access_control` here would be a second, divergent copy of a
		// decision the server already made.
		expect(codeOnly(pickerSrc)).not.toContain('access_control');
		expect(codeOnly(ruleSrc)).not.toContain('access_control');
	});

	it('the Prompts API gained no new surface for this', () => {
		const exported = [...promptsApiSrc.matchAll(/export const (\w+)/g)].map((m) => m[1]).sort();
		expect(exported).toEqual([
			'createNewPrompt',
			'deletePromptByCommand',
			'getPromptByCommand',
			'getPromptList',
			'getPrompts',
			'updatePromptByCommand'
		]);
	});
});

describe('R6-AC5 — absent, not empty', () => {
	it('the picker renders nothing when there is nothing to offer', () => {
		expect(pickerSrc).toMatch(/\{#if offerable\.length > 0\}/);
	});

	it('the guarded region is the whole control, not just the list', () => {
		// A guard placed inside the dropdown would still render the trigger button,
		// which is the "empty list" outcome the criterion rejects.
		const guardAt = pickerSrc.indexOf('{#if offerable.length > 0}');
		expect(guardAt).toBeGreaterThan(-1);
		expect(pickerSrc.indexOf('<Dropdown'), 'the trigger must sit inside the guard').toBeGreaterThan(
			guardAt
		);
	});

	it('an empty list is what a failed fetch produces', () => {
		expect(pickerSrc).toMatch(/getPrompts\(localStorage\.token\)\.catch\(\(\) => \[\]\)/);
	});
});

describe('R6-AC2 — a selection lands as editable composer text', () => {
	it('the picker only hands back the body, it does not touch the input', () => {
		expect(pickerSrc).toContain('onSelect(preset.content)');
		// Reaching into the composer from here would couple a Studio component to
		// the chat DOM, and is exactly what the `insertText` capability replaces.
		expect(pickerSrc).not.toContain('getElementById');
	});

	it('insertText writes the same bound value the user types into', () => {
		// `prompt` is MessageInput's $bindable value. Writing THAT (rather than a
		// separate held field) is what makes the inserted text ordinary and
		// editable: there is nowhere for a "locked" value to live.
		expect(inputSrc).toMatch(/const insertText = async \(text: string\) => \{\s*\n\s*prompt = text;/);
	});

	it('nothing is stored, locked or made read-only by a selection', () => {
		for (const held of ['selectedPrompt', 'lockedPrompt', 'readOnly', 'readonly']) {
			expect(pickerSrc, `a preset must not become a held value (${held})`).not.toContain(held);
		}
	});
});

describe('R2-AC4 — the composer gained configuration, not knowledge', () => {
	const CHAT_COMPONENTS: [string, string][] = [
		['Chat.svelte', chatSrc],
		['MessageInput.svelte', inputSrc],
		['Placeholder.svelte', placeholderSrc]
	];

	it('no chat component learns what tokenization is', () => {
		for (const [name, src] of CHAT_COMPONENTS) {
			expect(src.toLowerCase(), `${name} must not reference tokenization`).not.toContain(
				'tokenization'
			);
			expect(src, `${name} must not import a tokenization module`).not.toContain(
				'studio/Tokenization'
			);
			expect(src, `${name} must not know about prompt presets`).not.toContain('PromptPresets');
		}
	});

	it('the accessory prop is optional and defaults to today s behaviour', () => {
		// An omitted accessory must render nothing, which is exactly what the
		// composer showed before this task.
		for (const [name, src] of CHAT_COMPONENTS) {
			expect(src, `${name} must declare the prop optional`).toMatch(/composerAccessory\?\s*:/);
			expect(src, `${name} must default it to undefined`).toMatch(
				/composerAccessory = undefined/
			);
		}
		expect(inputSrc, 'an omitted accessory must render nothing').toMatch(
			/\{@render composerAccessory\?\.\(\{ insertText \}\)\}/
		);
	});

	it('ordinary chat passes no accessory at all', () => {
		expect(chatRouteSrc).not.toContain('composerAccessory');
		expect(chatRouteSrc).not.toContain('PromptPresets');
	});

	it('the chat components declare and forward the prop without reading it', () => {
		// The same occurrence CENSUS session.test.ts runs over `modelFilter`, for
		// the same reason: there are more ways to read a value than one can
		// enumerate as forbidden syntaxes, so count where the name appears and
		// reject anything that is not a declaration, a destructuring or a forward.
		const census = (src: string, allowed: RegExp[], expected: number, name: string) => {
			const codeLines = src
				.split('\n')
				.filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'));
			const uses = codeLines.filter((l) => l.includes('composerAccessory'));
			for (const line of uses) {
				expect(
					allowed.some((re) => re.test(line)),
					`${name} reads or branches on composerAccessory here, rather than only ` +
						`declaring and forwarding it:\n  ${line.trim()}`
				).toBe(true);
			}
			expect(uses.length, `${name}: unexpected number of occurrences`).toBe(expected);
		};

		const declaration = /composerAccessory\?\s*:\s*import\('svelte'\)\.Snippet/;
		const destructure = /^\s*composerAccessory = undefined,?$/;
		const forward = /^\s*\{composerAccessory\}\s*$/;

		// Chat forwards to BOTH composers -- the message-list one and the
		// Placeholder's -- so a session that has not been sent to yet still offers
		// the picker. Hence four, not three.
		census(chatSrc, [declaration, destructure, forward], 4, 'Chat.svelte');
		census(placeholderSrc, [declaration, destructure, forward], 3, 'Placeholder.svelte');
		// MessageInput is the one component that invokes it, and invoking is all it
		// may do: no `if (composerAccessory)` branch, no inspection.
		census(
			inputSrc,
			[declaration, destructure, /^\s*\{@render composerAccessory\?\.\(\{ insertText \}\)\}$/],
			3,
			'MessageInput.svelte'
		);
	});

	it('the session owns the picker and passes it in', () => {
		expect(sessionSrc).toContain('PromptPresets');
		expect(sessionSrc).toMatch(/composerAccessory=\{promptPresets\}/);
	});
});
