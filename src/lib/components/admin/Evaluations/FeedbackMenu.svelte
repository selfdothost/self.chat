<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import { getContext } from 'svelte';
	import type { AnyFn } from '$lib/types';

	const i18n: Writable<i18nType> = getContext('i18n');

	import Dropdown from '$lib/components/common/Dropdown.svelte';
	import GarbageBin from '$lib/components/icons/GarbageBin.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	interface Props {
		onDelete?: AnyFn;
		children?: import('svelte').Snippet;
	}

	let { onDelete = () => {}, children }: Props = $props();

	let show = $state(false);
</script>

<Dropdown bind:show>
	<Tooltip content={$i18n.t('More')}>
		{@render children?.()}
	</Tooltip>

	{#snippet content()}
		<div >
			<DropdownMenuContent
				class="w-full max-w-[150px] rounded-xl px-1 py-1.5 z-50 bg-white dark:bg-gray-850 dark:text-white shadow-lg"
				sideOffset={-2}
				side="bottom"
				align="start"
			>
				<DropdownMenu.Item
					class="flex  gap-2  items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						onDelete();
						show = false;
					}}
				>
					<GarbageBin strokeWidth="2" />
					<div class="flex items-center">{$i18n.t('Delete')}</div>
				</DropdownMenu.Item>
			</DropdownMenuContent>
		</div>
	{/snippet}
</Dropdown>
