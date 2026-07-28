<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import Checkbox from '$lib/components/common/Checkbox.svelte';
	import { getContext, onMount } from 'svelte';

	export let tools = [];

	let _tools = {};

	export let selectedToolIds = [];

	const i18n: Writable<i18nType> = getContext('i18n');

	onMount(() => {
		_tools = tools.reduce((acc, tool) => {
			acc[tool.id] = {
				...tool,
				selected: selectedToolIds.includes(tool.id)
			};

			return acc;
		}, {});
	});
</script>

<div>
	<div class="flex w-full justify-between mb-1">
		<div class=" self-center text-sm font-semibold dark:text-gray-200">{$i18n.t('Tools')}</div>
	</div>

	<div class=" text-xs dark:text-gray-500 inline-flex flex-wrap items-center gap-1">
		<span>{$i18n.t('New Tools can be built under the')}</span>
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
			<span class="font-medium font-primary">{$i18n.t('Workspaces')}</span>
		</span>
		<span>{$i18n.t('tab')}</span>
	</div>

	<div class="flex flex-col">
		{#if tools.length > 0}
			<div class=" flex items-center mt-2 flex-wrap">
				{#each Object.keys(_tools) as tool, _toolIdx (tool)}
					<div class=" flex items-center gap-2 mr-3">
						<div class="self-center flex items-center">
							<Checkbox
								state={_tools[tool].selected ? 'checked' : 'unchecked'}
								on:change={(e) => {
									_tools[tool].selected = e.detail === 'checked';
									selectedToolIds = Object.keys(_tools).filter((t) => _tools[t].selected);
								}}
							/>
						</div>

						<div class=" py-0.5 text-sm w-full capitalize font-medium dark:text-gray-200">
							{_tools[tool].name}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
