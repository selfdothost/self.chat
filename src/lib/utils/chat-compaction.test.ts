/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures build raw
   history nodes, which are free-form JSON by design */
import { describe, expect, it } from 'vitest';

import {
    COMPACT_SUMMARY_TYPE,
    applyCompaction,
    buildCompactionTranscript,
    planCompaction
} from './chat-compaction';
import { chainMessages } from './context-status';

/** Linear u/a history of `exchanges` pairs; `extra(id)` decorates nodes. */
function history(exchanges: number, extra: (id: string) => object = () => ({})) {
    const messages: Record<string, any> = {};
    let prev: string | null = null;
    let currentId: string | null = null;
    for (let i = 1; i <= exchanges; i++) {
        for (const role of ['user', 'assistant']) {
            const id = `${role[0]}${i}`;
            messages[id] = {
                id,
                parentId: prev,
                childrenIds: [],
                role,
                content: `${role} says ${i}`,
                ...extra(id)
            };
            if (prev) messages[prev].childrenIds.push(id);
            prev = id;
            currentId = id;
        }
    }
    return { messages, currentId };
}

describe('planCompaction', () => {
    it('refuses chains below the minimum length', () => {
        expect(planCompaction(history(2))).toBeNull(); // 4 nodes < 6
        expect(planCompaction({ messages: {}, currentId: null })).toBeNull();
    });

    it('retains the tail and cuts at a user message', () => {
        const plan = planCompaction(history(6)); // 12 nodes
        expect(plan).not.toBeNull();

        // The retained tail opens with a user message and keeps the tip.
        const retainedRoot = plan!.retainedFirstId!;
        expect(retainedRoot.startsWith('u')).toBe(true);
        // 12 - 4 retained = 8 compacted.
        expect(plan!.compactedIds).toHaveLength(8);
        expect(plan!.cutoffId).toBe('a4');
    });

    it('counts turns cumulatively across a previous compaction', () => {
        // A chain whose root is already a summary covering 5 turns.
        const base = history(4);
        const messages: Record<string, any> = {
            s0: {
                id: 's0',
                parentId: null,
                childrenIds: [],
                role: 'assistant',
                type: COMPACT_SUMMARY_TYPE,
                content: 'old summary',
                compactSummary: { compactedIds: ['x'], compactedTurnCount: 5 }
            }
        };
        let prev = 's0';
        for (const id of Object.keys(base.messages)) {
            messages[id] = { ...base.messages[id], parentId: prev };
            prev = id;
        }
        const h = { messages, currentId: prev };
        const plan = planCompaction(h);
        expect(plan).not.toBeNull();
        // 5 (from the summary) + u1..u2 inside the compacted span = 7.
        expect(plan!.compactedTurnCount).toBe(7);
    });
});

describe('buildCompactionTranscript', () => {
    it('labels user exchanges with incrementing turn markers', () => {
        const h = history(5); // 10 nodes: span u1..a3 (3 turns), tail u4/a4/u5/a5
        const plan = planCompaction(h)!;
        const text = buildCompactionTranscript(h, plan);

        expect(text).toContain('[turn 1] USER: user says 1');
        expect(text).toContain('[turn 1] ASSISTANT: assistant says 1');
        expect(text).toContain('[turn 2] USER: user says 2');
    });

    it('renders a previous summary as a covered-range marker', () => {
        const base = history(3);
        const messages: Record<string, any> = {
            s0: {
                id: 's0',
                parentId: null,
                childrenIds: [],
                role: 'assistant',
                type: COMPACT_SUMMARY_TYPE,
                content: 'the old summary text',
                compactSummary: { compactedIds: ['x'], compactedTurnCount: 5 }
            }
        };
        let prev = 's0';
        for (const id of Object.keys(base.messages)) {
            messages[id] = { ...base.messages[id], parentId: prev };
            prev = id;
        }
        const h = { messages, currentId: prev };
        const plan = planCompaction(h)!;
        const text = buildCompactionTranscript(h, plan);

        expect(text).toContain('[summary of turns 1..5]');
        expect(text).toContain('SUMMARY: the old summary text');
        // Numbering continues after the previous compaction.
        expect(text).toContain('[turn 6] USER: user says 1');
    });
});

describe('applyCompaction', () => {
    it('splices the summary in as the retained tail’s ancestor', () => {
        const h = history(6);
        const plan = planCompaction(h)!;
        const out = applyCompaction(h, plan, { content: 'sum', model: 'm' }, 's-new');

        // Active chain now walks through the summary...
        const chain = chainMessages(out) as any[];
        expect(chain[0].id).toBe('s-new');
        expect(chain[0].type).toBe(COMPACT_SUMMARY_TYPE);
        // ...and the tip is unchanged.
        expect(out.currentId).toBe(h.currentId);
        // The retained tail re-parents onto the summary.
        expect(out.messages[plan.retainedFirstId!].parentId).toBe('s-new');
        // The cutoff no longer claims the retained tail as a child.
        expect(out.messages[plan.cutoffId].childrenIds).not.toContain(plan.retainedFirstId);
    });

    it('keeps retired nodes in the tree, off the active chain', () => {
        const h = history(6);
        const plan = planCompaction(h)!;
        const out = applyCompaction(h, plan, { content: 'sum', model: 'm' }, 's-new');

        // Still stored...
        for (const id of plan.compactedIds) {
            expect(out.messages[id]).toBeDefined();
        }
        // ...but nothing on the active chain points into the span.
        const chainIds = new Set(chainMessages(out).map((m) => m.id));
        for (const id of plan.compactedIds) {
            expect(chainIds.has(id)).toBe(false);
        }
    });

    it('returns a new history and never mutates the input', () => {
        const h = history(6);
        const before = JSON.stringify(h);
        const plan = planCompaction(h)!;
        applyCompaction(h, plan, { content: 'sum', model: 'm' }, 's-new');

        expect(JSON.stringify(h)).toBe(before);
    });

    it('carries span pointers and turn metadata for the card', () => {
        const h = history(6);
        const plan = planCompaction(h)!;
        const out = applyCompaction(
            h,
            plan,
            { content: 'sum', model: 'm', modelName: 'Model' },
            's-new'
        );

        const s = out.messages['s-new'];
        expect(s.compactSummary.compactedIds).toEqual(plan.compactedIds);
        expect(s.compactSummary.compactedTurnCount).toBe(plan.compactedTurnCount);
        expect(s.compactSummary.prevSummaryId).toBeUndefined();
        expect(s.done).toBe(true);
        expect(s.modelName).toBe('Model');
    });

    it('chains: a second compaction swallows the first summary', () => {
        const h = history(6);
        const first = planCompaction(h)!;
        const h2 = applyCompaction(h, first, { content: 'first summary', model: 'm' }, 's1');

        // Grow the conversation past the first compaction.
        const messages = { ...h2.messages };
        let prev = h2.currentId;
        for (let i = 7; i <= 10; i++) {
            for (const role of ['user', 'assistant']) {
                const id = `${role[0]}${i}`;
                messages[id] = {
                    id,
                    parentId: prev,
                    childrenIds: [],
                    role,
                    content: `${role} says ${i}`
                };
                messages[prev].childrenIds.push(id);
                prev = id;
            }
        }
        const h3 = { messages, currentId: prev };

        const second = planCompaction(h3);
        expect(second).not.toBeNull();

        const out = applyCompaction(h3, second!, { content: 'second summary', model: 'm' }, 's2');
        const s2 = out.messages['s2'];

        // The new summary is the root of the active chain...
        expect(s2.parentId).toBeNull();
        expect(chainMessages(out)[0].id).toBe('s2');
        // ...the first summary is retired inside its span and linked...
        expect(s2.compactSummary.prevSummaryId).toBe('s1');
        expect(s2.compactSummary.compactedIds).toContain('s1');
        // ...and turn numbering is cumulative: s1 covered u1..u4 (4 turns),
        // the second span adds u5..u8, so 8.
        expect(s2.compactSummary.compactedTurnCount).toBe(8);
    });

    it('handles compacting everything when no tail can be retained', () => {
        // A hand-built nothing-retained plan (planCompaction itself refuses
        // the degenerate shapes — pinned by the null tests above): the
        // summary becomes the conversation's whole state.
        const h = history(3);
        const plan = {
            cutoffId: 'a3',
            retainedFirstId: null,
            compactedIds: ['u1', 'a1', 'u2', 'a2', 'u3', 'a3'],
            compactedTurnCount: 3
        };
        const out = applyCompaction(h, plan, { content: 'all', model: 'm' }, 's-all');
        expect(out.currentId).toBe('s-all');
        expect(out.messages['s-all'].childrenIds).toEqual([]);
        expect(chainMessages(out).map((m) => m.id)).toEqual(['s-all']);
    });
});
