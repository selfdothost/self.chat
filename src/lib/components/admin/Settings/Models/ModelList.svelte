<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import Sortable from 'sortablejs';

	import { getContext, onMount } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import { models } from '$lib/stores';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import EllipsisVertical from '$lib/components/icons/EllipsisVertical.svelte';

	let { modelIds = $bindable([]) } = $props();

	// Untyped (`= null` with no annotation) made `modelListElement.children`
	// resolve to `any`, which in turn made Array.from(...)'s element type
	// infer as `unknown` below instead of `Element`.
	let modelListElement: HTMLDivElement | null = $state(null);

	const positionChangeHandler = () => {
		const modelList = Array.from(modelListElement.children).map((child) =>
			child.id.replace('model-item-', '')
		);

		modelIds = modelList;
	};

	onMount(() => {
		Sortable.create(modelListElement, {
			animation: 150,
			onUpdate: async (_event) => {
				positionChangeHandler();
			}
		});
	});
</script>

{#if modelIds.length > 0}
	<div class="flex flex-col -translate-x-1" bind:this={modelListElement}>
		{#each modelIds as modelId, _modelIdx (modelId)}
			<div class=" flex gap-2 w-full justify-between items-center" id="model-item-{modelId}">
				<Tooltip content={modelId} placement="top-start">
					<div class="flex items-center gap-1">
						<EllipsisVertical className="size-4 cursor-move" />

						<div class=" text-sm flex-1 py-1 rounded-lg">
							{#if $models.find((model) => model.id === modelId)}
								{$models.find((model) => model.id === modelId).name}
							{:else}
								{modelId}
							{/if}
						</div>
					</div>
				</Tooltip>
			</div>
		{/each}
	</div>
{:else}
	<div class="text-gray-500 text-xs text-center py-2">
		{$i18n.t('No models found')}
	</div>
{/if}
