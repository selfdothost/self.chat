<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { AutoModel, AutoTokenizer } from '@huggingface/transformers';

	import { onMount, getContext } from 'svelte';
	import { models } from '$lib/stores';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import MagnifyingGlass from '$lib/components/icons/MagnifyingGlass.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	const EMBEDDING_MODEL = 'TaylorAI/bge-micro-v2';

	let tokenizer = null;
	let model = null;

	let { feedbacks = [] } = $props();

	let rankedModels = $state([]);

	let query = $state('');

	// Unrated models (no arena feedback) are hidden by default: on a yard with
	// a hundred+ registered models and a handful of votes, the raw list is a
	// wall of dashes. The toggle reveals them for lookup.
	let showUnrated = $state(false);

	type SortKey = 'model' | 'rating' | 'won' | 'lost';
	let sortKey = $state<SortKey>('rating');
	let sortAsc = $state(false);

	// A memoization cache, mutated in place via .has()/.set() -- never read
	// by the template or a $: block, so Svelte never needs to observe its
	// mutations. SvelteMap would add proxy overhead for no benefit.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	let tagEmbeddings = new Map();
	let loadingLeaderboard = $state(true);
	let debounceTimer;

	// DUCT TAPE — semantic search fallback. The re-rank-by-topic path needs a
	// browser-side embedding model pulled from the HuggingFace CDN. On a yard
	// without egress that download never completes, and the original code left
	// the table dimmed (loadingLeaderboard stuck true) after any search. When
	// the model is unavailable — never loaded, or the fetch fails — we degrade
	// to a substring match on the model name instead of bricking the page.
	// Revisit: server-side embeddings behind the self.ai API.
	let embeddingsBroken = false;
	let nameQuery = $state('');

	type Feedback = {
		id: string;
		data: {
			rating: number;
			model_id: string;
			sibling_model_ids: string[] | null;
			reason: string;
			comment: string;
			tags: string[];
		};
		user: {
			name: string;
			profile_image_url: string;
		};
		updated_at: number;
	};

	type ModelStats = {
		rating: number;
		won: number;
		lost: number;
	};

	//////////////////////
	//
	// Rank models by Elo rating
	//
	//////////////////////

	const rankHandler = async (similarities: Map<string, number> = new Map()) => {
		const modelStats = calculateModelStats(feedbacks, similarities);

		const sorted = $models
			.filter((m) => m?.owned_by !== 'arena' && (m?.info?.meta?.hidden ?? false) !== true)
			.map((model) => {
				const stats = modelStats.get(model.id);
				return {
					...model,
					rating: stats ? Math.round(stats.rating) : '-',
					stats: {
						count: stats ? stats.won + stats.lost : 0,
						won: stats ? stats.won.toString() : '-',
						lost: stats ? stats.lost.toString() : '-'
					}
				};
			})
			.sort((a, b) => {
				// `rating` is `number | '-'` ('-' when a model has no feedback yet);
				// narrow via typeof rather than `!== '-'` so TS treats the arithmetic
				// branch below as numeric.
				const aRating = typeof a.rating === 'number' ? a.rating : null;
				const bRating = typeof b.rating === 'number' ? b.rating : null;
				if (aRating === null && bRating !== null) return 1;
				if (bRating === null && aRating !== null) return -1;
				if (aRating !== null && bRating !== null) return bRating - aRating;
				return a.name.localeCompare(b.name);
			});

		// Rank is position in the rating order, stamped here so re-sorting the
		// displayed rows by another column doesn't reshuffle the ranks.
		rankedModels = sorted.map((model, idx) => ({
			...model,
			rank: typeof model.rating === 'number' ? idx + 1 : null
		}));

		loadingLeaderboard = false;
	};

	const sortBy = (key: SortKey) => {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			// Name sorts A→Z first; numeric columns default to best-first.
			sortAsc = key === 'model';
		}
	};

	const sortIndicator = (key: SortKey) => (sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '');

	// What renders: unrated hidden unless toggled on, substring fallback applied
	// when semantic search is unavailable, then sorted by the chosen column.
	// Unrated rows always sink below rated ones — a dash is not a rating.
	let visibleModels = $derived.by(() => {
		let list = showUnrated
			? [...rankedModels]
			: rankedModels.filter((m) => typeof m.rating === 'number');

		if (nameQuery !== '') {
			const q = nameQuery;
			list = list.filter((m) => m.name.toLowerCase().includes(q));
		}

		// `rating` is `number | '-'`; `stats.won`/`stats.lost` are strings of
		// digits or '-'. Normalize both to `number | null`.
		const numeric = (v: number | string) => {
			if (typeof v === 'number') return v;
			return v !== '-' && v !== '' ? Number(v) : null;
		};
		const dir = sortAsc ? 1 : -1;
		list.sort((a, b) => {
			if (sortKey === 'model') return dir * a.name.localeCompare(b.name);
			// Sink unrated regardless of direction.
			const aRated = sortKey === 'rating' ? numeric(a.rating) : numeric(a.stats[sortKey]);
			const bRated = sortKey === 'rating' ? numeric(b.rating) : numeric(b.stats[sortKey]);
			if (aRated === null && bRated !== null) return 1;
			if (bRated === null && aRated !== null) return -1;
			if (aRated !== null && bRated !== null) return dir * (aRated - bRated);
			return a.name.localeCompare(b.name);
		});
		return list;
	});

	// Arena votes actually feeding the Elo table — shown in the footer so the
	// "updated in real-time" claim can be read against real volume.
	const totalVotes = $derived(
		feedbacks.filter((f) => f.data.rating === 1 || f.data.rating === -1).length
	);

	function calculateModelStats(
		feedbacks: Feedback[],
		similarities: Map<string, number>
	): Map<string, ModelStats> {
		// Function-local, built and returned synchronously -- never touches
		// component state or Svelte's reactivity at all.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const stats = new Map<string, ModelStats>();
		const K = 32;

		function getOrDefaultStats(modelId: string): ModelStats {
			return stats.get(modelId) || { rating: 1000, won: 0, lost: 0 };
		}

		function updateStats(modelId: string, ratingChange: number, outcome: number) {
			const currentStats = getOrDefaultStats(modelId);
			currentStats.rating += ratingChange;
			if (outcome === 1) currentStats.won++;
			else if (outcome === 0) currentStats.lost++;
			stats.set(modelId, currentStats);
		}

		function calculateEloChange(
			ratingA: number,
			ratingB: number,
			outcome: number,
			similarity: number
		): number {
			const expectedScore = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
			return K * (outcome - expectedScore) * similarity;
		}

		feedbacks.forEach((feedback) => {
			const modelA = feedback.data.model_id;
			const statsA = getOrDefaultStats(modelA);
			let outcome: number;

			switch (feedback.data.rating.toString()) {
				case '1':
					outcome = 1;
					break;
				case '-1':
					outcome = 0;
					break;
				default:
					return; // Skip invalid ratings
			}

			// If the query is empty, set similarity to 1, else get the similarity from the map
			const similarity = query !== '' ? similarities.get(feedback.id) || 0 : 1;
			const opponents = feedback.data.sibling_model_ids || [];

			opponents.forEach((modelB) => {
				const statsB = getOrDefaultStats(modelB);
				const changeA = calculateEloChange(statsA.rating, statsB.rating, outcome, similarity);
				const changeB = calculateEloChange(statsB.rating, statsA.rating, 1 - outcome, similarity);

				updateStats(modelA, changeA, outcome);
				updateStats(modelB, changeB, 1 - outcome);
			});
		});

		return stats;
	}

	//////////////////////
	//
	// Calculate cosine similarity
	//
	//////////////////////

	const cosineSimilarity = (vecA, vecB) => {
		// Ensure the lengths of the vectors are the same
		if (vecA.length !== vecB.length) {
			throw new Error('Vectors must be the same length');
		}

		// Calculate the dot product
		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < vecA.length; i++) {
			dotProduct += vecA[i] * vecB[i];
			normA += vecA[i] ** 2;
			normB += vecB[i] ** 2;
		}

		// Calculate the magnitudes
		normA = Math.sqrt(normA);
		normB = Math.sqrt(normB);

		// Avoid division by zero
		if (normA === 0 || normB === 0) {
			return 0;
		}

		// Return the cosine similarity
		return dotProduct / (normA * normB);
	};

	const calculateMaxSimilarity = (queryEmbedding, tagEmbeddings: Map<string, number[]>) => {
		let maxSimilarity = 0;
		for (const tagEmbedding of tagEmbeddings.values()) {
			const similarity = cosineSimilarity(queryEmbedding, tagEmbedding);
			maxSimilarity = Math.max(maxSimilarity, similarity);
		}
		return maxSimilarity;
	};

	//////////////////////
	//
	// Embedding functions
	//
	//////////////////////

	const loadEmbeddingModel = async () => {
		if (embeddingsBroken) return;
		try {
			// Check if the tokenizer and model are already loaded and stored in the window object
			if (!window.tokenizer) {
				window.tokenizer = await AutoTokenizer.from_pretrained(EMBEDDING_MODEL);
			}

			if (!window.model) {
				window.model = await AutoModel.from_pretrained(EMBEDDING_MODEL);
			}

			// Use the tokenizer and model from the window object
			tokenizer = window.tokenizer;
			model = window.model;

			// Pre-compute embeddings for all unique tags
			const allTags = new Set(feedbacks.flatMap((feedback) => feedback.data.tags || []));
			await getTagEmbeddings(Array.from(allTags));
		} catch (err) {
			// See the DUCT TAPE note above — HF CDN unreachable. Semantic
			// re-ranking is off for this session; search falls back to substring.
			embeddingsBroken = true;
			tokenizer = null;
			model = null;
			console.warn('Leaderboard: embedding model unavailable, using substring search.', err);
		}
	};

	const getEmbeddings = async (text: string) => {
		const tokens = await tokenizer(text);
		const output = await model(tokens);

		// Perform mean pooling on the last hidden states
		const embeddings = output.last_hidden_state.mean(1);
		return embeddings.ort_tensor.data;
	};

	const getTagEmbeddings = async (tags: string[]) => {
		// Function-local, built and returned synchronously -- never touches
		// component state or Svelte's reactivity at all.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const embeddings = new Map();
		for (const tag of tags) {
			if (!tagEmbeddings.has(tag)) {
				tagEmbeddings.set(tag, await getEmbeddings(tag));
			}
			embeddings.set(tag, tagEmbeddings.get(tag));
		}
		return embeddings;
	};

	const debouncedQueryHandler = async () => {
		loadingLeaderboard = true;

		if (query.trim() === '') {
			nameQuery = '';
			rankHandler();
			return;
		}

		clearTimeout(debounceTimer);

		debounceTimer = setTimeout(async () => {
			// Embeddings not loaded (search typed before focus finished loading,
			// or the CDN fetch failed) — substring fallback, see DUCT TAPE note.
			if (!tokenizer || !model) {
				nameQuery = query.trim().toLowerCase();
				rankHandler();
				return;
			}

			try {
				const queryEmbedding = await getEmbeddings(query);
				// Function-local, built then passed as a plain argument to
				// rankHandler() -- never touches component state or Svelte's
				// reactivity at all.
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				const similarities = new Map<string, number>();

				for (const feedback of feedbacks) {
					const feedbackTags = feedback.data.tags || [];
					const tagEmbeddings = await getTagEmbeddings(feedbackTags);
					const maxSimilarity = calculateMaxSimilarity(queryEmbedding, tagEmbeddings);
					similarities.set(feedback.id, maxSimilarity);
				}

				nameQuery = '';
				rankHandler(similarities);
			} catch {
				embeddingsBroken = true;
				tokenizer = null;
				model = null;
				nameQuery = query.trim().toLowerCase();
				rankHandler();
			}
		}, 1500); // Debounce for 1.5 seconds
	};

	// `void query` reads (and discards) query so this effect re-runs whenever it changes,
	// even though debouncedQueryHandler() doesn't itself reference it.
	$effect(() => {
		void query;
		debouncedQueryHandler();
	});

	onMount(async () => {
		rankHandler();
	});
</script>

<div class="mt-0.5 mb-2 gap-1 flex flex-col md:flex-row justify-between">
	<div class="flex md:self-center text-lg font-medium px-0.5 shrink-0 items-center">
		<div class=" gap-1">
			{$i18n.t('Leaderboard')}
		</div>

		<div class="flex self-center w-[1px] h-6 mx-2.5 bg-gray-50 dark:bg-gray-850"></div>

		<span class="text-lg font-medium text-gray-500 dark:text-gray-300 mr-1.5"
			>{visibleModels.length}</span
		>
	</div>

	<div class="flex items-center space-x-3">
		<label class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
			<input
				type="checkbox"
				class="rounded"
				bind:checked={showUnrated}
			/>
			{$i18n.t('Show unrated models')}
		</label>

		<div class="flex">
			<Tooltip content={$i18n.t('Re-rank models by topic similarity')}>
				<div class="flex flex-1">
					<div class=" self-center ml-1 mr-3">
						<MagnifyingGlass className="size-3" />
					</div>
					<input
						class=" w-full text-sm pr-4 py-1 rounded-r-xl outline-hidden bg-transparent"
						bind:value={query}
						placeholder={$i18n.t('Search')}
						onfocus={() => {
							loadEmbeddingModel();
						}}
					/>
				</div>
			</Tooltip>
		</div>
	</div>
</div>

<div class="scrollbar-hidden relative whitespace-nowrap overflow-x-auto max-w-full rounded pt-0.5">
	{#if loadingLeaderboard}
		<div class=" absolute top-0 bottom-0 left-0 right-0 flex">
			<div class="m-auto">
				<Spinner />
			</div>
		</div>
	{/if}
	{#if (visibleModels ?? []).length === 0}
		<div class="text-center text-xs text-gray-500 dark:text-gray-400 py-1">
			{$i18n.t('No models found')}
		</div>
	{:else}
		<table
			class="w-full text-sm text-left text-gray-500 dark:text-gray-400 table-auto max-w-full rounded {loadingLeaderboard
				? 'opacity-20'
				: ''}"
		>
			<thead
				class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-850 dark:text-gray-400 -translate-y-0.5"
			>
				<tr class="">
					<th scope="col" class="px-3 py-1.5 w-3">
						{$i18n.t('RK')}
					</th>
					<th
						scope="col"
						class="px-3 py-1.5 font-medium"
						aria-sort={sortKey === 'model' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
					>
						<button
							class="uppercase hover:text-gray-900 dark:hover:text-white cursor-pointer select-none"
							onclick={() => sortBy('model')}
						>
							{$i18n.t('Model')}{sortIndicator('model')}
						</button>
					</th>
					<th
						scope="col"
						class="px-3 py-1.5 text-right font-medium w-fit"
						aria-sort={sortKey === 'rating' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
					>
						<button
							class="uppercase hover:text-gray-900 dark:hover:text-white cursor-pointer select-none"
							onclick={() => sortBy('rating')}
						>
							{$i18n.t('Rating')}{sortIndicator('rating')}
						</button>
					</th>
					<th
						scope="col"
						class="px-3 py-1.5 text-right font-medium w-5"
						aria-sort={sortKey === 'won' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
					>
						<button
							class="uppercase hover:text-gray-900 dark:hover:text-white cursor-pointer select-none"
							onclick={() => sortBy('won')}
						>
							{$i18n.t('Won')}{sortIndicator('won')}
						</button>
					</th>
					<th
						scope="col"
						class="px-3 py-1.5 text-right font-medium w-5"
						aria-sort={sortKey === 'lost' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
					>
						<button
							class="uppercase hover:text-gray-900 dark:hover:text-white cursor-pointer select-none"
							onclick={() => sortBy('lost')}
						>
							{$i18n.t('Lost')}{sortIndicator('lost')}
						</button>
					</th>
				</tr>
			</thead>
			<tbody class="">
				{#each visibleModels as model (model.id)}
					<tr class="bg-white dark:bg-gray-900 dark:border-gray-850 text-xs group {model.rank === null ? 'opacity-60' : ''}">
						<td class="px-3 py-1.5 text-left font-medium text-gray-900 dark:text-white w-fit">
							<div class=" line-clamp-1">
								{model.rank ?? '-'}
							</div>
						</td>
						<td class="px-3 py-1.5 flex flex-col justify-center">
							<div class="flex items-center gap-2">
								<div class="shrink-0">
									<img
										src={model?.info?.meta?.profile_image_url ?? '/favicon.png'}
										alt={model.name}
										class="size-5 rounded-full object-cover shrink-0"
									/>
								</div>

								<div class="font-medium text-gray-800 dark:text-gray-200 pr-4">
									{model.name}
								</div>
							</div>
						</td>
						<td class="px-3 py-1.5 text-right font-medium text-gray-900 dark:text-white w-max">
							{model.rating}
						</td>

						<td class=" px-3 py-1.5 text-right font-semibold text-green-500">
							<div class=" w-10">
								{#if model.stats.won === '-'}
									-
								{:else}
									<span class="hidden group-hover:inline"
										>{((model.stats.won / model.stats.count) * 100).toFixed(1)}%</span
									>
									<span class=" group-hover:hidden">{model.stats.won}</span>
								{/if}
							</div>
						</td>

						<td class="px-3 py-1.5 text-right font-semibold text-red-500">
							<div class=" w-10">
								{#if model.stats.lost === '-'}
									-
								{:else}
									<span class="hidden group-hover:inline"
										>{((model.stats.lost / model.stats.count) * 100).toFixed(1)}%</span
									>
									<span class=" group-hover:hidden">{model.stats.lost}</span>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<div class=" text-gray-500 text-xs mt-1.5 w-full flex justify-end">
	<div class=" text-right">
		<div class="line-clamp-1">
			ⓘ {$i18n.t(
				'The evaluation leaderboard is based on the Elo rating system and is updated in real-time.'
			)}
		</div>
		<div class="line-clamp-1">
			{$i18n.t('Based on {{count}} arena votes.', { count: totalVotes })}
		</div>
		{$i18n.t(
			'The leaderboard is currently in beta, and we may adjust the rating calculations as we refine the algorithm.'
		)}
	</div>
</div>
