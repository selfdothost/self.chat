import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// self.chat#31, dispatcher batch 5: Overview, Overview/Flow and Controls/Valves.
//
// Overview forwards xyflow's node-click payload up to ChatControls, which reads
// `.node.data.message.id` off it and flips a favourite. That payload is xyflow's
// shape, not ours, so the guard here is that it is passed through UNFLATTENED --
// a well-meaning `onNodeClick(detail.node)` would compile and quietly break the
// favourite toggle and the message jump.
//
// Valves is the third dead emit found in this migration (after Tags' on:close
// and ResponseMessage's action/select): it emitted 'save' on submit and nothing
// has ever listened.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const OVERVIEW = read('src/lib/components/chat/Overview.svelte');
const FLOW = read('src/lib/components/chat/Overview/Flow.svelte');
const VALVES = read('src/lib/components/chat/Controls/Valves.svelte');
const CONTROLS = read('src/lib/components/chat/ChatControls.svelte');

describe('Overview, Flow and Valves are off createEventDispatcher', () => {
	it('declares no dispatcher in any of the three', () => {
		for (const [name, src] of Object.entries({ OVERVIEW, FLOW, VALVES })) {
			expect(src, name).not.toMatch(/createEventDispatcher/);
			expect(src, name).not.toMatch(/[^a-zA-Z]dispatch\(/);
		}
	});

	it('leaves no on:nodeclick / on:close listener on Overview', () => {
		expect(CONTROLS).not.toMatch(/on:nodeclick=/);
		expect(CONTROLS).not.toMatch(/on:close=/);
	});
});

describe('the node-click payload survives the trip to ChatControls', () => {
	it('Flow hands xyflow its own payload untouched', () => {
		expect(FLOW).toMatch(/onnodeclick=\{\(data\) => onNodeClick\(data\)\}/);
	});

	it('Overview forwards it up whole, not just the node', () => {
		// `onNodeClick(detail.node)` would read naturally and break both consumers.
		expect(OVERVIEW).toMatch(/onNodeClick\(detail\)/);
		expect(OVERVIEW).not.toMatch(/onNodeClick\(detail\.node/);
		// and still drives its own selection off the same object
		expect(OVERVIEW).toMatch(/detail\.node\.data\.message\.id/);
	});

	it('both ChatControls mounts read through .node.data.message', () => {
		const mounts = CONTROLS.match(/onNodeClick=\{\(detail\)/g) ?? [];
		expect(mounts.length, 'both the desktop and drawer mounts').toBe(2);
		expect(CONTROLS).toMatch(/showMessage\(detail\.node\.data\.message\)/);
		expect(CONTROLS).toMatch(/detail\.node\.data\.message\.favorite/);
	});

	it('Overview still emits its own close', () => {
		expect(OVERVIEW).toMatch(/onClose\(\)/);
		expect(CONTROLS).toMatch(/onClose=\{\(\) =>/);
	});
});

describe('Valves', () => {
	it('submits without emitting a save event nobody listens for', () => {
		expect(VALVES).toMatch(/submitHandler\(\);/);
		// the emit is gone, and no prop was invented to replace it. Matched as
		// CODE (a declaration or a call), not as the bare word -- the file's own
		// comment explains the removal and would false-positive a loose match.
		expect(VALVES).not.toMatch(/onSave\s*\??\s*[:=(]/);
	});
});
