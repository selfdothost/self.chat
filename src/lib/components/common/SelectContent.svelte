<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Select, type SelectContentProps, type WithoutChildrenOrChild } from 'bits-ui';
	import { flyAndScale } from '$lib/utils/transitions';

	let {
		ref = $bindable(null),
		children,
		...restProps
	}: WithoutChildrenOrChild<SelectContentProps> & {
		children?: Snippet;
	} = $props();
</script>

<Select.Content bind:ref {...restProps} forceMount>
	{#snippet child({ wrapperProps, props, open })}
		{#if open}
			<div {...wrapperProps}>
				<div {...props} transition:flyAndScale>
					{@render children?.()}
				</div>
			</div>
		{/if}
	{/snippet}
</Select.Content>
