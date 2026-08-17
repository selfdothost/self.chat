import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeAll } from 'vitest';
import PipelineCanvas from './PipelineCanvas.svelte';
import { NODE_TYPES, paletteGroups } from './nodePalette';

// --- jsdom polyfills @xyflow/svelte needs to mount ---
// Same set Voices/SoundPipelineCanvas.test.ts installs, and for the same
// reason: xyflow observes container size via ResizeObserver, reads DOMMatrix
// during pane transforms, and queries matchMedia for colour scheme; jsdom ships
// none of them. Inert stubs — the canvas renders at zero size, which is fine
// for a headless assertion, rather than throwing.
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

// The canvas is now built on @xyflow/svelte. The original self.chat#28 loop
// (`afterUpdate` reassigning a Map that `computedPaths`/`pendingPath` read, so
// the reassignment re-triggered itself until `effect_update_depth_exceeded`)
// cannot recur here: nothing measures ports, there is no lifecycle hook, and
// the single $effect only READS nodes/edges to emit the graph. The empty-canvas
// render below is kept as the cheap standing guard on that.
//
// What these DO pin is the contract the rewrite had to preserve: the PERSISTED
// shape. KnowledgeBase saves {id,label,type,x,y,headerColor,config} plus
// {fromId,toId} and builds the curator payload by walking that chain, so a
// saved pipeline must survive a round trip through xyflow's own
// {position:{x,y}} / {source,target} representation unchanged.

const SAVED_NODES = [
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
		config: { stage_type: 'WordCountFilter', params: { min_words: 50 } }
	},
	{
		id: 'sink-1',
		label: 'Output',
		type: 'sink' as const,
		x: 600,
		y: 60,
		headerColor: 'bg-indigo-600',
		config: {}
	}
];

const SAVED_CONNECTIONS = [
	{ fromId: 'src-1', toId: 'wc-1' },
	{ fromId: 'wc-1', toId: 'sink-1' }
];

describe('PipelineCanvas', () => {
	it('renders an empty canvas without crashing', () => {
		const { container } = render(PipelineCanvas, { props: { nodes: [], connections: [] } });
		expect(container.querySelector('[data-testid="pipeline-canvas"]')).toBeTruthy();
	});

	it('renders the palette so nodes can be added', async () => {
		const { container } = render(PipelineCanvas, { props: { nodes: [], connections: [] } });
		await waitFor(() =>
			expect(container.querySelector('[data-testid="node-search"]')).toBeTruthy()
		);
		expect(container.textContent).toContain('Add Node');
	});

	it('emits the persisted shape unchanged after a round trip through xyflow', async () => {
		let emitted: { nodes: typeof SAVED_NODES; connections: typeof SAVED_CONNECTIONS } | null =
			null;
		const { container } = render(PipelineCanvas, {
			props: {
				nodes: SAVED_NODES,
				connections: SAVED_CONNECTIONS,
				onConfigChange: (g) => {
					emitted = g as typeof emitted;
				}
			}
		});

		// Adding a node is the cheapest way to make the canvas emit; what matters
		// is that the three PRE-EXISTING nodes come back byte-identical, i.e. that
		// x/y survived the trip through xyflow's position object and that
		// fromId/toId were not silently renamed to source/target.
		const add = container.querySelector(
			'[data-testid="add-node-Source"]'
		) as HTMLButtonElement;
		expect(add).toBeTruthy();
		await fireEvent.click(add);

		await waitFor(() => expect(emitted).not.toBeNull(), { timeout: 2000 });

		const kept = emitted!.nodes.filter((n) => SAVED_NODES.some((s) => s.id === n.id));
		expect(kept).toEqual(SAVED_NODES);
		expect(emitted!.connections).toEqual(SAVED_CONNECTIONS);
	});

	it('propagates a param edit made inside a node', async () => {
		// The seam that silently broke during this rewrite: the *NodeContent
		// components moved from `createEventDispatcher`/`configchange` to an
		// `onConfigChange` callback prop (self.chat#31 phase 3 batch 5). A stale
		// `on:configchange` listener still COMPILES and still RENDERS — it just
		// never fires, so every edit inside a node quietly does nothing and the
		// pipeline saves the defaults. That batch's own note said this event was
		// unexercised by the tests; this is that test.
		let emitted: { nodes: Array<{ config: Record<string, unknown> }> } | null = null;
		const { container } = render(PipelineCanvas, {
			props: {
				nodes: [SAVED_NODES[1]], // Word Count Filter
				connections: [],
				onConfigChange: (g) => {
					emitted = g as typeof emitted;
				}
			}
		});

		const node = await waitFor(() => {
			const el = container.querySelector('[data-testid="pipeline-node-transform"]');
			expect(el).toBeTruthy();
			return el as HTMLElement;
		});

		const input = node.querySelector('input') as HTMLInputElement;
		expect(input).toBeTruthy();
		await fireEvent.input(input, { target: { value: '999' } });

		await waitFor(() => expect(emitted).not.toBeNull(), { timeout: 2000 });
		const params = emitted!.nodes[0].config.params as Record<string, unknown>;
		expect(Object.values(params)).toContain(999);
	});

	it('seeds a new node with its template defaults', async () => {
		let emitted: { nodes: Array<{ label: string; config: Record<string, unknown> }> } | null =
			null;
		const { container } = render(PipelineCanvas, {
			props: {
				nodes: [],
				connections: [],
				onConfigChange: (g) => {
					emitted = g as typeof emitted;
				}
			}
		});

		// Transform groups start collapsed (58 entries is too many to show at
		// once), so the entry has to be searched for first — which is also the
		// real path to it, and pins that searching expands the groups.
		const search = container.querySelector('[data-testid="node-search"]') as HTMLInputElement;
		await fireEvent.input(search, { target: { value: 'Document Splitter' } });

		// DocumentSplitter declares defaults for text_field and segment_id_field.
		// A node added without them submits empty params and the stage runs
		// unconfigured — which is what the previous canvas seeded and this must too.
		const add = (await waitFor(() => {
			const el = container.querySelector('[data-testid="add-node-Document Splitter"]');
			expect(el).toBeTruthy();
			return el;
		})) as HTMLButtonElement;
		await fireEvent.click(add);

		await waitFor(() => expect(emitted).not.toBeNull(), { timeout: 2000 });

		const added = emitted!.nodes.at(-1)!;
		expect(added.config.stage_type).toBe('DocumentSplitter');
		expect(added.config.params).toMatchObject({
			text_field: 'text',
			segment_id_field: 'segment_id'
		});
	});
});

describe('nodePalette', () => {
	it('kept every entry the hand-rolled canvas offered', () => {
		// The extraction was meant to be verbatim; a dropped entry would silently
		// remove a stage from the builder.
		expect(NODE_TYPES.length).toBe(58);
		expect(NODE_TYPES.filter((n) => n.type === 'source')).toHaveLength(1);
		expect(NODE_TYPES.filter((n) => n.type === 'sink')).toHaveLength(1);
	});

	it('returns Source and Output ungrouped so they can be pinned first', () => {
		const groups = paletteGroups();
		expect(groups[0].group).toBeNull();
		expect(groups[0].items.map((i) => i.label)).toEqual(['Source', 'Output']);
	});

	it('groups every transform under a named group', () => {
		const ungrouped = NODE_TYPES.filter((n) => n.type === 'transform' && !n.group);
		expect(ungrouped).toEqual([]);
	});
});
