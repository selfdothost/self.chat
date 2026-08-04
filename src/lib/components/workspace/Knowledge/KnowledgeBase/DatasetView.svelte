<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { getHfDatasetInfo, getHfDatasetRows, getDatasetRows } from '$lib/apis/knowledge';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		knowledge: {
		id: string;
		description?: string;
		meta?: { curated?: boolean };
	};
		hfPath?: string;
	}

	let { knowledge, hfPath = '' }: Props = $props();

	let loading = $state(true);
	// Only the fields this view reads from the HF dataset-info response —
	// the actual response carries much more of the HF datasets-server schema.
	let info: {
		description?: string;
		format?: { type?: string };
		task_categories?: string[];
	} | null = $state(null);
	// Row shape is whatever columns the dataset happens to have — genuinely
	// per-dataset, rendered generically via cell() below.
	let preview: { columns: string[]; rows: Record<string, unknown>[] } = $state({ columns: [], rows: [] });

	const FORMAT_LABELS: Record<string, string> = {
		alpaca: 'Alpaca (instruction / output)',
		chat_template: 'Chat (role / content)',
		sharegpt: 'ShareGPT (from / value)',
		completion: 'Completion (text)'
	};

	const cell = (v: unknown) => {
		if (v === null || v === undefined) return '';
		const s = typeof v === 'string' ? v : JSON.stringify(v);
		return s.length > 220 ? s.slice(0, 220) + '…' : s;
	};

	// Curated datasets (curator output) have no hf_path, so meta.curated marks
	// them; sample their own local JSONL instead of HuggingFace.
	let isCurated = $derived(knowledge?.meta?.curated ?? false);

	onMount(async () => {
		if (hfPath) {
			const [i, p] = await Promise.all([
				getHfDatasetInfo(localStorage.token, hfPath).catch(() => null),
				getHfDatasetRows(localStorage.token, hfPath, 5).catch(() => ({ columns: [], rows: [] }))
			]);
			info = i;
			preview = p ?? { columns: [], rows: [] };
		} else if (knowledge?.id) {
			preview =
				(await getDatasetRows(localStorage.token, knowledge.id, 5).catch(() => ({
					columns: [],
					rows: []
				}))) ?? { columns: [], rows: [] };
		}
		loading = false;
	});

	// Prefer the KB's stored description; fall back to the HF-pulled one so even
	// datasets added before auto-fill still show a real description.
	let description =
		$derived(knowledge?.description && knowledge.description.trim()
			? knowledge.description
			: (info?.description ?? ''));
	let format = $derived(info?.format?.type ?? '');
	let tags = $derived(info?.task_categories ?? []);
</script>

<div class="w-full h-full overflow-auto px-1 py-2">
	<div class="flex flex-col gap-2">
		<div class="flex items-center gap-2 flex-wrap">
			{#if hfPath}
				<span
					class="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
				>
					{$i18n.t('HuggingFace Dataset')}
				</span>
			{:else}
				<span
					class="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium"
				>
					{$i18n.t(isCurated ? 'Curated Dataset' : 'Dataset')}
				</span>
			{/if}
			{#if format}
				<span
					class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
				>
					{FORMAT_LABELS[format] ?? format}
				</span>
			{/if}
			{#each tags as t (t)}
				<span class="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-50 dark:bg-gray-850 text-gray-500"
					>{t}</span
				>
			{/each}
		</div>

		{#if hfPath}
			<a
				href={`https://huggingface.co/datasets/${hfPath}`}
				target="_blank"
				rel="noreferrer"
				class="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline w-fit"
			>
				{hfPath} ↗
			</a>
		{/if}
	</div>

	{#if loading}
		<div class="mt-4 text-sm text-gray-400">{$i18n.t('Loading dataset details…')}</div>
	{:else}
		{#if description}
			<p class="mt-4 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap max-w-3xl">
				{description}
			</p>
		{/if}

		{#if preview.columns.length}
			<div class="mt-6">
				<div class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
					{$i18n.t('Sample rows')}
				</div>
				<div class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
					<table class="w-full text-xs">
						<thead>
							<tr class="bg-gray-50 dark:bg-gray-850 text-gray-500">
								{#each preview.columns as c (c)}
									<th class="text-left px-3 py-2 font-medium whitespace-nowrap">{c}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each preview.rows as row, i (i)}
								<!-- rows have no stable id (generic per-dataset preview data); index is fine, this is a static 5-row sample, never reordered/filtered -->
								<tr class="border-t border-gray-100 dark:border-gray-800 align-top">
									{#each preview.columns as c (c)}
										<td class="px-3 py-2 max-w-xs">{cell(row[c])}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{:else}
			<div class="mt-6 text-sm text-gray-400">
				{$i18n.t('No row preview available for this dataset.')}
			</div>
		{/if}
	{/if}
</div>
