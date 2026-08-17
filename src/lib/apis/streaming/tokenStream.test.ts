import { describe, it, expect } from 'vitest';
import { createOpenAITextStream } from './index';
import { createTokenStream, extractTokens, type TokenStreamUpdate } from './tokenStream';

// TV/R1. The property that matters and is easy to lose: TOKEN IDENTITY COMES
// FROM `logprobs.content[]`, NEVER FROM SPLITTING THE ACCUMULATED STRING.
//
// Delta boundaries are chat-parser diffs. With reasoning or tool-call parsing
// active they do not line up with token boundaries at all, so a view that
// counted deltas — or worse, split the string — would render a token grid that
// looks entirely plausible and is wrong. AC8 exists to prove the two counts are
// allowed to disagree, which is why the fixture below deliberately makes them.

function sseStream(...events: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const e of events) {
                controller.enqueue(encoder.encode(`data: ${e}\n\n`));
            }
            controller.close();
        }
    });
}

async function collect(body: ReadableStream<Uint8Array>, mode: 'pre' | 'post' = 'pre') {
    const updates: TokenStreamUpdate[] = [];
    const stream = await createTokenStream(body, mode);
    for await (const update of stream) {
        updates.push(update);
        if (update.done) break;
    }
    return updates;
}

/** A chunk with a delta and its token, in the pre-sampling field names. */
const chunk = (text: string, id: number, logprob: number, alts: [string, number, number][] = []) =>
    JSON.stringify({
        choices: [
            {
                delta: { content: text },
                logprobs: {
                    content: [
                        {
                            token: text,
                            id,
                            logprob,
                            top_logprobs: alts.map(([token, altId, lp]) => ({
                                token,
                                id: altId,
                                logprob: lp
                            }))
                        }
                    ]
                }
            }
        ]
    });

describe('token-bearing stream consumer', () => {
    it('yields the text delta and the token entries together', async () => {
        const updates = await collect(sseStream(chunk(' the', 279, -0.12, [[' a', 264, -2.3]])));
        const first = updates[0];

        expect(first.value).toBe(' the');
        expect(first.tokens).toHaveLength(1);
        expect(first.tokens?.[0]).toEqual({
            id: 279,
            token: ' the',
            value: -0.12,
            alternatives: [{ id: 264, token: ' a', value: -2.3 }]
        });
    });

    it('carries the numeric id, not only the rendered text', async () => {
        // R1-AC3. Text is not an identity: two ids can render identically, and a
        // bake replays ids.
        const updates = await collect(sseStream(chunk(' x', 1234, -0.5)));
        expect(updates[0].tokens?.[0].id).toBe(1234);
    });

    it('does not invent a token entry for a delta with no logprobs', async () => {
        // R1-AC5. `tokens` absent, NOT an empty array — a caller must be able to
        // tell "no tokens on this chunk" from "a token with no alternatives".
        const updates = await collect(
            sseStream(JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }))
        );
        expect(updates[0].value).toBe('hi');
        expect(updates[0].tokens).toBeUndefined();
    });

    it('does not drop a chunk whose delta is empty but which carries logprobs', async () => {
        // R1-AC6. The dangerous shape: a `continue` chain that skips empty deltas
        // would throw this away and the grid would be short by one token, with
        // nothing to show for it.
        const updates = await collect(
            sseStream(
                JSON.stringify({
                    choices: [
                        {
                            delta: { content: '' },
                            logprobs: { content: [{ token: '', id: 7, logprob: -1 }] }
                        }
                    ]
                })
            )
        );
        const withTokens = updates.filter((u) => u.tokens);
        expect(withTokens).toHaveLength(1);
        expect(withTokens[0].tokens?.[0].id).toBe(7);
    });

    it('keeps tokens that ride a reasoning chunk', async () => {
        // The chat consumer returns early on reasoning. Extracting logprobs after
        // that branch would silently lose them, so extraction happens first.
        const updates = await collect(
            sseStream(
                JSON.stringify({
                    choices: [
                        {
                            delta: { reasoning_content: 'hmm' },
                            logprobs: { content: [{ token: 'hmm', id: 99, logprob: -0.2 }] }
                        }
                    ]
                })
            )
        );
        const reasoningUpdate = updates.find((u) => u.reasoning);
        expect(reasoningUpdate?.reasoning).toBe('hmm');
        expect(reasoningUpdate?.tokens?.[0].id).toBe(99);
    });

    it('handles a stream whose delta count differs from its token count', async () => {
        // R1-AC8, the load-bearing one. Three text deltas, five tokens: one chunk
        // carries two tokens at once and one carries a token with an empty delta.
        // Any implementation that derived identity from the string — by splitting
        // it, or by assuming one delta means one token — cannot pass this.
        const updates = await collect(
            sseStream(
                chunk('Hello', 1, -0.1),
                JSON.stringify({
                    choices: [
                        {
                            delta: { content: ' world' },
                            logprobs: {
                                content: [
                                    { token: ' wor', id: 2, logprob: -0.2 },
                                    { token: 'ld', id: 3, logprob: -0.3 }
                                ]
                            }
                        }
                    ]
                }),
                JSON.stringify({
                    choices: [
                        {
                            delta: { content: '' },
                            logprobs: { content: [{ token: '!', id: 4, logprob: -0.4 }] }
                        }
                    ]
                }),
                chunk('?', 5, -0.5)
            )
        );

        const deltas = updates.filter((u) => !u.done && u.value !== '').map((u) => u.value);
        const tokens = updates.flatMap((u) => u.tokens ?? []);

        expect(deltas).toEqual(['Hello', ' world', '?']);
        expect(tokens.map((t) => t.id)).toEqual([1, 2, 3, 4, 5]);
        // The point, stated as an assertion so it cannot rot into agreement:
        expect(tokens.length).not.toBe(deltas.length);
        // And the accumulated string does NOT segment into the tokens.
        expect(deltas.join('')).toBe('Hello world?');
        expect(tokens.map((t) => t.token).join('')).toBe('Hello wor' + 'ld' + '!' + '?');
    });

    it('reads the post-sampling field names when told to', async () => {
        // The same rename trap the server guards. Reading `logprob` against a
        // post-sampling stream yields nulls and no alternatives, with no error —
        // indistinguishable from a model that was certain.
        const post = JSON.stringify({
            choices: [
                {
                    delta: { content: ' x' },
                    logprobs: {
                        content: [
                            {
                                token: ' x',
                                id: 8,
                                prob: 0.9,
                                top_probs: [{ token: ' y', id: 9, prob: 0.1 }]
                            }
                        ]
                    }
                }
            ]
        });

        const correct = await collect(sseStream(post), 'post');
        expect(correct[0].tokens?.[0].value).toBe(0.9);
        expect(correct[0].tokens?.[0].alternatives).toEqual([{ id: 9, token: ' y', value: 0.1 }]);

        const wrongMode = await collect(sseStream(post), 'pre');
        expect(wrongMode[0].tokens?.[0].value).toBeNull();
        expect(wrongMode[0].tokens?.[0].alternatives).toEqual([]);
    });

    it('handles [DONE], errors, sources, selected_model_id and usage as chat does', async () => {
        // R1-AC7.
        const sources = await collect(sseStream(JSON.stringify({ sources: [{ id: 's' }] })));
        expect(sources[0].sources).toEqual([{ id: 's' }]);

        const usage = await collect(sseStream(JSON.stringify({ usage: { total_tokens: 3 } })));
        expect(usage[0].usage).toEqual({ total_tokens: 3 });

        const substitution = await collect(
            sseStream(
                JSON.stringify({
                    selected_model_id: 'served',
                    model_substitution: {
                        requested: 'asked',
                        served: 'served',
                        reason: 'eval_window'
                    }
                })
            )
        );
        expect(substitution[0].selectedModelId).toBe('served');
        expect(substitution[0].modelSubstitution?.reason).toBe('eval_window');

        const errored = await collect(sseStream(JSON.stringify({ error: 'boom' })));
        expect(errored[0].error).toBe('boom');
        expect(errored[0].done).toBe(true);

        const done = await collect(sseStream('[DONE]'));
        expect(done[done.length - 1].done).toBe(true);
    });

    it('survives a malformed event without killing the stream', async () => {
        const updates = await collect(sseStream('not json at all', chunk(' ok', 42, -0.1)));
        expect(updates.find((u) => u.tokens)?.tokens?.[0].id).toBe(42);
    });
});

describe('extractTokens', () => {
    it('returns undefined rather than an empty array when there are no logprobs', () => {
        expect(extractTokens({ choices: [{ delta: { content: 'x' } }] })).toBeUndefined();
        expect(extractTokens({})).toBeUndefined();
        expect(extractTokens({ choices: [{ logprobs: { content: [] } }] })).toBeUndefined();
    });

    it('tolerates entries missing their fields without throwing', () => {
        const out = extractTokens({ choices: [{ logprobs: { content: [{}] } }] });
        expect(out).toEqual([{ id: null, token: '', value: null, alternatives: [] }]);
    });
});

describe('the chat consumer is untouched', () => {
    it('produces identical output for a fixture with no logprobs', async () => {
        // R1-AC2. The guard that matters for everyone who is not using this
        // feature: normal chat must be byte-identical.
        const events = [
            JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }),
            JSON.stringify({ choices: [{ delta: { content: ' world' } }] }),
            '[DONE]'
        ];

        const chatUpdates = [];
        const chatStream = await createOpenAITextStream(sseStream(...events), false);
        for await (const u of chatStream) {
            chatUpdates.push(u);
            if (u.done) break;
        }

        const tokenUpdates = await collect(sseStream(...events));

        expect(chatUpdates.map((u) => u.value)).toEqual(['Hello', ' world', '']);
        // Same text, same order, same done-marker — the token consumer only adds.
        expect(tokenUpdates.map((u) => u.value)).toEqual(chatUpdates.map((u) => u.value));
        expect(tokenUpdates.every((u) => u.tokens === undefined)).toBe(true);
    });
});
