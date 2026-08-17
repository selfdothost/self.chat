<script lang="ts">
	import { theme } from '$lib/stores';
	import { Background, Controls, SvelteFlow, BackgroundVariant } from '@xyflow/svelte';

	// onNodeClick receives xyflow's node-click payload unchanged -- Overview reads
	// `.node.data.message.id` off it, so the shape is not ours to flatten.
	let { nodes, nodeTypes, edges, onNodeClick = () => {} } = $props();
</script>

<SvelteFlow
	{nodes}
	{nodeTypes}
	{edges}
	fitView
	minZoom={0.001}
	colorMode={$theme.includes('dark')
		? 'dark'
		: $theme === 'system'
			? window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light'
			: 'light'}
	nodesConnectable={false}
	nodesDraggable={false}
	onnodeclick={(data) => onNodeClick(data)}
	oninit={() => {
		console.log('Flow initialized');
	}}
>
	<Controls showLock={false} />
	<Background variant={BackgroundVariant.Dots} />
</SvelteFlow>
