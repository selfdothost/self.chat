<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		DropdownMenu,
		Portal,
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
			<!-- see DropdownMenuContent.svelte -- forceMount + a custom child
			     snippet opts out of bits-ui's auto-portal-to-body, so this must
			     portal explicitly or it inherits ancestor visibility:hidden. -->
			<Portal>
				<div {...wrapperProps}>
					<div {...props} transition:flyAndScale>
						{@render children?.()}
					</div>
				</div>
			</Portal>
		{/if}
	{/snippet}
</DropdownMenu.SubContent>
