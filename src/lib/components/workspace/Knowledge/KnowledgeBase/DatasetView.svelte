<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { getHfDatasetInfo, getHfDatasetRows, getDatasetRows } from '$lib/apis/knowledge';

	const i18n: any = getContext('i18n');

	export let knowledge: any;
	export let hfPath: string = '';

	let loading = true;
	let info: any = null;
	let preview: { columns: string[]; rows: any[] } = { columns: [], rows: [] };

	const FORMAT_LABELS: Record<string, string> = {
		alpaca: 'Alpaca (instruction / output)',
		chat_template: 'Chat (role / content)',
		sharegpt: 'ShareGPT (from / value)',
		completion: 'Completion (text)'
	};

	const cell = (v: any) => {
		if (v === null || v === undefined) return '';
		const s = typeof v === 'string' ? v : JSON.stringify(v);
		return s.length > 220 ? s.slice(0, 220) + '…' : s;
	};

	// Curated datasets (curator output) have no hf_path, so meta.curated marks
	// them; sample their own local JSONL instead of HuggingFace.
	$: isCurated = knowledge?.meta?.curated ?? false;

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
	$: description =
		knowledge?.description && knowledge.description.trim()
			? knowledge.description
			: (info?.description ?? '');
	$: format = info?.format?.type ?? '';
	$: tags = info?.task_categories ?? [];
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
			{#each tags as t}
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
								{#each preview.columns as c}
									<th class="text-left px-3 py-2 font-medium whitespace-nowrap">{c}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each preview.rows as row}
								<tr class="border-t border-gray-100 dark:border-gray-800 align-top">
									{#each preview.columns as c}
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
