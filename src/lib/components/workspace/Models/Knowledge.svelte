<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import Selector from './Knowledge/Selector.svelte';
	import FileItem from '$lib/components/common/FileItem.svelte';

	export let selectedKnowledge = [];
	export let collections = [];

	const i18n: Writable<i18nType> = getContext('i18n');
</script>

<div>
	<div class="flex w-full justify-between mb-1">
		<div class=" self-center text-sm font-semibold dark:text-gray-200">{$i18n.t('Knowledge')}</div>
	</div>

	<div class=" text-xs dark:text-gray-500 inline-flex flex-wrap items-center gap-1">
		<span>{$i18n.t('Knowledge can be gained in the')}</span>
		<span class="inline-flex items-center gap-0.5">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="2"
				stroke="currentColor"
				class="size-3"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v2.25A2.25 2.25 0 0 0 6 10.5Zm0 9.75h2.25A2.25 2.25 0 0 0 10.5 18v-2.25a2.25 2.25 0 0 0-2.25-2.25H6a2.25 2.25 0 0 0-2.25 2.25V18A2.25 2.25 0 0 0 6 20.25Zm9.75-9.75H18a2.25 2.25 0 0 0 2.25-2.25V6A2.25 2.25 0 0 0 18 3.75h-2.25A2.25 2.25 0 0 0 13.5 6v2.25a2.25 2.25 0 0 0 2.25 2.25Z"
				/>
			</svg>
			<span class="font-medium font-primary">{$i18n.t('Workspace')}</span>
		</span>
		<span>{$i18n.t('tab')}</span>
	</div>

	<div class="flex flex-col">
		{#if selectedKnowledge?.length > 0}
			<div class=" flex flex-wrap items-center gap-2 mt-2">
				{#each selectedKnowledge as file, fileIdx (file.id ?? file.name)}
					<FileItem
						item={file}
						name={file.name}
						type={file?.legacy
							? `Legacy${file.type ? ` ${file.type}` : ''}`
							: (file?.type ?? 'Collection')}
						size={file?.size ?? 0}
						dismissible
						on:dismiss={(_e) => {
							selectedKnowledge = selectedKnowledge.filter((_, idx) => idx !== fileIdx);
						}}
					/>
				{/each}
			</div>
		{/if}

		<div class="flex flex-wrap text-sm font-medium gap-1.5 mt-2">
			<Selector
				on:select={(e) => {
					const item = e.detail;

					if (!selectedKnowledge.find((k) => k.id === item.id)) {
						selectedKnowledge = [
							...selectedKnowledge,
							{
								...item
							}
						];
					}
				}}
			>
				<button
					class=" px-3.5 py-1.5 font-medium hover:bg-black/5 dark:hover:bg-white/5 outline outline-1 outline-gray-100 dark:outline-gray-850 dark:text-gray-200 rounded-3xl"
					type="button">{$i18n.t('Select Knowledge')}</button
				>
			</Selector>
		</div>
		<!-- {knowledge} -->
	</div>
</div>
