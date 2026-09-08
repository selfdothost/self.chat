<script lang="ts">
    // The in-transcript rendering of a compaction: a summary card where the
    // retired turns used to be. The transcript itself never loses anything —
    // the retired span stays in the history tree as a sibling branch, and
    // this card is the only surface that still renders it (read-only, with
    // the same [turn N] labels the summary cites, so "turns 12-14" resolves
    // to something a human can open).
    //
    // Nested compactions: when a later compaction retires an earlier
    // summary, the earlier card renders inside this one's expander, and the
    // footer link scrolls to it. Chains are therefore browsable to any
    // depth, which is what makes transcripts effectively indefinite.

    import { getContext } from 'svelte';
    import { tick } from 'svelte';
    import type { Writable } from 'svelte/store';
    import type { i18n as i18nType } from 'i18next';

    import Markdown from './Markdown.svelte';
    import CompactedSummaryCard from './CompactedSummaryCard.svelte';
    import { labelCompactedSpan } from '$lib/utils/chat-compaction';

    const i18n: Writable<i18nType> = getContext('i18n');

    interface Props {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        history: { messages: Record<string, any>; currentId?: string | null };
        /* eslint-enable @typescript-eslint/no-explicit-any */
        messageId: string;
        /** Rendered inside another card's expander — tighter chrome. */
        nested?: boolean;
    }

    let { history, messageId, nested = false }: Props = $props();

    let expanded = $state(false);

    const message = $derived(history.messages[messageId]);
    const meta = $derived(message?.compactSummary ?? {});
    const retired = $derived(
        (meta.compactedIds ?? [])
            .map((id: string) => history.messages[id])
            .filter((m: unknown) => m !== undefined)
    );
    const spanLabels = $derived(labelCompactedSpan(retired));

    const turnCount = $derived(
        typeof meta.compactedTurnCount === 'number' ? meta.compactedTurnCount : retired.length
    );

    const scrollToEarlierCompaction = async () => {
        if (!meta.prevSummaryId) return;
        expanded = true;
        await tick();
        await tick();
        document
            .getElementById(`message-${meta.prevSummaryId}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
</script>

{#if message}
    <div
        id="message-{messageId}"
        data-testid="compacted-summary-card"
        class="w-full mx-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 my-2 {nested
            ? 'p-2'
            : 'p-3'}"
    >
        <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
            <span class="inline-flex items-center gap-1">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    class="size-4"
                >
                    <path
                        d="M2 4.75A2.75 2.75 0 0 1 4.75 2h6.5A2.75 2.75 0 0 1 14 4.75v6.5A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5Zm13 3.94a3 3 0 0 1 1.5-.256v-3.18a2.75 2.75 0 0 0-1.5-.37v3.806ZM4.75 16.5A2.75 2.75 0 0 1 2 13.75v.5c0 1.17.37 2.25 1 3.135A2.75 2.75 0 0 0 4.75 16.5Z"
                    />
                </svg>
                {$i18n.t('Compacted — {{count}} turns summarized', { count: turnCount })}
            </span>
            {#if meta.prevSummaryId}
                <button
                    class="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200"
                    data-testid="earlier-compaction-link"
                    onclick={scrollToEarlierCompaction}
                >
                    {$i18n.t('Earlier compaction')}
                </button>
            {/if}
        </div>

        <div class="text-sm text-gray-800 dark:text-gray-100 mt-1.5">
            <Markdown id="{messageId}-summary" content={message.content ?? ''} />
        </div>

        <button
            class="mt-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
            data-testid="compacted-turns-toggle"
            onclick={() => {
                expanded = !expanded;
            }}
        >
            {expanded ? $i18n.t('Hide compacted turns') : $i18n.t('Show compacted turns')}
        </button>

        {#if expanded}
            <div class="mt-2 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-2">
                {#each retired as node (node.id)}
                    {#if node.type === 'compact-summary'}
                        <!-- An earlier compaction retired into this span: render its card
						     nested, expander and all, so the chain stays browsable. -->
                        <CompactedSummaryCard {history} messageId={node.id} nested={true} />
                    {:else}
                        <div class="text-xs">
                            <div class="font-mono text-gray-400 dark:text-gray-500 mb-0.5">
                                {spanLabels.labels[node.id] ?? ''}
                            </div>
                            <div class="text-gray-700 dark:text-gray-200 prose-sm">
                                <Markdown id="{messageId}-{node.id}" content={node.content ?? ''} />
                            </div>
                        </div>
                    {/if}
                {/each}
            </div>
        {/if}
    </div>
{/if}
