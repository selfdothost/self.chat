<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { models, settings, user } from '$lib/stores';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import Selector from './ModelSelector/Selector.svelte';
	import Tooltip from '../common/Tooltip.svelte';

	import { updateUserSettings } from '$lib/apis/users';
	const i18n: Writable<i18nType> = getContext('i18n');


	interface Props {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		selectedModels?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		disabled?: boolean;
		showSetDefault?: boolean;
	}

	let { selectedModels = $bindable(['']), disabled = false, showSetDefault = true }: Props = $props();

	const saveDefaultModel = async () => {
		const hasEmptyModel = selectedModels.filter((it) => it === '');
		if (hasEmptyModel.length) {
			toast.error($i18n.t('Choose a model before saving...'));
			return;
		}
		settings.set({ ...$settings, models: selectedModels });
		await updateUserSettings(localStorage.token, { ui: $settings });

		toast.success($i18n.t('Default model updated'));
	};

	$effect(() => {
		if (selectedModels.length > 0 && $models.length > 0) {
			const availableIds = new Set($models.map((m) => m.id));
			const revalidated = selectedModels.map((model) => (availableIds.has(model) ? model : ''));

			// Only write when a selection actually changed. This effect READS
			// selectedModels and WRITES it, and `.map()` returns a fresh array
			// every run -- so an unconditional assignment re-triggers the
			// effect's own dependency forever. Svelte 5 aborts that with
			// effect_update_depth_exceeded, which tears down the reactive graph
			// for the whole chat route: the DOM still paints but nothing is
			// wired, so the page looks fine and ignores every click.
			// The legacy run() wrapper this was converted from tolerated the
			// self-write; $effect does not. Guard, don't revert.
			if (revalidated.some((model, i) => model !== selectedModels[i])) {
				selectedModels = revalidated;
			}
		}
	});
</script>

<div class="flex flex-col w-full items-start">
	<!-- no stable id on these entries; slots can repeat '' placeholders, so index is fine -->
	{#each selectedModels as _selectedModel, selectedModelIdx (selectedModelIdx)}
		<div class="flex w-full max-w-fit">
			<div class="overflow-hidden w-full">
				<div class="mr-1 max-w-full">
					<Selector
						id={`${selectedModelIdx}`}
						placeholder={$i18n.t('Select a model')}
						items={$models.map((model) => ({
							value: model.id,
							label: model.name,
							model: model
						}))}
						showTemporaryChatControl={$user.role === 'user'
							? ($user?.permissions?.chat?.temporary ?? true)
							: true}
						bind:value={selectedModels[selectedModelIdx]}
					/>
				</div>
			</div>

			{#if selectedModelIdx === 0}
				<div
					class="  self-center mx-1 disabled:text-gray-600 disabled:hover:text-gray-600 -translate-y-[0.5px]"
				>
					<Tooltip content={$i18n.t('Add Model')}>
						<button
							class=" "
							{disabled}
							onclick={() => {
								selectedModels = [...selectedModels, ''];
							}}
							aria-label="Add Model"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="size-3.5"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m6-6H6" />
							</svg>
						</button>
					</Tooltip>
				</div>
			{:else}
				<div
					class="  self-center mx-1 disabled:text-gray-600 disabled:hover:text-gray-600 -translate-y-[0.5px]"
				>
					<Tooltip content={$i18n.t('Remove Model')}>
						<button
							{disabled}
							onclick={() => {
								selectedModels.splice(selectedModelIdx, 1);
								selectedModels = selectedModels;
							}}
							aria-label="Remove Model"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="size-3"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12h-15" />
							</svg>
						</button>
					</Tooltip>
				</div>
			{/if}
		</div>
	{/each}
</div>

{#if showSetDefault}
	<div class=" absolute text-left mt-[1px] ml-1 text-[0.7rem] text-gray-500 font-primary">
		<button onclick={saveDefaultModel}> {$i18n.t('Set as default')}</button>
	</div>
{/if}
