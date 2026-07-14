<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		DropdownMenu,
		type DropdownMenuSubContentProps,
		type WithoutChildrenOrChild
	} from 'bits-ui';
	import { flyAndScale } from '$lib/utils/transitions';

	let {
		ref = $bindable(null),
		children,
		...restProps
	}: WithoutChildrenOrChild<DropdownMenuSubContentProps> & {
		children?: Snippet;
	} = $props();
</script>

<DropdownMenu.SubContent bind:ref {...restProps} forceMount>
	{#snippet child({ wrapperProps, props, open })}
		{#if open}
			<div {...wrapperProps}>
				<div {...props} transition:flyAndScale>
					{@render children?.()}
				</div>
			</div>
		{/if}
	{/snippet}
</DropdownMenu.SubContent>
