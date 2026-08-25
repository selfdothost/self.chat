<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import CitationsModal from './CitationsModal.svelte';
	import Collapsible from '$lib/components/common/Collapsible.svelte';
	import ChevronDown from '$lib/components/icons/ChevronDown.svelte';
	import ChevronUp from '$lib/components/icons/ChevronUp.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	// RAG source/citation records vary by retrieval backend — document
	// entries and metadata are read positionally/dynamically, never
	// through one fixed interface.
	type Citation = {
		id?: string;
		document: unknown[];
		metadata?: Record<string, unknown>[];
		distances?: number[];
		source?: Record<string, unknown>;
	};

	interface Props {
		sources?: Citation[];
	}

	let { sources = [] }: Props = $props();

	let showCitationModal = $state(false);
	let selectedCitation: Citation | null = $state(null);
	let isCollapsibleOpen = $state(false);

	function calculateShowRelevance(sources: Citation[]) {
		const distances = sources.flatMap((citation) => citation.distances ?? []);
		const inRange = distances.filter((d) => d !== undefined && d >= -1 && d <= 1).length;
		const outOfRange = distances.filter((d) => d !== undefined && (d < -1 || d > 1)).length;

		if (distances.length === 0) {
			return false;
		}

		if (
			(inRange === distances.length - 1 && outOfRange === 1) ||
			(outOfRange === distances.length - 1 && inRange === 1)
		) {
			return false;
		}

		return true;
	}

	function shouldShowPercentage(sources: Citation[]) {
		const distances = sources.flatMap((citation) => citation.distances ?? []);
		return distances.every((d) => d !== undefined && d >= -1 && d <= 1);
	}

	// $derived evaluates eagerly on first read — no undefined window between
	// mount and the first $effect tick, which previously threw
	// "Cannot read properties of undefined (reading 'length')" and blanked the
	// whole chat page (issue #61).
	let citations = $derived(
		sources.reduce((acc, source) => {
			if (Object.keys(source).length === 0) {
				return acc;
			}

			// Guard: a source record may have keys but no document array
			// (e.g. a zero-file KB attached model). The Object.keys check above
			// only catches completely empty objects.
			if (!source.document) {
				return acc;
			}

			source.document.forEach((document, index) => {
				const metadata = source.metadata?.[index];
				const distance = source.distances?.[index];

				// Within the same citation there could be multiple documents.
				// `metadata` is dynamic per the RAG backend (see Citation type above),
				// but `source` is always a string (a URL or backend-assigned id) when present.
				const id = (metadata?.source ?? 'N/A') as string;
				let _source = source?.source;

				if (metadata?.name) {
					_source = { ..._source, name: metadata.name };
				}

				if (id.startsWith('http://') || id.startsWith('https://')) {
					_source = { ..._source, name: id, url: id };
				}

				const existingSource = acc.find((item) => item.id === id);

				if (existingSource) {
					existingSource.document.push(document);
					existingSource.metadata.push(metadata);
					if (distance !== undefined) existingSource.distances.push(distance);
				} else {
					acc.push({
						id: id,
						source: _source,
						document: [document],
						metadata: metadata ? [metadata] : [],
						distances: distance !== undefined ? [distance] : undefined
					});
				}
			});
			return acc;
		}, [] as Citation[])
	);

	let showRelevance = $derived(calculateShowRelevance(citations));
	let showPercentage = $derived(shouldShowPercentage(citations));
</script>

<CitationsModal
	bind:show={showCitationModal}
	citation={selectedCitation}
	{showPercentage}
	{showRelevance}
/>

{#if citations.length > 0}
	<div class=" py-0.5 -mx-0.5 w-full flex gap-1 items-center flex-wrap">
		{#if citations.length <= 3}
			<div class="flex text-xs font-medium">
				{#each citations as citation, idx (citation.id)}
					<button
						id={`source-${citation.source.name}`}
						class="no-toggle outline-hidden flex dark:text-gray-300 p-1 bg-white dark:bg-gray-900 rounded-xl max-w-96"
						onclick={() => {
							showCitationModal = true;
							selectedCitation = citation;
						}}
					>
						{#if citations.every((c) => c.distances !== undefined)}
							<div class="bg-gray-50 dark:bg-gray-800 rounded-full size-4">
								{idx + 1}
							</div>
						{/if}
						<div
							class="flex-1 mx-1 line-clamp-1 text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white transition"
						>
							{citation.source.name}
						</div>
					</button>
				{/each}
			</div>
		{:else}
			<Collapsible bind:open={isCollapsibleOpen} className="w-full">
				<div
					class="flex items-center gap-2 text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition cursor-pointer"
				>
					<div class="grow flex items-center gap-1 overflow-hidden">
						<span class="whitespace-nowrap hidden sm:inline">{$i18n.t('References from')}</span>
						<div class="flex items-center">
							<div class="flex text-xs font-medium items-center">
								{#each citations.slice(0, 2) as citation, idx (citation.id)}
									<button
										class="no-toggle outline-hidden flex dark:text-gray-300 p-1 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-850 transition rounded-xl max-w-96"
										onclick={() => {
											showCitationModal = true;
											selectedCitation = citation;
										}}
										onpointerup={(e) => {
											e.stopPropagation();
										}}
									>
										{#if citations.every((c) => c.distances !== undefined)}
											<div class="bg-gray-50 dark:bg-gray-800 rounded-full size-4">
												{idx + 1}
											</div>
										{/if}
										<div class="flex-1 mx-1 line-clamp-1 truncate">
											{citation.source.name}
										</div>
									</button>
								{/each}
							</div>
						</div>
						<div class="flex items-center gap-1 whitespace-nowrap">
							<span class="hidden sm:inline">{$i18n.t('and')}</span>
							{citations.length - 2}
							<span>{$i18n.t('more')}</span>
						</div>
					</div>
					<div class="shrink-0">
						{#if isCollapsibleOpen}
							<ChevronUp strokeWidth="3.5" className="size-3.5" />
						{:else}
							<ChevronDown strokeWidth="3.5" className="size-3.5" />
						{/if}
					</div>
				</div>
				{#snippet content()}
								<div >
						<div class="flex text-xs font-medium">
							{#each citations as citation, idx (citation.id)}
								<button
									class="no-toggle outline-hidden flex dark:text-gray-300 p-1 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-850 transition rounded-xl max-w-96"
									onclick={() => {
									showCitationModal = true;
									selectedCitation = citation;
								}}
								>
									{#if citations.every((c) => c.distances !== undefined)}
										<div class="bg-gray-50 dark:bg-gray-800 rounded-full size-4">
											{idx + 1}
										</div>
									{/if}
									<div class="flex-1 mx-1 line-clamp-1 truncate">
										{citation.source.name}
									</div>
								</button>
							{/each}
						</div>
					</div>
							{/snippet}
			</Collapsible>
		{/if}
	</div>
{/if}
