import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression tests for the citation-modal half of the #61 aftermath: after the
// render-crash fix landed, OPENING a citation still killed the page — the modal
// appeared as an empty shell with the word "Citation" and nothing responded,
// including the X.
//
// Root cause was a SELF-WRITING $effect in CitationsModal.svelte:
//
//     $effect(() => {
//         mergedDocuments = citation.document?.map(...);   // WRITE
//         if (mergedDocuments.every(...)) {                // READ BACK
//             mergedDocuments = mergedDocuments.sort(...); // WRITE AGAIN
//         }
//     });
//
// An effect that writes a signal it also reads re-triggers itself forever.
// Svelte throws, nothing catches it, and the route dies with the modal shell
// frozen on screen — the same "dead UI" signature as self.chat#33. Worse, the
// first assignment made mergedDocuments `undefined` whenever a citation record
// arrived without a document array, and `{#each undefined}` throws exactly like
// #61's `citations.length` did.
//
// Fix: pure `$derived.by` (eager, cannot loop), `?? []`-shaped guards so the
// each block never sees undefined, an explicit not-ready spinner state, a
// no-content empty state that is NOT a spinner (content is synchronous —
// nothing is coming, and pretending otherwise is the "stuck loading" lie), and
// a close button with type/aria-label that only needs `show = false`.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const MODAL = read('src/lib/components/chat/Messages/CitationsModal.svelte');

// ---------------------------------------------------------------------------
// The loop is gone: no $effect, derived state instead
// ---------------------------------------------------------------------------

describe('CitationsModal.svelte: mergedDocuments cannot loop or be undefined', () => {
	it('contains no $effect at all — this component must be purely derived', () => {
		// The old file's only effect was the self-writing loop. If someone
		// reintroduces an effect here, make them justify it against #33/#61.
		expect(MODAL).not.toMatch(/\$effect\s*\(/);
	});

	it('does not declare mergedDocuments as $state', () => {
		expect(MODAL).not.toMatch(/let\s+mergedDocuments[^=]*=\s*\$state\s*\(/);
	});

	it('derives mergedDocuments with $derived.by', () => {
		expect(MODAL).toMatch(/let\s+mergedDocuments\s*=\s*\$derived\.by\s*\(/);
	});

	it('guards the derivation: a citation without document yields [], not undefined', () => {
		// `if (!citation?.document) { return []; }` — the {#each undefined}
		// guard. The optional chain plus early return must both be present.
		expect(MODAL).toMatch(/if\s*\(\s*!citation\?\.document\s*\)\s*\{\s*return\s*\[\]\s*;/);
	});

	it('sorts a copy, not the mapped array in place', () => {
		// In-place .sort inside a derivation mutates a value the derivation
		// itself produced; the spread is what keeps it side-effect free.
		expect(MODAL).toMatch(/\[\.\.\.documents\]\.sort\(/);
		expect(MODAL).not.toMatch(/documents\.sort\(/);
	});
});

// ---------------------------------------------------------------------------
// The escape hatches: loading state, empty state, close button
// ---------------------------------------------------------------------------

describe('CitationsModal.svelte: the user can always tell state and always leave', () => {
	it('shows a spinner while no citation is selected', () => {
		expect(MODAL).toMatch(/\{#if\s+!citation\}/);
		expect(MODAL).toMatch(/<Spinner/);
	});

	it('renders a no-content empty state rather than a blank or fake spinner', () => {
		expect(MODAL).toMatch(/mergedDocuments\.length\s*===\s*0/);
		expect(MODAL).toMatch(/No content available for this citation\./);
	});

	it('the X sets show = false and is a labelled, typed button', () => {
		// The close button must work regardless of load state; it only needs
		// the bound prop, and type/aria-label keep it correct inside forms.
		expect(MODAL).toMatch(/type="button"/);
		expect(MODAL).toMatch(/aria-label=\{\$i18n\.t\('Close'\)\}/);
		expect(MODAL).toMatch(/show\s*=\s*false;/);
	});
});

// ---------------------------------------------------------------------------
// Pure-logic — the derivation, replicated
// ---------------------------------------------------------------------------

type ModalCitation = {
	source?: Record<string, unknown>;
	document?: unknown[];
	metadata?: Record<string, unknown>[];
	distances?: number[];
};

type ModalDoc = {
	source: unknown;
	document: unknown;
	metadata?: Record<string, unknown>;
	distance?: number;
};

function mergeDocuments(citation: ModalCitation | null | undefined): ModalDoc[] {
	if (!citation?.document) {
		return [];
	}

	const documents = citation.document.map((c: unknown, i: number) => {
		return {
			source: citation.source,
			document: c,
			metadata: citation.metadata?.[i],
			distance: citation.distances?.[i]
		};
	});

	if (documents.length > 0 && documents.every((doc) => doc.distance !== undefined)) {
		return [...documents].sort(
			(a, b) => (b.distance ?? Infinity) - (a.distance ?? Infinity)
		);
	}

	return documents;
}

describe('citation merge derivation: behaviour', () => {
	const citation = {
		source: { name: 'runbook.md' },
		document: ['chunk one', 'chunk two', 'chunk three'],
		metadata: [{ name: 'runbook.md', source: 'runbook' }, { name: 'runbook.md' }, {}],
		distances: [0.9, 0.1, 0.5]
	};

	it('maps document chunks positionally with metadata and distances', () => {
		const docs = mergeDocuments(citation);
		expect(docs).toHaveLength(3);
		expect(docs[0].document).toBe('chunk one');
		expect(docs[0].metadata?.name).toBe('runbook.md');
		expect(docs[0].distance).toBe(0.9);
	});

	it('sorts highest score first when every chunk has a distance (preserved ordering)', () => {
		// The comparator is (b - a): DESCENDING. The field is named `distance`
		// but this component consumes it as relevance — higher is greener in
		// getRelevanceColor() and higher percentage in calculatePercentage().
		// That semantics predates this fix; preserved as-is.
		const docs = mergeDocuments(citation);
		expect(docs.map((d) => d.distance)).toEqual([0.9, 0.5, 0.1]);
	});

	it('does not sort when any chunk lacks a distance', () => {
		const docs = mergeDocuments({
			source: { name: 'mixed' },
			document: ['a', 'b'],
			distances: [0.9]
		});
		expect(docs.map((d) => d.document)).toEqual(['a', 'b']);
	});

	it('does not mutate the citation it derived from', () => {
		const before = JSON.stringify(citation);
		mergeDocuments(citation);
		expect(JSON.stringify(citation)).toBe(before);
	});

	it('returns [] — never undefined — for a citation with no document array', () => {
		// The {#each undefined} crash shape from #61.
		const docs = mergeDocuments({ source: { name: 'zero-file KB' } });
		expect(docs).toEqual([]);
		expect(() => docs.length).not.toThrow();
	});

	it('returns [] when no citation is selected at all', () => {
		expect(mergeDocuments(null)).toEqual([]);
		expect(mergeDocuments(undefined)).toEqual([]);
	});

	it('keeps a single-chunk citation rendering (no sort branch)', () => {
		const docs = mergeDocuments({
			source: { name: 'one' },
			document: ['only chunk'],
			distances: [0.4]
		});
		expect(docs).toHaveLength(1);
	});
});
