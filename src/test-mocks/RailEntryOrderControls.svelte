<script lang="ts">
	// Test-only. Not imported by the app.
	//
	// Mirrors the ONE thing ChatControls does that the R5 entry default has to
	// survive: `$effect(() => { if (!chatId) closeHandler(); })`, which closes the
	// rail whenever it sees no chatId — and a brand new session has none until its
	// first message. ChatControls itself cannot be mounted in this workspace
	// (@tailwindcss/postcss is absent, so its @xyflow import fails to preprocess),
	// so this reproduces the shape rather than the component.
	import { showControls } from '$lib/stores';

	let { chatId = '' } = $props();

	$effect(() => {
		if (!chatId) {
			showControls.set(false);
		}
	});
</script>

<div>controls</div>
