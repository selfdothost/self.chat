<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';

	import { WEBUI_BASE_URL } from '$lib/constants';
	import { activeUserIds } from '$lib/stores';

	// bits-ui's Align is 'start' | 'center' | 'end' (not a CSS side) -- for a
	// right-side popover, 'start' is the top-aligned option, which is what this
	

	interface Props {
		side?: 'top' | 'right' | 'bottom' | 'left';
		// was actually going for.
		align?: 'start' | 'center' | 'end';
		/* eslint-disable @typescript-eslint/no-explicit-any */
		user?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		children?: import('svelte').Snippet;
		content?: import('svelte').Snippet;
	}

	let {
		side = 'right',
		align = 'start',
		user = null,
		children,
		content
	}: Props = $props();
	let show = $state(false);
</script>

<DropdownMenu.Root bind:open={show}>
	<DropdownMenu.Trigger>
		{@render children?.()}
	</DropdownMenu.Trigger>

	{#if content}{@render content()}{:else}
		<DropdownMenuContent
			class="max-w-full w-[240px] rounded-lg z-[9999] bg-white dark:bg-black dark:text-white shadow-lg"
			sideOffset={8}
			{side}
			{align}
			onCloseAutoFocus={(e) => {
				// bits-ui v2 moved focus-return control from Root's old `closeFocus`
				// prop to Content's `onCloseAutoFocus` -- preserve the original
				// "don't steal focus back on close" behavior.
				e.preventDefault();
			}}
		>
			{#if user}
				<div class=" flex flex-col gap-2 w-full rounded-lg">
					<div class="py-8 relative bg-gray-900 rounded-t-lg">
						<img
							crossorigin="anonymous"
							src={user?.profile_image_url ?? `${WEBUI_BASE_URL}/static/favicon.png`}
							class=" absolute -bottom-5 left-3 size-12 ml-0.5 object-cover rounded-full -translate-y-[1px]"
							alt="profile"
						/>
					</div>

					<div class=" flex flex-col pt-4 pb-2.5 px-4">
						<div class=" -mb-1">
							<span class="font-medium text-sm line-clamp-1"> {user.name} </span>
						</div>

						<div class=" flex items-center gap-2">
							{#if $activeUserIds.includes(user.id)}
								<div>
									<span class="relative flex size-2">
										<span
											class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
										></span>
										<span class="relative inline-flex rounded-full size-2 bg-green-500"></span>
									</span>
								</div>

								<div class=" -translate-y-[1px]">
									<span class="text-xs"> Active </span>
								</div>
							{:else}
								<div>
									<span class="relative flex size-2">
										<span class="relative inline-flex rounded-full size-2 bg-gray-500"></span>
									</span>
								</div>

								<div class=" -translate-y-[1px]">
									<span class="text-xs"> Away </span>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</DropdownMenuContent>
	{/if}
</DropdownMenu.Root>
