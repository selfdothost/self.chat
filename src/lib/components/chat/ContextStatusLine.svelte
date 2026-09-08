<script lang="ts">
	// Context utilization status line, rendered under the chat composer via
	// MessageInput's composerFooter snippet (both the Chat and Placeholder
	// instances pass it, so it shows on fresh and ongoing chats alike).
	//
	// Everything here is DERIVED state ($derived from props + stores) — no
	// $effect, nothing writes back. The math lives in
	// $lib/utils/context-status so it is testable without a component.

	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';

	import { contextBar, contextStatus, formatTokens } from '$lib/utils/context-status';
	import { models } from '$lib/stores';
	import Tooltip from '$lib/components/common/Tooltip.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		history: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		selectedModels: string[];
		/** The composer's current draft — it rides on top of the measured
		 * footprint because the next request will carry it. */
		promptDraft?: string;
		/** Shown as "(auto)" — armed by the parent's auto-compact setting. */
		autoCompactArmed?: boolean;
		/** Manual compaction trigger. The parent owns the history surgery;
		 * this component only offers the affordance. */
		onCompact?: () => void;
		/** Parent-computed: nothing compactable, or a compaction in flight. */
		compactDisabled?: boolean;
		/** Why the control is disabled, shown on hover. */
		compactDisabledReason?: string;
	}

	let {
		history,
		selectedModels,
		promptDraft = '',
		autoCompactArmed = false,
		onCompact = undefined,
		compactDisabled = true,
		compactDisabledReason = ''
	}: Props = $props();

	const status = $derived(
		contextStatus({
			history,
			modelId: selectedModels?.[0] ?? null,
			models: $models,
			promptDraft
		})
	);

	const inUseLabel = $derived(
		`${status.provenance === 'estimated' ? '≈' : ''}${formatTokens(status.contextInUse)}`
	);

	const breakdown = $derived(
		status.turns.map((turn) => `↑${turn.promptTokens ?? '—'} ↓${turn.completionTokens ?? '—'}`).join(' · ')
	);

	const tooltip = $derived(
		[
			$i18n.t('Tokens of context the next request will carry (↑) and tokens received so far (↓).'),
			status.provenance === 'measured'
				? $i18n.t('measured from the last response')
				: status.provenance === 'estimated'
					? $i18n.t('estimated — no usage reported for this model yet')
					: null,
			status.turns.length ? `${$i18n.t('per turn')}: ${breakdown}` : null
		]
			.filter(Boolean)
			.join('\n')
	);

	const contextLabel = $derived.by(() => {
		if (status.percent === null || status.contextLength === null) return '';
		return `${contextBar(status.percent)} ${Math.round(status.percent * 100)}% ${formatTokens(status.contextLength)}`;
	});
</script>

{#if status.provenance !== 'unknown' && selectedModels?.length}
	<div
		data-testid="context-status-line"
		class="px-1 pt-1 pb-0.5 text-xs text-gray-500 dark:text-gray-400 text-center line-clamp-1 select-none flex items-center justify-center gap-2"
	>
		<Tooltip content={tooltip}>
			<span class="tabular-nums whitespace-nowrap">
				↑{inUseLabel} ↓{formatTokens(status.totalReceived)}{#if contextLabel}
					· {contextLabel}{/if}{#if autoCompactArmed}
					{$i18n.t('(auto)')}{/if}
			</span>
		</Tooltip>
		{#if onCompact}
			<Tooltip
				content={compactDisabled
					? (compactDisabledReason || $i18n.t('Nothing to compact yet'))
					: $i18n.t('Summarize earlier turns to free context')}
			>
				<button
					data-testid="compact-button"
					class="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:no-underline"
					disabled={compactDisabled}
					onclick={() => {
						onCompact();
					}}
				>
					{$i18n.t('Compact')}
				</button>
			</Tooltip>
		{/if}
	</div>
{/if}
