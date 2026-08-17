<script lang="ts">
	// Test-only. Not imported by the app.
	//
	// Mirrors Chat.svelte's structure for the R5 entry default: the controls
	// component is a CHILD, and the rail's entry state is set from the parent's
	// onMount (Chat reaches `initNewChat()` through its `chatId` subscriber, which
	// is registered in onMount).
	import { onMount } from 'svelte';
	import { showControls } from '$lib/stores';
	import Controls from './RailEntryOrderControls.svelte';

	let { controlsOpenOnEntry = false } = $props();

	onMount(() => {
		showControls.set(controlsOpenOnEntry);
	});
</script>

<Controls />
