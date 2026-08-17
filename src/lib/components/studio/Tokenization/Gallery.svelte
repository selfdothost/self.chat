<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { marked } from 'marked';

	import { getContext } from 'svelte';
	import { resolve } from '$app/paths';
	const i18n: Writable<i18nType> = getContext('i18n');

	import { models as _models, modelLoadStatus } from '$lib/stores';

	import Tooltip from '../../common/Tooltip.svelte';
	import ModelStatusDot from '../../common/ModelStatusDot.svelte';
	import Search from '../../icons/Search.svelte';
	import { isTokenizationSelectable, unavailableReason } from './selectable';

	// Tokenization Studio Shell R1 (build-site-tokenization-shell.md T-202).
	//
	// A deliberate FORK of studio/Models.svelte's presentation, not an import of
	// it. The kit is explicit that this is a PICKER, not a management surface, so
	// the create / edit / delete affordances are OMITTED rather than hidden behind
	// a flag — there is no prop that turns this into the management gallery, and
	// no code path here that can mutate a model.
	//
	// The one substantive difference from the gallery it forks is where a card
	// points: Models.svelte:246 links to `/?models=<id>`, the chat root with the
	// model preselected. This links into a tokenization session instead. That
	// single href is the whole reason the surface exists.

	let searchValue = $state('');

	// `meta` (profile image, description) is NOT declared on the `Model` union:
	// BaseModel has no such field and only some variants add it, so reading it
	// off the typed store is a type error. Studio-created models DO carry it on
	// the wire, which is why studio/Models.svelte can read it -- that file holds
	// its list in an untyped `$state([])`, so the access is unchecked rather than
	// safe. Rather than copy the untyped array, the shape actually read here is
	// declared, so the next person can see what is being assumed instead of
	// discovering it from a runtime undefined.
	type GalleryModel = {
		id: string;
		name: string;
		arena?: boolean;
		owned_by?: string;
		base_model_id?: string;
		status?: string;
		meta?: { profile_image_url?: string; description?: string };
	};

	// Derived, not an $effect that assigns to state. Models.svelte computes its
	// filtered list inside a subscription; deriving keeps the filter a pure
	// function of (models, searchValue) and avoids adding another
	// self-writing-effect hazard to this repo's collection.
	const filteredModels: GalleryModel[] = $derived(
		(($_models ?? []) as unknown as GalleryModel[]).filter(
			(m) =>
				searchValue === '' || (m?.name ?? '').toLowerCase().includes(searchValue.toLowerCase())
		)
	);
</script>

<div class="flex flex-col gap-1 my-1.5">
	<div class="flex justify-between items-center">
		<div class="flex items-center md:self-center text-xl font-medium px-0.5">
			{$i18n.t('Tokenization')}
			<div class="flex self-center w-[1px] h-6 mx-2.5 bg-gray-50 dark:bg-gray-850"></div>
			<span class="text-lg font-medium text-gray-500 dark:text-gray-300"
				>{filteredModels.length}</span
			>
		</div>
	</div>

	<div class=" flex flex-1 items-center w-full space-x-2">
		<div class="flex flex-1 items-center">
			<div class=" self-center ml-1 mr-3">
				<Search className="size-3.5" />
			</div>
			<input
				class=" w-full text-sm py-1 rounded-r-xl outline-hidden bg-transparent"
				bind:value={searchValue}
				placeholder={$i18n.t('Search Models')}
			/>
		</div>
		<!-- No create affordance. R1-AC4: this is a picker, not a management
		     surface. Models are created and edited in Studio > Models. -->
	</div>
</div>

<div class=" my-2 mb-5 gap-2 grid lg:grid-cols-2 xl:grid-cols-3" id="tokenization-model-list">
	{#each filteredModels as model (model.id)}
		<div
			class=" flex flex-col w-full px-3 py-2 dark:hover:bg-white/5 hover:bg-black/5 rounded-xl transition"
			id="tokenization-model-item-{model.id}"
		>
			<div class="flex gap-4 mt-0.5 mb-0.5">
				<div class=" w-[44px]">
					<div class=" rounded-full object-cover">
						<img
							src={model?.meta?.profile_image_url ?? '/static/favicon.png'}
							alt="model profile"
							class=" rounded-full w-full h-auto object-cover"
						/>
					</div>
				</div>

				{#if isTokenizationSelectable(model)}
					<a
						class=" flex flex-1 cursor-pointer w-full"
						href={resolve(
							`/(app)/studio/tokenization/session?models=${encodeURIComponent(model.id)}`
						)}
					>
						<div class=" flex-1 self-center">
						<Tooltip
							content={marked.parse(model?.meta?.description ?? model.id, { async: false })}
							className=" w-fit"
							placement="top-start"
						>
							<div class="flex items-center gap-1.5 font-semibold line-clamp-1">
								{model.name}
								<ModelStatusDot
									status={$modelLoadStatus[model.id] ??
										$modelLoadStatus[model?.base_model_id] ??
										model?.status}
								/>
							</div>
						</Tooltip>

						<div class="flex gap-1 text-xs overflow-hidden">
							<div class="line-clamp-1">
								{#if (model?.meta?.description ?? null) !== null}
									{model?.meta?.description}
								{:else}
									{model.id}
								{/if}
							</div>
							</div>
						</div>
					</a>
				{:else}
					<!-- Not a link, and carries no href at all: R1-AC3 requires these be
					     never selectable, not merely styled as though they were not. -->
					<div class=" flex flex-1 w-full opacity-50" data-unavailable={model.id}>
						<div class=" flex-1 self-center">
							<div class="flex items-center gap-1.5 font-semibold line-clamp-1">
								{model.name}
							</div>
							<div class="flex gap-1 text-xs overflow-hidden">
								<div class="line-clamp-1">{$i18n.t(unavailableReason(model) ?? '')}</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/each}
</div>

{#if filteredModels.length === 0}
	<div class="text-sm text-gray-500 dark:text-gray-400 px-1 py-2">
		{$i18n.t('No models found')}
	</div>
{/if}
