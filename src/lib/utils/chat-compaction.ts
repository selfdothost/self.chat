// Conversation compaction: summarize a conversation's retired turns so it
// can continue inside a bounded context window (self.chat compaction epic).
//

// THE MODEL THE CLIENT OWNS. History is a tree (`history.messages` keyed by
// id + `currentId` tip); the active branch — what the model is sent — is the
// parentId chain from the tip to the root. Compaction splices a synthetic
// compact-summary node in as the new ancestor of the retained tail:
//
//   before:  [root ... cutoff][retained tail ... tip]
//   after:   S (type: 'compact-summary')
//            ├─ active chain: S → retained tail → ... → tip
//            └─ retired span kept in the tree as a sibling branch — still
//               stored, still browsable from the card's expander, never sent
//
// Chained compaction falls out: each pass compacts from the root, so the
// previous summary is inside the span it summarizes, and the Nth summary's
// parentId is null — the model's context after N compactions is one summary
// plus the turns since. Transcripts stay indefinitely continuable.
//
// Everything here is a PURE function over the history object. applyCompaction
// returns a NEW history (the caller must REASSIGN `history = ...`, never
// mutate $state in place) and is fully covered by chat-compaction.test.ts.

import { chainMessages } from './context-status';

export const COMPACT_SUMMARY_TYPE = 'compact-summary';

/** Nodes kept verbatim after a compaction when the chain is long enough
 * (≈ two user/assistant exchanges). */
export const RETAIN_TAIL_MESSAGES = 4;

/** Below this chain length there is nothing worth a summary. */
export const MIN_CHAIN_MESSAGES = 6;

/* eslint-disable @typescript-eslint/no-explicit-any -- history nodes are
 * free-form JSON from the stored chat blob, by design (see HistoryLike) */
export type HistoryLike = {
    messages: Record<string, any>;
    currentId: string | null;
};

export interface CompactPlan {
    /** Last node of the span being retired (the splice point's old parent). */
    cutoffId: string;
    /** First node kept after the summary; null when the whole chain retires. */
    retainedFirstId: string | null;
    /** Every node id in the retired span, root-first. */
    compactedIds: string[];
    /** Highest [turn N] label the span covers, counting across prior
     * compactions (a previous summary's compactedTurnCount is the base). */
    compactedTurnCount: number;
}

export interface SummaryPayload {
    content: string;
    model: string;
    modelName?: string;
}
/* eslint-enable @typescript-eslint/no-explicit-any -- re-enabled for the
 * pure helpers below, which type their inputs explicitly; applyCompaction
 * re-opens it locally where it clones raw nodes. */

/**
 * Decide whether the active chain can be compacted, and where to cut it.
 * Returns null when it can't (too short — or the tail alignment consumed
 * everything, which the minimum-length check makes equivalent).
 */
export function planCompaction(history: HistoryLike): CompactPlan | null {
    const chain = chainMessages(history);
    if (chain.length < MIN_CHAIN_MESSAGES) return null;

    let split = Math.max(1, chain.length - RETAIN_TAIL_MESSAGES);
    // Align the boundary to a USER message: a retained tail that opens with
    // an orphaned assistant reply (its user half just got summarized) reads
    // wrong in the transcript and skews turn labels.
    while (split < chain.length && chain[split]?.role !== 'user') {
        split += 1;
    }
    if (split >= chain.length) return null; // tail alignment ate the span

    const span = chain.slice(0, split);
    const retainedFirstId = chain[split]?.id ?? null;

    return {
        cutoffId: span[span.length - 1].id,
        retainedFirstId,
        compactedIds: span.map((m) => m.id),
        compactedTurnCount: countTurns(span)
    };
}

/** Turn labels are cumulative across compactions: a previous summary node
 * contributes its own compactSummary.compactedTurnCount as the base. */
function countTurns(
    span: Array<{ role?: string; type?: string; compactSummary?: { compactedTurnCount?: number } }>
): number {
    let turns = 0;
    for (const node of span) {
        if (node.type === COMPACT_SUMMARY_TYPE) {
            turns = Math.max(turns, node.compactSummary?.compactedTurnCount ?? 0);
        } else if (node.role === 'user') {
            turns += 1;
        }
    }
    return turns;
}

/**
 * Turn labels for a retired span, shared by the summarizer transcript and
 * the summary card's expander so the numbers a user cites ([turns 12-14])
 * are the same numbers the card shows. Counts USER exchanges; continues
 * from a previous summary's compactedTurnCount; a nested summary labels
 * itself with the range it covered.
 */
export function labelCompactedSpan(
    span: Array<{
        id: string;
        role?: string;
        type?: string;
        compactSummary?: { compactedTurnCount?: number };
    }>
): { labels: Record<string, string>; lastTurn: number } {
    let turn = 0;
    const labels: Record<string, string> = {};
    for (const node of span) {
        if (node.type === COMPACT_SUMMARY_TYPE) {
            const covered = node.compactSummary?.compactedTurnCount ?? 0;
            turn = Math.max(turn, covered);
            labels[node.id] = `[summary of turns 1..${covered}]`;
        } else {
            if (node.role === 'user') turn += 1;
            labels[node.id] =
                node.role === 'assistant' ? `[turn ${turn}] ASSISTANT` : `[turn ${turn}] USER`;
        }
    }
    return { labels, lastTurn: turn };
}

/**
 * Serialize the retired span for the summarizer: "[turn N] ROLE: content"
 * lines, with turn numbers counting USER exchanges (the citable unit) and
 * continuing from any previous compaction. A previous summary in the span
 * renders as "[summary of turns 1..K]" followed by its content, so the
 * summarizer folds it in rather than re-deriving it.
 */
export function buildCompactionTranscript(history: HistoryLike, plan: CompactPlan): string {
    const span = plan.compactedIds.map((id) => history.messages[id]).filter((m) => m !== undefined);

    const { labels } = labelCompactedSpan(span);
    const lines: string[] = [];
    for (const node of span) {
        if (node.type === COMPACT_SUMMARY_TYPE) {
            lines.push(labels[node.id]);
            lines.push(`SUMMARY: ${textContent(node)}`);
        } else {
            lines.push(`${labels[node.id]}: ${textContent(node)}`);
        }
    }
    return lines.join('\n');
}

function textContent(node: { content?: unknown }): string {
    return typeof node.content === 'string' ? node.content : '';
}

/**
 * Splice the summary in as the retained tail's ancestor. Returns a NEW
 * history — the input is never mutated (the caller reassigns `history` so
 * Svelte 5 reactivity fires). Retired nodes are left in place as a sibling
 * branch: still stored, still rendered by the summary card's expander,
 * never on the parentId chain the model walks.
 */
export function applyCompaction(
    history: HistoryLike,
    plan: CompactPlan,
    summary: SummaryPayload,
    newId: string,
    timestamp: number = Date.now()
): HistoryLike {
    /* eslint-disable @typescript-eslint/no-explicit-any -- clones raw history
     * nodes, whose shape is free-form by design */
    const messages: Record<string, any> = { ...history.messages };

    // Previous summary in the span (chained compaction) — linked for the
    // card's "earlier compaction" footer.
    const prevSummaryId =
        plan.compactedIds.map((id) => messages[id]).find((m) => m?.type === COMPACT_SUMMARY_TYPE)
            ?.id ?? null;

    const spanRoot = messages[plan.compactedIds[0]];
    const summaryNode = {
        id: newId,
        parentId: spanRoot?.parentId ?? null,
        role: 'assistant',
        type: COMPACT_SUMMARY_TYPE,
        content: summary.content,
        model: summary.model,
        ...(summary.modelName ? { modelName: summary.modelName } : {}),
        done: true,
        timestamp,
        compactSummary: {
            compactedIds: [...plan.compactedIds],
            compactedTurnCount: plan.compactedTurnCount,
            ...(prevSummaryId ? { prevSummaryId } : {})
        },
        childrenIds: plan.retainedFirstId ? [plan.retainedFirstId] : []
    };

    // Re-parent the retained tail onto the summary (clone the node; fix the
    // old parent's childrenIds so sibling navigation doesn't show the tail
    // twice).
    if (plan.retainedFirstId) {
        const retained = { ...messages[plan.retainedFirstId], parentId: newId };
        messages[plan.retainedFirstId] = retained;
        const cutoff = { ...messages[plan.cutoffId] };
        cutoff.childrenIds = (cutoff.childrenIds ?? []).filter(
            (id: string) => id !== plan.retainedFirstId
        );
        messages[plan.cutoffId] = cutoff;
    }

    // If the span's root had a parent (compact mid-tree), the summary takes
    // its place among that parent's children.
    if (spanRoot?.parentId && messages[spanRoot.parentId]) {
        const parent = { ...messages[spanRoot.parentId] };
        parent.childrenIds = [...(parent.childrenIds ?? []), newId];
        messages[spanRoot.parentId] = parent;
    }

    messages[newId] = summaryNode;

    return {
        messages,
        // currentId unchanged when a tail was retained (the chain from the
        // same tip now walks through the summary); otherwise the summary IS
        // the conversation's state.
        currentId: plan.retainedFirstId ? history.currentId : newId
    };
}
