<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import { getContext } from 'svelte';


	import Dropdown from '$lib/components/common/Dropdown.svelte';
	import QuestionMarkCircle from '$lib/components/icons/QuestionMarkCircle.svelte';
	import Keyboard from '$lib/components/icons/Keyboard.svelte';
	const i18n: Writable<i18nType> = getContext('i18n');


	interface Props {
		showDocsHandler: AnyFn;
		showShortcutsHandler: AnyFn;
		onClose?: AnyFn;
		children?: import('svelte').Snippet;
	}

	// showDocsHandler accepted (part of the public props contract) but not
	// read internally by this component.
	let {
		showShortcutsHandler,
		onClose = () => {},
		children
	}: Props = $props();
</script>

<Dropdown
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
				class="w-full max-w-[200px] rounded-xl px-1 py-1.5 border border-gray-300/30 dark:border-gray-700/50 z-50 bg-white dark:bg-gray-850 dark:text-white shadow-lg"
				sideOffset={4}
				side="top"
				align="end"
			>
				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-2 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					id="chat-share-button"
					onSelect={() => {
						window.open('https://docs.selfai.com', '_blank');
					}}
				>
					<QuestionMarkCircle className="size-5" />
					<div class="flex items-center">{$i18n.t('Documentation')}</div>
				</DropdownMenu.Item>

				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-2 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
					id="chat-share-button"
					onSelect={() => {
						showShortcutsHandler();
					}}
				>
					<Keyboard className="size-5" />
					<div class="flex items-center">{$i18n.t('Keyboard shortcuts')}</div>
				</DropdownMenu.Item>
			</DropdownMenuContent>
		</div>
	{/snippet}
</Dropdown>
