<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		DropdownMenu,
		Portal,
		type DropdownMenuContentProps,
		type WithoutChildrenOrChild
	} from 'bits-ui';
	import { flyAndScale } from '$lib/utils/transitions';

	let {
		ref = $bindable(null),
		children,
		...restProps
	}: WithoutChildrenOrChild<DropdownMenuContentProps> & {
		children?: Snippet;
	} = $props();
</script>

<DropdownMenu.Content bind:ref {...restProps} forceMount>
	{#snippet child({ wrapperProps, props, open })}
		{#if open}
			<!-- forceMount + a custom child snippet is bits-ui's escape hatch for
			     the transition above, but it also opts out of bits-ui's normal
			     auto-portal-to-body -- without this, the content stays a DOM
			     descendant of the trigger's row (e.g. the sidebar's
			     invisible/group-hover:visible action-icon wrapper) and inherits
			     visibility:hidden the moment the mouse leaves that row, even
			     though it's still correctly `position:fixed` from floating-ui. -->
			<Portal>
				<div {...wrapperProps}>
					<div {...props} transition:flyAndScale>
						{@render children?.()}
					</div>
				</div>
			</Portal>
		{/if}
	{/snippet}
</DropdownMenu.Content>
