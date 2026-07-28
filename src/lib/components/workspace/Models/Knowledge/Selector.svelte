<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import Fuse from 'fuse.js';

	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import { onMount, getContext, createEventDispatcher } from 'svelte';
	import { knowledge } from '$lib/stores';
	import Dropdown from '$lib/components/common/Dropdown.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');
	const dispatch = createEventDispatcher();

	export let onClose: AnyFn = () => {};

	let query = '';

	let items = [];
	let filteredItems = [];

	let fuse = null;
	$: if (fuse) {
		filteredItems = query
			? fuse.search(query).map((e) => {
					return e.item;
				})
			: items;
	}

	// Synthetic "legacy collection" entries built below don't come from the
	// `knowledge` store's Document type, but get merged into the same `items`
	// array as real Documents -- `meta` is optional here (and never actually
	// populated on these synthetic entries) purely so that union member access
	// like `item?.meta?.document` type-checks against both halves.
	type LegacyCollection = {
		name: string;
		legacy: boolean;
		type: string;
		description: string;
		title?: string;
		collection_names: string[];
		meta?: { document?: boolean; tags?: { name: string }[] };
	};

	onMount(() => {
		let legacy_documents = $knowledge.filter((item) => item?.meta?.document);
		let legacy_collections: LegacyCollection[] =
			legacy_documents.length > 0
				? [
						{
							name: 'All Documents',
							legacy: true,
							type: 'collection',
							description: 'Deprecated (legacy collection), please create a new knowledge base.',

							title: $i18n.t('All Documents'),
							collection_names: legacy_documents.map((item) => item.id)
						},

						...legacy_documents
							.reduce((a, item) => {
								return [...new Set([...a, ...(item?.meta?.tags ?? []).map((tag) => tag.name)])];
							}, [])
							.map((tag) => ({
								name: tag,
								legacy: true,
								type: 'collection',
								description: 'Deprecated (legacy collection), please create a new knowledge base.',

								collection_names: legacy_documents
									.filter((item) => (item?.meta?.tags ?? []).map((tag) => tag.name).includes(tag))
									.map((item) => item.id)
							}))
					]
				: [];

		items = [...$knowledge, ...legacy_collections].map((item) => {
			// `meta.legacy` isn't part of either union member's declared `meta`
			// shape (Document's or LegacyCollection's) -- this is a defensive
			// belt-and-suspenders check against backend payloads that may carry
			// it dynamically, so it's read via a narrow structural cast rather
			// than widening the shared Document type for one optional field.
			const meta = item?.meta as { legacy?: boolean; document?: boolean } | undefined;
			return {
				...item,
				...(item?.legacy || meta?.legacy || meta?.document ? { legacy: true } : {}),
				type: meta?.document ? 'document' : 'collection'
			};
		});

		fuse = new Fuse(items, {
			keys: ['name', 'description']
		});
	});
</script>

<Dropdown
	on:change={(e) => {
		if (e.detail === false) {
			onClose();
			query = '';
		}
	}}
>
	<slot />

	<div slot="content">
		<DropdownMenuContent
			class="w-full max-w-80 rounded-lg px-1 py-1.5 border border-gray-300/30 dark:border-gray-700/50 z-[10000] bg-white dark:bg-gray-850 dark:text-white shadow-lg"
			sideOffset={8}
			side="bottom"
			align="start"
		>
			<div class=" flex w-full space-x-2 py-0.5 px-2">
				<div class="flex flex-1">
					<div class=" self-center ml-1 mr-3">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="w-4 h-4"
						>
							<path
								fill-rule="evenodd"
								d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<input
						class=" w-full text-sm pr-4 py-1 rounded-r-xl outline-none bg-transparent"
						bind:value={query}
						placeholder={$i18n.t('Search Knowledge')}
					/>
				</div>
			</div>

			<hr class=" border-gray-50 dark:border-gray-700 my-1.5" />

			<div class="max-h-48 overflow-y-scroll">
				{#if filteredItems.length === 0}
					<div class="text-center text-sm text-gray-500 dark:text-gray-400">
						{$i18n.t('No knowledge found')}
					</div>
				{:else}
					{#each filteredItems as item (item.id ?? item.name)}
						<DropdownMenu.Item
							class="flex gap-2.5 items-center px-3 py-2 text-sm  cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
							onSelect={() => {
								dispatch('select', item);
							}}
						>
							<div class="flex items-center">
								<div class="flex flex-col">
									<div class=" w-fit mb-0.5">
										{#if item.legacy}
											<div
												class="bg-gray-500/20 text-gray-700 dark:text-gray-200 rounded uppercase text-xs font-bold px-1"
											>
												Legacy
											</div>
										{:else if item?.meta?.document}
											<div
												class="bg-gray-500/20 text-gray-700 dark:text-gray-200 rounded uppercase text-xs font-bold px-1"
											>
												Document
											</div>
										{:else}
											<div
												class="bg-green-500/20 text-green-700 dark:text-green-200 rounded uppercase text-xs font-bold px-1"
											>
												Collection
											</div>
										{/if}
									</div>

									<div class="line-clamp-1 font-medium pr-0.5">
										{item.name}
									</div>
								</div>
							</div>
						</DropdownMenu.Item>
					{/each}
				{/if}
			</div>
		</DropdownMenuContent>
	</div>
</Dropdown>
