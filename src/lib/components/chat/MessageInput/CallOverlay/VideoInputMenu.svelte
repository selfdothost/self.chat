<script lang="ts">
	import type { AnyFn } from '$lib/types';
	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';

	import Dropdown from '$lib/components/common/Dropdown.svelte';

	interface Props {
		onClose?: AnyFn;
		onChange?: AnyFn;
		devices: { deviceId: string; label: string }[];
		children?: import('svelte').Snippet;
	}

	let { onClose = () => {}, onChange = () => {}, devices, children }: Props = $props();

	let show = $state(false);
</script>

<Dropdown
	bind:show
	onChange={(open) => {
		if (open === false) {
			onClose();
		}
	}}
>
	{@render children?.()}

	{#snippet content()}
		<div >
			<DropdownMenuContent
				class="w-full max-w-[180px] rounded-lg px-1 py-1.5 border border-gray-300/30 dark:border-gray-700/50 z-[9999] bg-white dark:bg-gray-900 dark:text-white shadow-xs"
				sideOffset={6}
				side="top"
				align="start"
			>
				{#each devices as device (device.deviceId)}
					<DropdownMenu.Item
						class="flex gap-2 items-center px-3 py-2 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
						onSelect={() => {
							onChange(device.deviceId);
						}}
					>
						<div class="flex items-center">
							<div class=" line-clamp-1">
								{device?.label ?? 'Camera'}
							</div>
						</div>
					</DropdownMenu.Item>
				{/each}
			</DropdownMenuContent>
		</div>
	{/snippet}
</Dropdown>
