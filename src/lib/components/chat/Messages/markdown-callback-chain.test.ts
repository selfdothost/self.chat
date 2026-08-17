import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// self.chat#31, dispatcher batch 3 (the Markdown cluster). CodeBlock,
// MarkdownTokens, Markdown, ContentRenderer and ResponseMessage moved from
// createEventDispatcher to callback props.
//
// WHY SOURCE GUARDS RATHER THAN A RENDER TEST. The payload travels a four-link
// chain -- CodeBlock -> MarkdownTokens -> Markdown -> ContentRenderer -> the
// message -- and each link is a separate forwarding site. Mounting the whole
// chain means mounting CodeBlock, which drags in mermaid, KaTeX and the code
// editor; that is a large, slow, flaky surface for what is really an assertion
// about wiring. Before writing these, severing MarkdownTokens' `onSave`
// forwarding was verified to break NOTHING in the existing 208-test suite, so
// the alternative to these guards is not a better test -- it is no test.
//
// What the chain must preserve, and what a silent break looks like:
//   * CodeBlock emits `onSave(code)` -- a bare string
//   * MarkdownTokens turns that into `onUpdate({ raw, oldContent, newContent })`
//   * Markdown and ContentRenderer forward `onUpdate`/`onCode` UNCHANGED
//   * ResponseMessage consumes `{ raw, oldContent, newContent }` to rewrite the
//     stored message content
// A stale listener at any link still compiles and still renders -- editing a
// code block in a reply just silently stops persisting.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const CODE_BLOCK = read('src/lib/components/chat/Messages/CodeBlock.svelte');
const TOKENS = read('src/lib/components/chat/Messages/Markdown/MarkdownTokens.svelte');
const MARKDOWN = read('src/lib/components/chat/Messages/Markdown.svelte');
const RENDERER = read('src/lib/components/chat/Messages/ContentRenderer.svelte');
const RESPONSE = read('src/lib/components/chat/Messages/ResponseMessage.svelte');

const ALL = { CODE_BLOCK, TOKENS, MARKDOWN, RENDERER, RESPONSE };

describe('the Markdown cluster is off createEventDispatcher', () => {
	it('declares no dispatcher in any of the five', () => {
		for (const [name, src] of Object.entries(ALL)) {
			expect(src, name).not.toMatch(/createEventDispatcher/);
			// the bare word appears in prose; this matches a real call
			expect(src, name).not.toMatch(/[^a-zA-Z]dispatch\(/);
		}
	});

	it('leaves no legacy on:save / on:code / on:update listener behind', () => {
		for (const [name, src] of Object.entries(ALL)) {
			expect(src, name).not.toMatch(/on:(save|code|update)=/);
		}
	});
});

describe('the callback chain is wired end to end', () => {
	it('CodeBlock emits onSave and onCode', () => {
		expect(CODE_BLOCK).toMatch(/onSave\s*=\s*\(\)\s*=>\s*\{\}/);
		expect(CODE_BLOCK).toMatch(/onSave\(code\)/);
		expect(CODE_BLOCK).toMatch(/onCode\(\{\s*lang,\s*code\s*\}\)/);
	});

	it('MarkdownTokens maps CodeBlock onSave to the { raw, oldContent, newContent } edit shape', () => {
		// The shape is the contract ResponseMessage destructures; flattening it or
		// renaming a field compiles and silently stops the edit from persisting.
		expect(TOKENS).toMatch(/onSave=\{\(newContent\)/);
		expect(TOKENS).toMatch(/onUpdate\(\{[\s\S]{0,120}?raw:\s*token\.raw/);
		expect(TOKENS).toMatch(/oldContent:\s*token\.text/);
		expect(TOKENS).toMatch(/newContent/);
	});

	it('Markdown and ContentRenderer forward onUpdate/onCode without reshaping', () => {
		expect(MARKDOWN).toMatch(/\{onUpdate\}/);
		expect(MARKDOWN).toMatch(/\{onCode\}/);
		expect(RENDERER).toMatch(/\{onUpdate\}/);
		// ContentRenderer keeps its own onCode behaviour (the artifacts panel),
		// so it destructures the detail rather than forwarding it blindly.
		expect(RENDERER).toMatch(/onCode=\{\(detail\)/);
	});

	it('ResponseMessage consumes the edit shape from ContentRenderer', () => {
		expect(RESPONSE).toMatch(/onUpdate=\{\(\{\s*raw,\s*oldContent,\s*newContent\s*\}\)/);
	});
});

describe('the $effect emit in CodeBlock keeps its original dependency set', () => {
	it('reads the callback untracked so an inline arrow cannot re-fire it', () => {
		// The dispatcher this replaced was a stable const, so the effect depended on
		// `lang`/`code` alone. Reading `onCode` tracked would re-fire whenever its
		// IDENTITY changed, and a consumer passing an inline arrow recreates that on
		// every parent render -- a duplicate `code` emit for content that never moved.
		// Measured on Collapsible in the previous batch: 1 call with untrack, 3 without.
		expect(CODE_BLOCK).toMatch(/import \{[^}]*untrack[^}]*\} from 'svelte'/);
		expect(CODE_BLOCK).toMatch(/untrack\(\(\)\s*=>\s*onCode\(/);
	});
});
