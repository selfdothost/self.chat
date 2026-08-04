<script lang="ts">
	import Tooltip from './Tooltip.svelte';

	interface Props {
		status?: string | null | undefined;
	}

	let { status = null }: Props = $props();
</script>

{#if status === 'loaded'}
	<Tooltip content="Loaded" className="flex items-center">
		<span class="w-2 h-2 rounded-full bg-green-500 inline-block shrink-0"></span>
	</Tooltip>
{:else if status === 'loading'}
	<Tooltip content="Loading" className="flex items-center">
		<span class="w-2 h-2 rounded-full bg-yellow-500 inline-block shrink-0 animate-pulse"></span>
	</Tooltip>
{/if}
