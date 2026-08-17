<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import { settings, showSidebar } from '$lib/stores';
	import Tooltip from '../../common/Tooltip.svelte';
	import {
		effectiveSamplingParams,
		formatSamplingValue,
		truncationNotice,
		type ParamsBag
	} from './sampling';

	// Tokenization Studio Shell R3-AC5 — T-210.
	//
	// The sampler in effect, SHOWN rather than merely settable. See sampling.ts
	// for why that distinction is load-bearing: a distribution that cannot be
	// attributed to its sampler invites a false conclusion about the model.
	//
	// It reads, and never writes, the two params bags. The rail
	// (Controls > Advanced Params) remains the only place a sampling value is
	// changed; a second editor for the same values would be a second source of
	// truth. `top_logprobs` is the exception, and only because it belongs to this
	// surface alone -- it is not a chat param and the rail knows nothing about it.

	interface Props {
		/** The chat's own params bag, bound out of Chat. Rail edits land here. */
		sessionParams?: ParamsBag;
		/** How many alternatives the stream asks for per position. Bindable: this
		 *  is the session's own value, declared on the session page. */
		topLogprobs?: number;
	}

	let { sessionParams = {}, topLogprobs = $bindable(0) }: Props = $props();

	const rows = $derived(effectiveSamplingParams($settings?.params as ParamsBag, sessionParams));
	const notice = $derived(truncationNotice(rows, topLogprobs));

	let expanded = $state(false);
</script>

<!-- Fixed rather than in flow: Chat's own container is `h-screen`, so anything
     added above or below it would push the composer off the viewport. Offset by
     the sidebar's width the same way that container is. -->
<div
	class="fixed bottom-0 left-0 z-20 p-2 pointer-events-none {$showSidebar
		? 'md:left-[260px]'
		: ''}"
	id="tokenization-sampling-panel"
>
	<div
		class="pointer-events-auto max-w-xs rounded-xl bg-white/90 dark:bg-gray-850/90 backdrop-blur-sm border border-gray-100 dark:border-gray-800 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 shadow-xs"
	>
		<button
			type="button"
			class="flex items-center gap-1.5 w-full text-left font-medium"
			aria-expanded={expanded}
			onclick={() => (expanded = !expanded)}
		>
			<span>{$i18n.t('Sampler in effect')}</span>
			{#if notice}
				<Tooltip content={$i18n.t(notice)} placement="top-start">
					<span class="text-yellow-600 dark:text-yellow-400" aria-label={$i18n.t(notice)}>&#9888;</span
					>
				</Tooltip>
			{/if}
		</button>

		<!-- Always rendered, collapsed or not. R3-AC5 asks for the parameters to be
		     DISPLAYED; putting the values themselves behind a disclosure would make
		     them settable-and-hidden again, which is the state it rules out. -->
		<div class="flex flex-wrap gap-x-2 gap-y-0.5 mt-1" data-sampling-values>
			{#each rows as row (row.key)}
				<span
					class="whitespace-nowrap {row.value === null ? 'opacity-50' : ''}"
					data-sampling-param={row.key}
					data-sampling-source={row.source}
				>
					{$i18n.t(row.label)}
					<span class="font-medium">{formatSamplingValue(row.value)}</span>
				</span>
			{/each}
			<span class="whitespace-nowrap" data-sampling-param="top_logprobs">
				{$i18n.t('Alternatives')}
				<span class="font-medium">{topLogprobs}</span>
			</span>
		</div>

		{#if expanded}
			<div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-1">
				{#each rows.filter((r) => r.shadows !== undefined) as row (row.key)}
					<div class="text-yellow-700 dark:text-yellow-500">
						{$i18n.t(row.label)}: {$i18n.t('cleared for this session, overriding your saved')}
						{row.shadows}
					</div>
				{/each}

				{#if notice}
					<div class="text-yellow-700 dark:text-yellow-500">{$i18n.t(notice)}</div>
				{/if}

				<label class="flex items-center justify-between gap-2 mt-0.5">
					<span>{$i18n.t('Alternatives per token')}</span>
					<input
						class="w-16 text-right rounded-sm bg-transparent outline-hidden border border-gray-100 dark:border-gray-800 px-1 py-0.5"
						type="number"
						min="0"
						max="20"
						bind:value={topLogprobs}
					/>
				</label>

				<!-- Stated, not hidden: params configured on the MODEL are applied
				     server-side and are not part of the request body this panel
				     mirrors, so they cannot be shown here honestly. -->
				<div class="opacity-60">
					{$i18n.t('Values are the request’s; a model’s own defaults apply server-side.')}
				</div>
			</div>
		{/if}
	</div>
</div>
