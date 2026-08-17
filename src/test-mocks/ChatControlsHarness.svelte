<script lang="ts">
	// Test-only wrapper: ChatControls renders a paneforge <Pane>/<PaneResizer>,
	// which need a <PaneGroup> ancestor for context. Not imported by the app.
	import { PaneGroup, Pane } from 'paneforge';
	import ChatControls from '$lib/components/chat/ChatControls.svelte';

	/* eslint-disable @typescript-eslint/no-explicit-any */
	let {
		chatId = 'abc-123',
		history = {
			messages: {
				m1: { id: 'm1', parentId: null, childrenIds: [], role: 'assistant', content: '```html\n<h1>hi</h1>\n```' }
			},
			currentId: 'm1'
		},
		onReady = undefined,
		component = $bindable(null),
		pane = $bindable(null)
	}: any = $props();

	$effect(() => {
		if (component && onReady) onReady(component);
	});
	/* eslint-enable @typescript-eslint/no-explicit-any */
</script>

<PaneGroup direction="horizontal">
	<Pane defaultSize={50}>
		<div>main</div>
	</Pane>
	<ChatControls
		bind:this={component}
		bind:pane
		{chatId}
		{history}
		eventTarget={new EventTarget()}
		submitPrompt={() => {}}
		stopResponse={() => {}}
		showMessage={() => {}}
		files={[]}
		modelId={null}
	/>
</PaneGroup>
