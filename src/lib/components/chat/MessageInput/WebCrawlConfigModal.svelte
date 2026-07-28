<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext, createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Modal from '$lib/components/common/Modal.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import { getKnowledgeBaseList } from '$lib/apis/knowledge';

	const i18n: Writable<i18nType> = getContext('i18n');
	const dispatch = createEventDispatcher();

	export let show = false;
	/** The currently bound knowledge base id, or '' when unset. */
	export let kbId = '';

	let loading = false;
	let loadFailed = false;
	// Local until saved, so cancelling never mutates the bound destination.
	let selected = '';
	let knowledgeBases: { id: string; name: string; description?: string }[] = [];

	// Deliberately /knowledge/list, not /knowledge/ — that endpoint filters to
	// bases the user has WRITE access to. A crawl writes into the base, so a
	// read-only one must never be offered here. The server re-checks write
	// access when the tool runs; this list is the convenience, not the boundary.
	const load = async () => {
		loading = true;
		loadFailed = false;
		const res = await getKnowledgeBaseList(localStorage.token).catch((e) => {
			toast.error(`${e}`);
			return null;
		});
		loading = false;
		if (res === null) {
			loadFailed = true;
			return;
		}
		knowledgeBases = res ?? [];
	};

	$: if (show) {
		selected = kbId;
		load();
	}

	const save = () => {
		if (!selected) return;
		kbId = selected;
		show = false;
		// The parent turns the toggle on: choosing a destination IS the intent,
		// so making the user then also find the switch would be busywork.
		dispatch('save', { kbId: selected });
	};

	const cancel = () => {
		show = false;
		// No selection made -> the parent leaves Web Crawl off. Enabling without
		// a destination is not a valid state, so we never enter it.
		dispatch('cancel');
	};
</script>

<Modal bind:show size="sm">
	<div class="px-5 pt-4 pb-4 w-full flex flex-col">
		<div class="text-lg font-medium mb-0.5 text-gray-900 dark:text-white">
			{$i18n.t('Configure Web Crawl')}
		</div>
		<div class="text-xs text-gray-500 dark:text-gray-400 mb-3">
			{$i18n.t(
				'Crawled pages are saved into the knowledge base you choose. Only knowledge bases you can write to are listed.'
			)}
		</div>

		{#if loading}
			<div class="flex justify-center py-6"><Spinner className="size-5" /></div>
		{:else if loadFailed}
			<div class="text-sm text-gray-500 dark:text-gray-400 py-4">
				{$i18n.t('Could not load knowledge bases.')}
				<button class="underline text-gray-900 dark:text-white" on:click={load}>
					{$i18n.t('Retry')}
				</button>
			</div>
		{:else if knowledgeBases.length === 0}
			<div class="text-sm text-gray-500 dark:text-gray-400 py-4">
				{$i18n.t(
					'You do not have write access to any knowledge base. Create one, or ask for write access, then try again.'
				)}
			</div>
		{:else}
			<div class="max-h-64 overflow-y-auto scrollbar-hidden -mx-1 px-1">
				{#each knowledgeBases as kb (kb.id)}
					<button
						class="w-full text-left px-3 py-2 rounded-xl mb-1 transition border {selected === kb.id
							? 'border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800'
							: 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'}"
						on:click={() => (selected = kb.id)}
					>
						<div class="text-sm font-medium line-clamp-1 text-gray-900 dark:text-white">{kb.name}</div>
						{#if kb.description}
							<div class="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
								{kb.description}
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		<div class="flex justify-end gap-2 mt-4">
			<button
				class="px-3.5 py-1.5 text-sm rounded-full border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white transition"
				on:click={cancel}
			>
				{$i18n.t('Cancel')}
			</button>
			<button
				class="px-3.5 py-1.5 text-sm rounded-full bg-black text-white dark:bg-white dark:text-black transition disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={!selected}
				on:click={save}
			>
				{$i18n.t('Save')}
			</button>
		</div>
	</div>
</Modal>
