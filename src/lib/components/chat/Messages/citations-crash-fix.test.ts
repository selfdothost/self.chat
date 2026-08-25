import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Tests for issue #61 fixes:
//
// 1. Citations.svelte: `citations`, `showRelevance`, `showPercentage` were
//    `$state()` (no init) filled inside a `$effect`. Svelte 5 effects run
//    AFTER mount, so the template's first `citations.length` read hit
//    `undefined` and threw, blanking the whole chat page.
//    Fix: convert to `$derived`, which evaluates eagerly on first read.
//
// 2. Citations.svelte: `source.document.forEach(...)` was called without
//    checking whether `document` exists. A source record with keys but no
//    `document` array (e.g. a zero-file KB) throws. Fix: guard with
//    `if (!source.document) return acc`.
//
// 3. MultiResponseMessages.svelte: `parentMessage?.models.reduce(...)` —
//    optional chaining on `parentMessage` but not on `.models`; if
//    `parentMessage` exists but `.models` is undefined the call still throws.
//    Fix: `parentMessage?.models?.reduce(...)`.
//
// WHY SOURCE GUARDS IN ADDITION TO LOGIC TESTS. The crash in #1 is a
// reactivity timing issue — the wrong *pattern* causes it, not a wrong value.
// Source assertions guard against the pattern regressing (e.g. someone turning
// $derived back into $state + $effect). The logic tests below exercise the
// citation-building reduce inline to confirm the document-missing guard works
// without needing to mount the full component tree.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const CITATIONS = read('src/lib/components/chat/Messages/Citations.svelte');
const MULTI = read('src/lib/components/chat/Messages/MultiResponseMessages.svelte');

// ---------------------------------------------------------------------------
// Fix 1 — $derived, not $state() + $effect
// ---------------------------------------------------------------------------

describe('Citations.svelte: citations/showRelevance/showPercentage are $derived', () => {
	it('does not declare citations as a bare $state() with no initializer', () => {
		// The crashing pattern: `let citations: Citation[] = $state()` — no arg.
		// After the fix the variable should not appear in $state() form at all.
		expect(CITATIONS).not.toMatch(/let\s+citations[^=]*=\s*\$state\s*\(\s*\)/);
	});

	it('does not declare showRelevance or showPercentage as bare $state()', () => {
		expect(CITATIONS).not.toMatch(/let\s+showRelevance[^=]*=\s*\$state\s*\(\s*\)/);
		expect(CITATIONS).not.toMatch(/let\s+showPercentage[^=]*=\s*\$state\s*\(\s*\)/);
	});

	it('derives citations from sources using $derived', () => {
		expect(CITATIONS).toMatch(/let\s+citations\s*=\s*\$derived\s*\(/);
	});

	it('derives showRelevance and showPercentage from citations using $derived', () => {
		expect(CITATIONS).toMatch(/let\s+showRelevance\s*=\s*\$derived\s*\(/);
		expect(CITATIONS).toMatch(/let\s+showPercentage\s*=\s*\$derived\s*\(/);
	});

	it('does not use $effect to fill citations', () => {
		// The old pattern assigned citations/showRelevance/showPercentage inside
		// a single $effect block. That block should no longer exist.
		// (showCitationModal etc. may legitimately use $effect elsewhere, so we
		// check for the specific assignment pattern.)
		expect(CITATIONS).not.toMatch(/\$effect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?citations\s*=/);
	});
});

// ---------------------------------------------------------------------------
// Fix 2 — guard against source.document being absent
// ---------------------------------------------------------------------------

describe('Citations.svelte: source.document is guarded before forEach', () => {
	it('returns early from the reduce accumulator when source.document is falsy', () => {
		// The guard must appear BEFORE the .forEach call and after the
		// Object.keys empty-object guard.
		expect(CITATIONS).toMatch(/if\s*\(\s*!source\.document\s*\)/);
	});

	it('source.document guard returns acc (not just a bare return)', () => {
		// A bare `return` inside reduce would return `undefined`, which would
		// break accumulation. The guard must `return acc`.
		expect(CITATIONS).toMatch(/if\s*\(\s*!source\.document\s*\)\s*\{?\s*return\s+acc/);
	});
});

// ---------------------------------------------------------------------------
// Fix 3 — optional chaining on .models before .reduce
// ---------------------------------------------------------------------------

describe('MultiResponseMessages.svelte: .models is optionally chained before .reduce', () => {
	it('uses ?.models?.reduce for groupedMessageIds assignment', () => {
		// The old code: parentMessage?.models.reduce(...)
		// The fix:      parentMessage?.models?.reduce(...)
		// Both reduce assignments must use the safe form.
		const matches = [...MULTI.matchAll(/parentMessage\?\.models(\??)\.reduce/g)];
		expect(matches.length).toBeGreaterThanOrEqual(2);
		for (const m of matches) {
			expect(m[1], 'missing ?. on .models before .reduce').toBe('?');
		}
	});
});

describe('MultiResponseMessages.svelte: the optional-chained reduce falls back to {}', () => {
	// Adding `?.` to `.models` stops the reduce from throwing, but it makes the
	// whole expression evaluate to `undefined` — which then REPLACES the
	// `$state({})` initializer. Every downstream read is
	// `Object.keys(groupedMessageIds)` / `groupedMessageIds[modelIdx]`, and the
	// template runs them inside `{#if parentMessage}` — true in exactly the case
	// where `parentMessage` exists but carries no `models`. So `?.` alone
	// relocates the #61 blank page from the reduce into the template instead of
	// removing it. Both assignments need `?? {}` as well.

	it('both reduce assignments end with a ?? {} fallback', () => {
		const matches = [...MULTI.matchAll(/parentMessage\?\.models\?\.reduce\(/g)];
		expect(matches.length).toBe(2);

		// Each assignment's closing `}, {})` must be followed by `?? {}`.
		const fallbacks = [...MULTI.matchAll(/\}\s*,\s*\{\}\)\s*\?\?\s*\{\}\s*;/g)];
		expect(fallbacks.length, 'both reduces must fall back to {} when models is absent').toBe(2);
	});

	it('the state initializers they overwrite are objects, not undefined', () => {
		expect(MULTI).toMatch(/let\s+groupedMessageIds\s*=\s*\$state\(\{\}\)/);
		expect(MULTI).toMatch(/let\s+groupedMessageIdsIdx\s*=\s*\$state\(\{\}\)/);
	});
});

// ---------------------------------------------------------------------------
// Pure-logic — the grouped-message assignment against a models-less parent
// ---------------------------------------------------------------------------

describe('grouped message ids: a parent with no models array stays renderable', () => {
	// Replicates the assignment and the template's first read of it.
	const assign = (parentMessage: { models?: string[] }) =>
		parentMessage?.models?.reduce((a: Record<string, unknown>, _model, modelIdx) => {
			return { ...a, [modelIdx]: { messageIds: [] } };
		}, {}) ?? {};

	it('yields {} — not undefined — when the parent carries no models', () => {
		expect(assign({ id: 'parent-with-no-models' } as { models?: string[] })).toEqual({});
	});

	it('the template read Object.keys(...) does not throw for that parent', () => {
		const grouped = assign({ id: 'parent-with-no-models' } as { models?: string[] });
		expect(() => Object.keys(grouped)).not.toThrow();
		expect(Object.keys(grouped)).toHaveLength(0);
	});

	it('still groups normally when the parent does carry models', () => {
		const grouped = assign({ models: ['a', 'b'] });
		expect(Object.keys(grouped)).toEqual(['0', '1']);
	});
});

// ---------------------------------------------------------------------------
// Pure-logic unit tests — citation-building reduce
// ---------------------------------------------------------------------------
// These replicate the reduce body from Citations.svelte verbatim so we can
// exercise the acceptance-criteria scenarios without mounting Svelte.

type Citation = {
	id?: string;
	document: unknown[];
	metadata?: Record<string, unknown>[];
	distances?: number[];
	source?: Record<string, unknown>;
};

function buildCitations(sources: Citation[]): Citation[] {
	return sources.reduce((acc: Citation[], source) => {
		if (Object.keys(source).length === 0) {
			return acc;
		}

		// Fix 2 guard under test
		if (!source.document) {
			return acc;
		}

		source.document.forEach((document, index) => {
			const metadata = source.metadata?.[index];
			const distance = source.distances?.[index];

			const id = (metadata?.source ?? 'N/A') as string;
			let _source = source?.source;

			if (metadata?.name) {
				_source = { ..._source, name: metadata.name };
			}

			if (id.startsWith('http://') || id.startsWith('https://')) {
				_source = { ..._source, name: id, url: id };
			}

			const existingSource = acc.find((item) => item.id === id);

			if (existingSource) {
				existingSource.document.push(document);
				existingSource.metadata!.push(metadata!);
				if (distance !== undefined) existingSource.distances!.push(distance);
			} else {
				acc.push({
					id: id,
					source: _source,
					document: [document],
					metadata: metadata ? [metadata] : [],
					distances: distance !== undefined ? [distance] : undefined
				});
			}
		});
		return acc;
	}, []);
}

describe('citation-building reduce: acceptance criteria', () => {
	it('acceptance 1 — produces citations from a normal source record', () => {
		const sources: Citation[] = [
			{
				document: ['chunk A', 'chunk B'],
				metadata: [{ source: 'doc1.pdf', name: 'Doc 1' }, { source: 'doc1.pdf', name: 'Doc 1' }],
				distances: [0.2, 0.3]
			}
		];
		const result = buildCitations(sources);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('doc1.pdf');
		expect(result[0].document).toEqual(['chunk A', 'chunk B']);
	});

	it('acceptance 2 — source with empty document array produces no citations (zero-file KB)', () => {
		// A zero-file KB yields a source record with document: [] — no crash,
		// no citations block rendered.
		const sources: Citation[] = [{ document: [] }];
		const result = buildCitations(sources);
		expect(result).toHaveLength(0);
	});

	it('acceptance 3 — source record missing document does not throw', () => {
		// The crashing case: a source with keys but no document field.
		const sources = [{ source: { name: 'some-kb' } }] as unknown as Citation[];
		expect(() => buildCitations(sources)).not.toThrow();
		const result = buildCitations(sources);
		expect(result).toHaveLength(0);
	});

	it('skips a completely empty source object', () => {
		const result = buildCitations([{} as Citation]);
		expect(result).toHaveLength(0);
	});

	it('deduplicates multiple chunks from the same source id', () => {
		const sources: Citation[] = [
			{
				document: ['chunk A'],
				metadata: [{ source: 'shared-id' }]
			},
			{
				document: ['chunk B'],
				metadata: [{ source: 'shared-id' }]
			}
		];
		const result = buildCitations(sources);
		expect(result).toHaveLength(1);
		expect(result[0].document).toEqual(['chunk A', 'chunk B']);
	});

	it('expands http/https source ids into a name+url pair', () => {
		const sources: Citation[] = [
			{
				document: ['text'],
				metadata: [{ source: 'https://example.com/page' }]
			}
		];
		const result = buildCitations(sources);
		expect(result[0].source).toEqual({ name: 'https://example.com/page', url: 'https://example.com/page' });
	});
});
