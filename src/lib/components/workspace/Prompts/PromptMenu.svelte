<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import { getContext } from 'svelte';

	import Dropdown from '$lib/components/common/Dropdown.svelte';
	import GarbageBin from '$lib/components/icons/GarbageBin.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import DocumentDuplicate from '$lib/components/icons/DocumentDuplicate.svelte';
	import ArrowDownTray from '$lib/components/icons/ArrowDownTray.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		cloneHandler: AnyFn;
		exportHandler: AnyFn;
		deleteHandler: AnyFn;
		onClose: AnyFn;
		children?: import('svelte').Snippet;
	}

	let {
		cloneHandler,
		exportHandler,
		deleteHandler,
		onClose,
		children
	}: Props = $props();

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
	<Tooltip content={$i18n.t('More')}>
		{@render children?.()}
	</Tooltip>

	{#snippet content()}
		<div >
			<DropdownMenuContent
				class="w-full max-w-[160px] rounded-xl px-1 py-1.5 border border-gray-300/30 dark:border-gray-700/50 z-50 bg-white dark:bg-gray-850 dark:text-white shadow"
				sideOffset={-2}
				side="bottom"
				align="start"
			>
				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-2 text-sm  font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						cloneHandler();
					}}
				>
					<DocumentDuplicate />

					<div class="flex items-center">{$i18n.t('Clone')}</div>
				</DropdownMenu.Item>

				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-2 text-sm  font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						exportHandler();
					}}
				>
					<ArrowDownTray />

					<div class="flex items-center">{$i18n.t('Export')}</div>
				</DropdownMenu.Item>

				<hr class="border-gray-100 dark:border-gray-800 my-1" />

				<DropdownMenu.Item
					class="flex  gap-2  items-center px-3 py-2 text-sm  font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						deleteHandler();
					}}
				>
					<GarbageBin strokeWidth="2" />
					<div class="flex items-center">{$i18n.t('Delete')}</div>
				</DropdownMenu.Item>
			</DropdownMenuContent>
		</div>
	{/snippet}
</Dropdown>
