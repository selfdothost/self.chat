<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import type { AnyFn } from '$lib/types';


	// bits-ui v2's floating layer only accepts these literal unions (not

	interface Props {
		show?: boolean;
		// plain string) for `side`/`align` on the content component.
		side?: 'top' | 'right' | 'bottom' | 'left';
		align?: 'start' | 'center' | 'end';
		children?: import('svelte').Snippet;
		content?: import('svelte').Snippet;
		onChange?: AnyFn;
	}

	let {
		show = $bindable(false),
		side = 'bottom',
		align = 'start',
		children,
		content,
		onChange = () => {}
	}: Props = $props();
</script>

<DropdownMenu.Root
	bind:open={show}
	onOpenChange={(state) => {
		onChange(state);
	}}
>
	<DropdownMenu.Trigger>
		{@render children?.()}
	</DropdownMenu.Trigger>

	{#if content}{@render content()}{:else}
		<DropdownMenuContent
			class="w-full max-w-[130px] rounded-lg px-1 py-1.5 border border-gray-900 z-50 bg-gray-850 text-white"
			sideOffset={8}
			{side}
			{align}
			onCloseAutoFocus={(e) => {
				// bits-ui v2 removed the old `closeFocus` Root prop that suppressed
				// focus restoration on close; `onCloseAutoFocus` on Content is its
				// replacement -- preventDefault() to preserve the old behavior.
				e.preventDefault();
			}}
		>
			<DropdownMenu.Item class="flex items-center px-3 py-2 text-sm  font-medium">
				<div class="flex items-center">Profile</div>
			</DropdownMenu.Item>

			<DropdownMenu.Item class="flex items-center px-3 py-2 text-sm  font-medium">
				<div class="flex items-center">Profile</div>
			</DropdownMenu.Item>

			<DropdownMenu.Item class="flex items-center px-3 py-2 text-sm  font-medium">
				<div class="flex items-center">Profile</div>
			</DropdownMenu.Item>
		</DropdownMenuContent>
	{/if}
</DropdownMenu.Root>
