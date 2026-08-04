<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import { getContext } from 'svelte';

	import { mobile } from '$lib/stores';

	import Dropdown from '$lib/components/common/Dropdown.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import DocumentArrowUpSolid from '$lib/components/icons/DocumentArrowUpSolid.svelte';
	import CameraSolid from '$lib/components/icons/CameraSolid.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');


	interface Props {
		screenCaptureHandler: AnyFn;
		uploadFilesHandler: AnyFn;
		onClose?: AnyFn;
		children?: import('svelte').Snippet;
	}

	let {
		screenCaptureHandler,
		uploadFilesHandler,
		onClose = () => {},
		children
	}: Props = $props();

	let show = $state(false);


		// Svelte compiles $: blocks in dependency order, not source order --
	// this is called from an earlier reactive block despite being declared
	// here. ESLint's static top-down analysis can't see that reordering.
	 
	const init = async () => {};
	$effect(() => {
		if (show) {
			init();
		}
	});
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
				class="w-full max-w-[200px] rounded-xl px-1 py-1  border-gray-300/30 dark:border-gray-700/50 z-50 bg-white dark:bg-gray-850 dark:text-white shadow"
				sideOffset={15}
				alignOffset={-8}
				side="top"
				align="start"
			>
				{#if !$mobile}
					<DropdownMenu.Item
						class="flex gap-2 items-center px-3 py-2 text-sm  font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800  rounded-xl"
						onSelect={() => {
							screenCaptureHandler();
						}}
					>
						<CameraSolid />
						<div class=" line-clamp-1">{$i18n.t('Capture')}</div>
					</DropdownMenu.Item>
				{/if}

				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-2 text-sm font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl"
					onSelect={() => {
						uploadFilesHandler();
					}}
				>
					<DocumentArrowUpSolid />
					<div class="line-clamp-1">{$i18n.t('Upload Files')}</div>
				</DropdownMenu.Item>
			</DropdownMenuContent>
		</div>
	{/snippet}
</Dropdown>
