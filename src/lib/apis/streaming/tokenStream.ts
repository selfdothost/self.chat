import { EventSourceParserStream } from 'eventsource-parser/stream';
import type { EventSourceMessage } from 'eventsource-parser';
import type { ModelSubstitution } from './index';

/**
 * A SECOND stream consumer, deliberately not a flag on `createOpenAITextStream`.
 *
 * Treasuremap Decision 2: the normal view renders from an accumulated string,
 * this one renders from a token array. That is a different data path, not a
 * different rendering option — and keeping them apart is what lets the chat
 * path stay byte-identical while this one keeps everything chat throws away.
 *
 * `index.ts` is untouched. `TextStreamUpdate` is not exported there, which is
 * convenient rather than awkward: the types below are this module's own, so
 * nothing here can drift the chat consumer's contract (R1-AC2).
 */

/** One alternative the model considered at a position. */
export type TokenAlternative = {
    /** The vocabulary id. The whole reason this module exists — see below. */
    id: number | null;
    /** The rendered text, which is NOT an identity: two ids can render alike. */
    token: string;
    /** Pre-sampling `logprob` or post-sampling `prob`, per the stream's mode. */
    value: number | null;
};

/** One position of the reply, with what the model nearly said instead. */
export type TokenEntry = {
    id: number | null;
    token: string;
    value: number | null;
    alternatives: TokenAlternative[];
};

export type TokenStreamUpdate = {
    done: boolean;
    value: string;
    /** Present only when the chunk carried them. Never synthesised. */
    tokens?: TokenEntry[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sources?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectedModelId?: any;
    modelSubstitution?: ModelSubstitution;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usage?: any;
    reasoning?: string;
};

/**
 * Which field pair carries the numbers, per sampling mode.
 *
 * THE SAME TRAP AS THE SERVER'S `SAMPLING_FIELD_NAMES`, and it has to be
 * mirrored here because it is the client that reads the wrong one. llama.cpp
 * renames its own fields depending on `post_sampling_probs`: pre-sampling emits
 * `logprob`/`top_logprobs`, post-sampling emits `prob`/`top_probs`. Reading the
 * wrong pair yields entries whose values are all `null` and whose alternatives
 * list is EMPTY — with no error anywhere, which looks exactly like a model that
 * was certain about every token.
 *
 * The server echoes the mode it used; pass it through rather than guessing.
 */
export const SAMPLING_FIELDS = {
    pre: { value: 'logprob', alternatives: 'top_logprobs' },
    post: { value: 'prob', alternatives: 'top_probs' }
} as const;

export type SamplingMode = keyof typeof SAMPLING_FIELDS;

const asNumber = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * Pull token entries out of one parsed SSE chunk.
 *
 * Returns `undefined` — not `[]` — when the chunk carried no logprobs at all,
 * so a caller can tell "this chunk had no tokens" from "this chunk had a token
 * with no alternatives" (R1-AC5: never invent an entry).
 */
export function extractTokens(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parsed: any,
    mode: SamplingMode = 'pre'
): TokenEntry[] | undefined {
    const content = parsed?.choices?.[0]?.logprobs?.content;
    if (!Array.isArray(content) || content.length === 0) {
        return undefined;
    }

    const fields = SAMPLING_FIELDS[mode];

    return content.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (entry: any): TokenEntry => ({
            // `id` is what a bake replays and what a re-score is keyed on. The
            // rendered text is a display concern: two different ids can render
            // identically, so text alone cannot identify a position.
            id: typeof entry?.id === 'number' ? entry.id : null,
            token: typeof entry?.token === 'string' ? entry.token : '',
            value: asNumber(entry?.[fields.value]),
            alternatives: Array.isArray(entry?.[fields.alternatives])
                ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  entry[fields.alternatives].map((alt: any): TokenAlternative => ({
                      id: typeof alt?.id === 'number' ? alt.id : null,
                      token: typeof alt?.token === 'string' ? alt.token : '',
                      value: asNumber(alt?.[fields.value])
                  }))
                : []
        })
    );
}

/**
 * Consume an SSE body, yielding text deltas AND the tokens behind them.
 *
 * NOT chunked into random slices the way `createOpenAITextStream` optionally is.
 * That exists to make typing look fluid in a prose view; here it would be
 * actively wrong, because slicing a delta into 1-3 character pieces invents
 * boundaries that are not token boundaries and this view's whole claim is that
 * its boundaries are real.
 */
export async function createTokenStream(
    responseBody: ReadableStream<Uint8Array>,
    mode: SamplingMode = 'pre'
): Promise<AsyncGenerator<TokenStreamUpdate>> {
    const eventStream = responseBody
        .pipeThrough(
            // Same lib.dom.d.ts generics gap as index.ts: Uint8Array IS a
            // BufferSource at runtime, TS's stream types just do not model it.
            new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>
        )
        .pipeThrough(new EventSourceParserStream())
        .getReader();
    return tokenStreamToIterator(eventStream, mode);
}

async function* tokenStreamToIterator(
    reader: ReadableStreamDefaultReader<EventSourceMessage>,
    mode: SamplingMode
): AsyncGenerator<TokenStreamUpdate> {
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            yield { done: true, value: '' };
            break;
        }
        if (!value) {
            continue;
        }
        const data = value.data;
        if (data.startsWith('[DONE]')) {
            yield { done: true, value: '' };
            break;
        }

        try {
            const parsedData = JSON.parse(data);

            // EXTRACTED FIRST, BEFORE ANY BRANCH CAN `continue` PAST IT.
            //
            // This is the ordering the build site warns about. In the chat
            // consumer the `reasoning` branch returns early, and every
            // metadata branch ends in a `continue` — so reading logprobs at
            // the bottom, where the content yield lives, would silently drop
            // the tokens on any chunk that also carried reasoning. Computing
            // it once up here makes that class of bug unreachable rather than
            // merely absent today.
            const tokens = extractTokens(parsedData, mode);

            if (parsedData.error) {
                yield { done: true, value: '', error: parsedData.error };
                break;
            }

            if (parsedData.sources) {
                yield {
                    done: false,
                    value: '',
                    sources: parsedData.sources,
                    ...(tokens && { tokens })
                };
                continue;
            }

            if (parsedData.selected_model_id) {
                // model_substitution rides this same event (self.ai#35), so it is
                // read here rather than in an `if` of its own that could never fire.
                //
                // It matters MORE here than in chat: a substitution means these
                // token ids belong to a different vocabulary, which is silent
                // corruption in a token view. The server refuses a re-score on
                // this basis (#134 T-307); surfacing it is what lets the view do
                // the same for a live stream.
                yield {
                    done: false,
                    value: '',
                    selectedModelId: parsedData.selected_model_id,
                    modelSubstitution: parsedData.model_substitution,
                    ...(tokens && { tokens })
                };
                continue;
            }

            if (parsedData.usage) {
                yield {
                    done: false,
                    value: '',
                    usage: parsedData.usage,
                    ...(tokens && { tokens })
                };
                continue;
            }

            const reasoning = parsedData.choices?.[0]?.delta?.reasoning_content;
            if (reasoning) {
                yield { done: false, value: '', reasoning, ...(tokens && { tokens }) };
                continue;
            }

            // The ordinary case, and the one R1-AC6 is about: this yields even
            // when the delta is empty, so a chunk that carries only logprobs
            // still reaches the caller. `tokens` is spread in only when the
            // chunk actually had some, so a plain text delta never gains an
            // invented entry (R1-AC5).
            yield {
                done: false,
                value: parsedData.choices?.[0]?.delta?.content ?? '',
                ...(tokens && { tokens })
            };
        } catch (e) {
            console.error('Error extracting token delta from SSE event:', e);
        }
    }
}
