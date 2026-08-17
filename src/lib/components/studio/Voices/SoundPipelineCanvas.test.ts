import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import SoundPipelineCanvas from './SoundPipelineCanvas.svelte';
import { placeholderCatalog } from './nodeCatalog';

// --- jsdom polyfills @xyflow/svelte needs to mount ---
// xyflow observes container size via ResizeObserver and reads DOMMatrix during
// pane transforms; jsdom ships neither. These are inert stubs — the canvas
// renders at zero size (fine for a headless assertion) rather than throwing.
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

// Regression test for self.chat#28. The original hand-rolled SVG PipelineCanvas
// ran `afterUpdate` -> unconditionally reassigned a freshly-built Map that a
// reactive block read -> re-render -> `afterUpdate` again -> forever, until
// Svelte's `effect_update_depth_exceeded` guard tore the component down. That
// fired on a completely empty canvas the moment you interacted with it.
//
// This fresh xyflow-based canvas has no such lifecycle-hook-reassigns-derived
// -state loop. These tests guard that the #28 class of bug has not been
// reintroduced: render empty, add a node, and assert the component settles
// with no `effect_update_depth_exceeded` ever surfacing.
describe('SoundPipelineCanvas', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renders an empty canvas with the add-node palette without crashing', () => {
		const { getByTestId, getByText } = render(SoundPipelineCanvas, {
			props: { graph: { nodes: [], edges: [] }, onGraphChange: () => {}, catalog: placeholderCatalog }
		});
		expect(getByTestId('sound-pipeline-canvas')).toBeTruthy();
		// The add-node affordance (the palette) is present on an empty canvas.
		expect(getByText('Add Source')).toBeTruthy();
		expect(getByText('Add Transform')).toBeTruthy();
		expect(getByText('Add Sink')).toBeTruthy();
	});

	it('adds a node via the palette without entering an infinite update loop', async () => {
		// If the #28 loop were reintroduced, Svelte throws `effect_update_depth_exceeded`
		// during flush, which surfaces via console.error. Watch for it explicitly.
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { getByTestId, queryAllByTestId } = render(SoundPipelineCanvas, {
			props: { graph: { nodes: [], edges: [] }, onGraphChange: () => {}, catalog: placeholderCatalog }
		});

		// The exact node-add interaction: click the palette "Add Source" button.
		await fireEvent.click(getByTestId('add-node-source'));

		// waitFor retries — if the component were still looping (or had already
		// crashed) this would time out or surface the uncaught error instead of
		// passing quietly.
		await waitFor(() => {
			expect(queryAllByTestId('catalog-node-source').length).toBeGreaterThan(0);
		});

		const loopErrors = errorSpy.mock.calls
			.flat()
			.map((a) => (a instanceof Error ? a.message : String(a)))
			.filter((m) => m.includes('effect_update_depth_exceeded'));
		expect(loopErrors).toEqual([]);
	});

	it('emits the persisted graph via onGraphChange when a node is added', async () => {
		const onGraphChange = vi.fn();
		const { getByTestId } = render(SoundPipelineCanvas, {
			props: { graph: { nodes: [], edges: [] }, onGraphChange, catalog: placeholderCatalog }
		});

		await fireEvent.click(getByTestId('add-node-transform'));

		// onGraphChange is debounced (250ms); wait for it to fire with the new node.
		await waitFor(
			() => {
				expect(onGraphChange).toHaveBeenCalled();
				const last = onGraphChange.mock.calls.at(-1)?.[0];
				expect(last.nodes.length).toBe(1);
				expect(last.nodes[0].type).toBe('transform');
			},
			{ timeout: 2000 }
		);
	});
});
