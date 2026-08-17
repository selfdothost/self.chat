import { render, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PipelineCanvas from './PipelineCanvas.svelte';

// self.chat#47. Loading a saved pipeline left the canvas EMPTY: the network call
// returned 200 with the right JSON, KnowledgeBase assigned it to `pipelineNodes`,
// and nothing appeared. Switching tabs and back rendered it perfectly, so the data
// was never the problem -- the already-mounted canvas simply never re-read the prop.
//
// PipelineCanvas seeds its xyflow state ONCE, `untrack`ed, at mount. That is
// deliberate and must stay: the canvas emits `onConfigChange`, which KnowledgeBase
// writes straight back into `pipelineNodes`, so a child `$effect` re-seeding from
// the prop would read what it transitively writes -- the self-retriggering render
// the xyflow rewrite existed to delete (self.chat#28). The fix therefore lives in
// the PARENT: bump a load token and remount via `{#key}`.
//
// Two guards below, deliberately pulling in opposite directions:
//   1. the parent actually remounts on load          (fails without the #47 fix)
//   2. the child still ignores post-mount prop changes (fails if someone "fixes"
//      #47 the dangerous way, by adding that $effect to the canvas)

const kbSrc = readFileSync(
	resolve(process.cwd(), 'src/lib/components/studio/Knowledge/KnowledgeBase.svelte'),
	'utf-8'
);

const canvasSrc = readFileSync(
	resolve(
		process.cwd(),
		'src/lib/components/studio/Knowledge/KnowledgeBase/PipelineCanvas.svelte'
	),
	'utf-8'
);

// Same jsdom polyfills PipelineCanvas.test.ts installs, and for the same reason:
// xyflow needs ResizeObserver / DOMMatrixReadOnly / matchMedia to mount at all.
beforeAll(() => {
	if (!globalThis.ResizeObserver) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver;
	}
	if (!(globalThis as Record<string, unknown>).DOMMatrixReadOnly) {
		(globalThis as Record<string, unknown>).DOMMatrixReadOnly = class {
			m22 = 1;
			constructor(_t?: string) {}
		};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
	if (!window.matchMedia) {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false
		})) as unknown as typeof window.matchMedia;
	}
});

const LOADED_NODES = [
	{
		id: 'src-1',
		label: 'Source',
		type: 'source' as const,
		x: 40,
		y: 60,
		headerColor: 'bg-emerald-600',
		config: {}
	},
	{
		id: 'wc-1',
		label: 'Word Count Filter',
		type: 'transform' as const,
		x: 320,
		y: 60,
		headerColor: 'bg-amber-600',
		config: { stage_type: 'WordCountFilter', params: { min_words: 137 } }
	}
];

const LOADED_CONNECTIONS = [{ fromId: 'src-1', toId: 'wc-1' }];

describe('self.chat#47: loading a pipeline repopulates the canvas', () => {
	it('remounts PipelineCanvas on load via a token key', () => {
		// The regression in eaf0aacd was a contract mismatch that left NO trace at
		// the call site: PipelineCanvas went initial-only while KnowledgeBase kept
		// driving it as a live prop, and the JSX-ish line at the call site did not
		// change by a single byte. Pin the remount in the source so that pairing
		// cannot silently come apart again.
		expect(kbSrc).toMatch(/let\s+pipelineLoadToken\s*=\s*\$state\(\s*0\s*\)/);

		// the load handler must bump it after assigning the loaded graph
		expect(kbSrc).toMatch(
			/pipelineConnections\s*=\s*loadedContent\.connections;[\s\S]{0,240}?pipelineLoadToken\s*\+=\s*1/
		);

		// and the canvas must actually be wrapped in the keyed block
		expect(kbSrc).toMatch(/\{#key\s+pipelineLoadToken\}[\s\S]*?<PipelineCanvas[\s\S]*?\{\/key\}/);
	});

	it('keys the remount on the token, never on the node array', () => {
		// Keying on `pipelineNodes` would look like it works and would destroy the
		// canvas on every edit the child emits, since onConfigChange writes that
		// array back. The token is written ONLY by the load path.
		expect(kbSrc).not.toMatch(/\{#key\s+pipelineNodes/);
		expect(kbSrc).not.toMatch(/\{#key\s+pipelineConnections/);
	});

	it('does not re-seed the canvas from inside the canvas (would re-arm #28)', () => {
		// The tempting one-line "fix" for #47. It reads what it transitively writes.
		expect(canvasSrc).toMatch(/untrack\(/);
		expect(canvasSrc).not.toMatch(/\$effect\([\s\S]{0,200}?initialNodes/);
	});

	it('renders a loaded graph when the canvas is mounted with it', async () => {
		// The other half of the contract: a FRESH mount must paint the loaded graph.
		// This is what the `{#key}` remount buys, and it is why switching tabs was a
		// working workaround for the bug.
		const { container } = render(PipelineCanvas, {
			props: { nodes: LOADED_NODES, connections: LOADED_CONNECTIONS }
		});

		await waitFor(() =>
			expect(container.querySelectorAll('[data-testid^="pipeline-node-"]').length).toBe(2)
		);
		expect(container.querySelector('[data-testid="pipeline-node-source"]')).toBeTruthy();
		expect(container.querySelector('[data-testid="pipeline-node-transform"]')).toBeTruthy();
	});
});
