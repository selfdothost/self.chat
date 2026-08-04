<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import { getContext } from 'svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	import Dropdown from '$lib/components/common/Dropdown.svelte';
	import GarbageBin from '$lib/components/icons/GarbageBin.svelte';
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Download from '$lib/components/icons/Download.svelte';
	import Cog6 from '$lib/components/icons/Cog6.svelte';
	import PencilSquare from '$lib/components/icons/PencilSquare.svelte';
	import type { AnyFn } from '$lib/types';
	interface Props {
		children?: import('svelte').Snippet;
		onNewChat?: AnyFn;
		onRename?: AnyFn;
		onConfigure?: AnyFn;
		onExport?: AnyFn;
		onDelete?: AnyFn;
	}

	let {
		children,
		onNewChat = () => {},
		onRename = () => {},
		onConfigure = () => {},
		onExport = () => {},
		onDelete = () => {}
	}: Props = $props();

	let show = $state(false);
</script>

<Dropdown bind:show>
	<Tooltip content={$i18n.t('More')}>
		{@render children?.()}
	</Tooltip>

	{#snippet content()}
		<div >
			<DropdownMenuContent
				class="w-full max-w-[160px] rounded-lg px-1 py-1.5  z-50 bg-white dark:bg-gray-850 dark:text-white shadow-lg"
				sideOffset={-2}
				side="bottom"
				align="start"
			>
				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						onNewChat();
					}}
				>
					<PencilSquare strokeWidth="2" className="size-4" />
					<div class="flex items-center">{$i18n.t('New Chat')}</div>
				</DropdownMenu.Item>

				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						onRename();
					}}
				>
					<Pencil strokeWidth="2" />
					<div class="flex items-center">{$i18n.t('Rename')}</div>
				</DropdownMenu.Item>

				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						onConfigure();
					}}
				>
					<Cog6 strokeWidth="2" />
					<div class="flex items-center">{$i18n.t('Configure')}</div>
				</DropdownMenu.Item>

				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						onExport();
					}}
				>
					<Download strokeWidth="2" />

					<div class="flex items-center">{$i18n.t('Export')}</div>
				</DropdownMenu.Item>

				<DropdownMenu.Item
					class="flex  gap-2  items-center px-3 py-1.5 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					onSelect={() => {
						onDelete();
					}}
				>
					<GarbageBin strokeWidth="2" />
					<div class="flex items-center">{$i18n.t('Delete')}</div>
				</DropdownMenu.Item>
			</DropdownMenuContent>
		</div>
	{/snippet}
</Dropdown>
