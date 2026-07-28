import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import PipelineCanvas from './PipelineCanvas.svelte';

// Regression test for self.chat#28: `afterUpdate` used to reassign
// `portPositions` to a brand-new (but content-equal) Map on every update
// cycle, and `portPositions` is read reactively by `computedPaths`/
// `pendingPath` -- so the reassignment itself (not any real change) kept
// re-triggering another update, forever, until Svelte's own
// `effect_update_depth_exceeded` guard tore the component down. This
// happened on a completely empty canvas (zero nodes), and was observed
// live to fire on ordinary interaction (opening the context menu).
describe('PipelineCanvas', () => {
	it('renders an empty canvas without crashing', () => {
		const { container } = render(PipelineCanvas, { props: { nodes: [], connections: [] } });
		expect(container).toBeTruthy();
	});

	it('does not enter an infinite update loop when the context menu opens on an empty canvas', async () => {
		const { container } = render(PipelineCanvas, { props: { nodes: [], connections: [] } });
		const canvas = container.querySelector('div.absolute.inset-0.overflow-hidden');
		expect(canvas).toBeTruthy();

		// This is the exact interaction that triggered `effect_update_depth_exceeded`
		// live: right-clicking the empty canvas to open the "Add Node" menu.
		// Before the fix, this either threw synchronously or left the update
		// loop running; either way the test times out or fails on an uncaught
		// exception. After the fix, the menu opens and the component settles.
		await fireEvent.contextMenu(canvas as Element, { clientX: 100, clientY: 100 });

		// waitFor retries the assertion for a bit -- if the component is still
		// looping (or already crashed), this either times out or surfaces the
		// uncaught `effect_update_depth_exceeded` instead of passing quietly.
		await waitFor(() => expect(container.textContent).toContain('Add Node'));
	});
});
