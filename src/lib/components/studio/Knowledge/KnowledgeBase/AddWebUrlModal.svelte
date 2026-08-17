<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { preventDefault } from 'svelte/legacy';
	import { toast } from 'svelte-sonner';
	import { getContext } from 'svelte';

	import Modal from '$lib/components/common/Modal.svelte';
	import { isValidHttpUrl } from '$lib/utils';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		show?: boolean;
		/* eslint-disable @typescript-eslint/no-explicit-any */
		onSubmit?: (detail: any) => void;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		onCancel?: () => void;
		loading?: boolean;
		title?: string;
		/** when true, parent controls closing after submit */
		managedClose?: boolean;
		showLimitInput?: boolean;
		showMaxDepthInput?: boolean;
		showPollIntervalInput?: boolean;
		showMax403Input?: boolean;
		showIncludePathsInput?: boolean;
		showExcludePathsInput?: boolean;
		showRegexOnFullUrlInput?: boolean;
		showCrawlEntireDomainInput?: boolean;
		showBatchSizeInput?: boolean;
		/** when true, show logs only (no form) */
		viewOnly?: boolean;
		crawlProgress?: { completed: number; total: number; savedCount?: number } | null;
		crawlLogs?: string[];
	}

	let {
		// $bindable: KnowledgeBase.svelte mounts this with `bind:show`, and
		// closeModal() below assigns `show = false` from inside. Without
		// $bindable that write would not reach the parent and the modal would
		// never close.
		show = $bindable(false),
		onSubmit = (_detail) => {},
		onCancel = () => {},
		loading = false,
		title = 'Scrape a webpage',
		managedClose = false,
		showLimitInput = false,
		showMaxDepthInput = false,
		showPollIntervalInput = false,
		showMax403Input = false,
		showIncludePathsInput = false,
		showExcludePathsInput = false,
		showRegexOnFullUrlInput = false,
		showCrawlEntireDomainInput = false,
		showBatchSizeInput = false,
		viewOnly = false,
		crawlProgress = null,
		crawlLogs = []
	}: Props = $props();

	let url = $state('');
	let limit = $state(10);
	let maxDepth = $state(3);
	let crawlDelay = $state(2);
	let max403s = $state(5);
	let includePaths = $state('');
	let excludePaths = $state('');
	let regexOnFullUrl = $state(false);
	let crawlEntireDomain = $state(false);
	let batchSize = $state(10);
	let logEl: HTMLDivElement | null = $state(null);

	// Auto-scroll the log to the bottom as lines arrive.
	//
	// Was afterUpdate(), which runes mode removes entirely -- that is the single
	// reason the codemod refused this file (@migration-task banner, now gone).
	// afterUpdate ran after EVERY update; this runs when the log actually
	// changes, which is the only case that needed it.
	//
	// lineCount is read into a variable and then USED, rather than touched as a
	// bare `crawlLogs.length;` statement: an $effect only tracks what it reads,
	// so the read has to happen, but a bare expression statement fails eslint's
	// no-unused-expressions (which is a blocking job here).
	//
	// Safe against the self-write loop that took down the chat route (#33): this
	// writes scrollTop, a DOM property, and never assigns to reactive state it
	// reads.
	$effect(() => {
		const lineCount = crawlLogs.length;
		if (lineCount > 0 && logEl) logEl.scrollTop = logEl.scrollHeight;
	});

	const closeModal = () => {
		show = false;
		url = '';
		limit = 10;
		maxDepth = 3;
		crawlDelay = 2;
		max403s = 5;
		includePaths = '';
		excludePaths = '';
		regexOnFullUrl = false;
		crawlEntireDomain = false;
		batchSize = 10;
	};

	// Prepend https:// when the user omits a scheme (e.g. "example.com"), so a
	// bare hostname isn't rejected. Matches any "<scheme>://" prefix and leaves
	// it alone; only schemeless input gets https://. Runs on blur (so the field
	// visibly fills in) and again on submit as a backstop.
	const normalizeUrl = () => {
		const trimmed = url.trim();
		if (trimmed !== '' && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
			url = `https://${trimmed}`;
		}
	};

	const submitHandler = () => {
		normalizeUrl();
		const trimmedUrl = url.trim();

		if (!isValidHttpUrl(trimmedUrl)) {
			toast.error($i18n.t('URL invalid. Please try again.'));
			return;
		}

		onSubmit({
			url: trimmedUrl, limit, maxDepth, crawlDelay, max403s,
			includePaths: includePaths.split(',').map((s) => s.trim()).filter(Boolean),
			excludePaths: excludePaths.split(',').map((s) => s.trim()).filter(Boolean),
			regexOnFullUrl,
			crawlEntireDomain,
			batchSize,
		});
		if (!managedClose) closeModal();
	};

	const cancelHandler = () => {
		if (viewOnly) {
			closeModal();
		} else if (loading && managedClose) {
			onCancel();
		} else {
			closeModal();
		}
	};
</script>

<Modal size="sm" bind:show>
	<div class="px-5 pt-4 pb-5 dark:text-gray-200">
		<div class="flex items-center justify-between pb-3">
			<div class="text-lg font-medium">
				{$i18n.t(viewOnly ? 'Crawl logs' : title)}
			</div>

			<button
				type="button"
				class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
				onclick={cancelHandler}
			>
				{$i18n.t('Cancel')}
			</button>
		</div>

		{#if viewOnly}
			<div class="flex flex-col gap-4">
				{#if crawlLogs.length > 0}
					<div
						bind:this={logEl}
						class="text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 h-48 overflow-y-auto flex flex-col gap-0.5"
					>
						<!-- log lines can repeat verbatim (e.g. duplicate page titles); list only ever appends, never reorders/filters -->
						{#each crawlLogs as entry, entryIdx (entryIdx)}
							<div class="text-gray-500 dark:text-gray-400 leading-tight">{entry}</div>
						{/each}
					</div>
				{:else}
					<div class="text-xs text-gray-400 text-center py-4">{$i18n.t('No logs available.')}</div>
				{/if}
				<div class="flex justify-end text-sm font-medium">
					<button
						type="button"
						class="px-3.5 py-2 rounded-full bg-black text-white dark:bg-white dark:text-black"
						onclick={closeModal}
					>
						{$i18n.t('Close')}
					</button>
				</div>
			</div>
		{:else}
			<form class="flex flex-col gap-4" onsubmit={preventDefault(submitHandler)}>
				<div>
					<div class="mb-1 text-xs text-gray-500">{$i18n.t('URL')}</div>
					<input
						type="text"
						inputmode="url"
						bind:value={url}
						onblur={normalizeUrl}
						placeholder="example.com"
						class="w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-hidden border border-gray-200 dark:border-gray-700 disabled:opacity-50"
						autocomplete="off"
						disabled={loading}
					/>
				</div>

				{#if showLimitInput}
					<div>
						<div class="mb-1 text-xs text-gray-500">{$i18n.t('Max pages')}</div>
						<input
							type="number"
							bind:value={limit}
							min="1"
							max="500"
							class="w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-hidden border border-gray-200 dark:border-gray-700 disabled:opacity-50"
							disabled={loading}
						/>
					</div>
				{/if}

				{#if showMaxDepthInput}
					<div>
						<div class="mb-1 text-xs text-gray-500">{$i18n.t('Max depth')}</div>
						<input
							type="number"
							bind:value={maxDepth}
							min="1"
							max="10"
							class="w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-hidden border border-gray-200 dark:border-gray-700 disabled:opacity-50"
							disabled={loading}
						/>
					</div>
				{/if}

				{#if showPollIntervalInput}
					<div>
						<div class="mb-1 text-xs text-gray-500">{$i18n.t('Crawl delay (seconds)')}</div>
						<input
							type="number"
							bind:value={crawlDelay}
							min="1"
							class="w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-hidden border border-gray-200 dark:border-gray-700 disabled:opacity-50"
							disabled={loading}
						/>
					</div>
				{/if}

				{#if showMax403Input}
					<div>
						<div class="mb-1 text-xs text-gray-500">{$i18n.t('Cancel after n consecutive 403s (0 = disabled)')}</div>
						<input
							type="number"
							bind:value={max403s}
							min="0"
							class="w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-hidden border border-gray-200 dark:border-gray-700 disabled:opacity-50"
							disabled={loading}
						/>
					</div>
				{/if}

				{#if showIncludePathsInput}
					<div>
						<div class="mb-1 text-xs text-gray-500">{$i18n.t('Include paths (comma-separated regex, e.g. /docs/.*, /blog/.*)')}</div>
						<input
							type="text"
							bind:value={includePaths}
							placeholder="/docs/.*"
							class="w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-hidden border border-gray-200 dark:border-gray-700 disabled:opacity-50"
							disabled={loading}
						/>
					</div>
				{/if}

				{#if showExcludePathsInput}
					<div>
						<div class="mb-1 text-xs text-gray-500">{$i18n.t('Exclude paths (comma-separated regex, e.g. /admin/.*, /login)')}</div>
						<input
							type="text"
							bind:value={excludePaths}
							placeholder="/admin/.*"
							class="w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-hidden border border-gray-200 dark:border-gray-700 disabled:opacity-50"
							disabled={loading}
						/>
					</div>
				{/if}

				{#if showRegexOnFullUrlInput}
					<label class="flex items-center gap-2 cursor-pointer select-none">
						<input
							type="checkbox"
							bind:checked={regexOnFullUrl}
							disabled={loading}
							class="rounded border-gray-300 dark:border-gray-600 disabled:opacity-50"
						/>
						<span class="text-sm text-gray-700 dark:text-gray-300">{$i18n.t('Match patterns against full URL (including query params)')}</span>
					</label>
				{/if}

				{#if showCrawlEntireDomainInput}
					<label class="flex items-center gap-2 cursor-pointer select-none">
						<input
							type="checkbox"
							bind:checked={crawlEntireDomain}
							disabled={loading}
							class="rounded border-gray-300 dark:border-gray-600 disabled:opacity-50"
						/>
						<span class="text-sm text-gray-700 dark:text-gray-300">{$i18n.t('Crawl entire domain (follow parent/sibling links)')}</span>
					</label>
				{/if}

				{#if showBatchSizeInput}
					<div>
						<div class="mb-1 text-xs text-gray-500">{$i18n.t('Pages per embedding batch')}</div>
						<input
							type="number"
							bind:value={batchSize}
							min="1"
							max="100"
							class="w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-hidden border border-gray-200 dark:border-gray-700 disabled:opacity-50"
							disabled={loading}
						/>
					</div>
				{/if}

				{#if loading}
					<div class="text-xs text-gray-400 text-center py-1">
						{#if crawlProgress && crawlProgress.savedCount !== undefined && crawlProgress.completed > 0 && crawlProgress.completed >= crawlProgress.total && crawlProgress.total > 0}
							{$i18n.t('Saving…')} {crawlProgress.savedCount} / {crawlProgress.completed} {$i18n.t('pages embedded')}
						{:else if crawlProgress && crawlProgress.total > 0}
							{crawlProgress.completed} / {crawlProgress.total} {$i18n.t('pages scraped')}
						{:else}
							{$i18n.t('Starting crawl…')}
						{/if}
					</div>

					{#if crawlLogs.length > 0}
						<div
							bind:this={logEl}
							class="text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 h-36 overflow-y-auto flex flex-col gap-0.5"
						>
							<!-- log lines can repeat verbatim (e.g. duplicate page titles); list only ever appends, never reorders/filters -->
							{#each crawlLogs as entry, entryIdx (entryIdx)}
								<div class="text-gray-500 dark:text-gray-400 leading-tight">{entry}</div>
							{/each}
						</div>
					{/if}
				{/if}

				<div class="flex justify-end gap-2 text-sm font-medium">
					<button
						type="button"
						class="px-3.5 py-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
						onclick={closeModal}
					>
						{$i18n.t('Close')}
					</button>

					<button
						type="submit"
						class="px-3.5 py-2 rounded-full bg-black text-white dark:bg-white dark:text-black disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
						disabled={loading}
					>
						{#if loading}
							<svg class="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
							</svg>
							{$i18n.t('Crawling…')}
						{:else}
							{$i18n.t('Save')}
						{/if}
					</button>
				</div>
			</form>
		{/if}
	</div>
</Modal>
