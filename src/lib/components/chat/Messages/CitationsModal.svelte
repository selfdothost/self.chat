<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import { WEBUI_API_BASE_URL } from '$lib/constants';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		show?: boolean;
		/* eslint-disable @typescript-eslint/no-explicit-any */
		citation: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		showPercentage?: boolean;
		showRelevance?: boolean;
	}

	let {
		show = $bindable(false),
		citation,
		showPercentage = false,
		showRelevance = true
	}: Props = $props();

	// The old shape of this block was a self-writing $effect: it assigned
	// mergedDocuments, then READ it back (`.every`) and assigned it again. An
	// effect that writes what it reads loops forever; Svelte throws, nothing
	// catches it, and the whole route dies with a frozen modal shell on top —
	// the "empty modal that says Citation and won't close" report. Same class
	// as #61 (bare $state filled post-mount) and #33. Pure derivation instead:
	// evaluates eagerly, cannot loop, and `?? []` means {#each} never sees
	// undefined when a citation record arrives without a document array.
	let mergedDocuments = $derived.by(() => {
		if (!citation?.document) {
			return [];
		}

		const documents = citation.document.map((c, i) => {
			return {
				source: citation.source,
				document: c,
				metadata: citation.metadata?.[i],
				distance: citation.distances?.[i]
			};
		});

		if (documents.length > 0 && documents.every((doc) => doc.distance !== undefined)) {
			// Sort a copy — the mapped array is shared with the derived's own
			// output and in-place sort would make the derivation mutate state.
			return [...documents].sort(
				(a, b) => (b.distance ?? Infinity) - (a.distance ?? Infinity)
			);
		}

		return documents;
	});

	function calculatePercentage(distance: number) {
		if (distance < 0) return 0;
		if (distance > 1) return 100;
		return Math.round(distance * 10000) / 100;
	}

	function getRelevanceColor(percentage: number) {
		if (percentage >= 80)
			return 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200';
		if (percentage >= 60)
			return 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200';
		if (percentage >= 40)
			return 'bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200';
		return 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200';
	}
</script>

<Modal size="lg" bind:show>
	<div>
		<div class=" flex justify-between dark:text-gray-300 px-5 pt-4 pb-2">
			<div class=" text-lg font-medium self-center capitalize">
				{$i18n.t('Citation')}
			</div>
			<button
				type="button"
				aria-label={$i18n.t('Close')}
				class="self-center"
				onclick={() => {
					show = false;
				}}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="w-5 h-5"
				>
					<path
						d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
					/>
				</svg>
			</button>
		</div>

		<div class="flex flex-col md:flex-row w-full px-6 pb-5 md:space-x-4">
			<div
				class="flex flex-col w-full dark:text-gray-200 overflow-y-scroll max-h-[22rem] scrollbar-hidden"
			>
				{#if !citation}
					<!-- Opened without a selected citation yet: a real (brief) not-ready
					     state. A spinner here tells the user the modal is alive rather
					     than silently blank. -->
					<div class="flex flex-col items-center justify-center gap-3 py-10 text-gray-500">
						<Spinner className="size-5" />
						<span class="text-sm">{$i18n.t('Loading citation...')}</span>
					</div>
				{:else if mergedDocuments.length === 0}
					<!-- Distinct from loading: the citation exists but carries no
					     document chunks. Content is synchronous — nothing is coming,
					     and showing a spinner here would be a lie. -->
					<div class="flex flex-col items-center justify-center gap-2 py-10 text-gray-500">
						<span class="text-sm">{$i18n.t('No content available for this citation.')}</span>
					</div>
				{:else}
					{#each mergedDocuments as document, documentIdx (document.document)}
					<div class="flex flex-col w-full">
						<div class="text-sm font-medium dark:text-gray-300">
							{$i18n.t('Source')}
						</div>

						{#if document.source?.name}
							<Tooltip
								className="w-fit"
								content={$i18n.t('Open file')}
								placement="top-start"
								tippyOptions={{ duration: [500, 0] }}
							>
								<div class="text-sm dark:text-gray-400 flex items-center gap-2 w-fit">
									<a
										class="hover:text-gray-500 hover:dark:text-gray-100 underline grow"
										href={document?.metadata?.file_id
											? `${WEBUI_API_BASE_URL}/files/${document?.metadata?.file_id}/content${document?.metadata?.page !== undefined ? `#page=${document.metadata.page + 1}` : ''}`
											: document.source?.url?.includes('http')
												? document.source.url
												: `#`}
										target="_blank"
										rel="external"
									>
										{document?.metadata?.name ?? document.source.name}
									</a>
									{#if document?.metadata?.page}
										<span class="text-xs text-gray-500 dark:text-gray-400">
											({$i18n.t('page')}
											{document.metadata.page + 1})
										</span>
									{/if}
								</div>
							</Tooltip>
							{#if showRelevance}
								<div class="text-sm font-medium dark:text-gray-300 mt-2">
									{$i18n.t('Relevance')}
								</div>
								{#if document.distance !== undefined}
									<Tooltip
										className="w-fit"
										content={$i18n.t('Semantic distance to query')}
										placement="top-start"
										tippyOptions={{ duration: [500, 0] }}
									>
										<div class="text-sm my-1 dark:text-gray-400 flex items-center gap-2 w-fit">
											{#if showPercentage}
												{@const percentage = calculatePercentage(document.distance)}
												<span class={`px-1 rounded font-medium ${getRelevanceColor(percentage)}`}>
													{percentage.toFixed(2)}%
												</span>
												<span class="text-gray-500 dark:text-gray-500">
													({document.distance.toFixed(4)})
												</span>
											{:else}
												<span class="text-gray-500 dark:text-gray-500">
													{document.distance.toFixed(4)}
												</span>
											{/if}
										</div>
									</Tooltip>
								{:else}
									<div class="text-sm dark:text-gray-400">
										{$i18n.t('No distance available')}
									</div>
								{/if}
							{/if}
						{:else}
							<div class="text-sm dark:text-gray-400">
								{$i18n.t('No source available')}
							</div>
						{/if}
					</div>
					<div class="flex flex-col w-full">
						<div class=" text-sm font-medium dark:text-gray-300 mt-2">
							{$i18n.t('Content')}
						</div>
						{#if document.metadata?.html}
							<iframe
								class="w-full border-0 h-auto rounded-none"
								sandbox="allow-scripts allow-forms allow-same-origin"
								srcdoc={document.document}
								title={$i18n.t('Content')}
							></iframe>
						{:else}
							<pre class="text-sm dark:text-gray-400 whitespace-pre-line">
                {document.document}
              </pre>
						{/if}
					</div>

					{#if documentIdx !== mergedDocuments.length - 1}
						<hr class=" dark:border-gray-850 my-3" />
					{/if}
					{/each}
				{/if}
			</div>
		</div>
	</div>
</Modal>
