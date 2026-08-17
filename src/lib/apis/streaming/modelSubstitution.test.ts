import { describe, it, expect } from 'vitest';
import { createOpenAITextStream } from './index';

// self.ai#35: during an eval window the GPU lease checkpoint serves the model
// already loaded for the eval instead of the one that was asked for. The server
// announces that as the FIRST SSE event, reusing `selected_model_id` (the
// existing arena channel, already plumbed end to end) and adding
// `model_substitution` for the part that channel cannot express: WHY.
//
// The catch this pins: both keys ride the SAME event. The reader's
// selected_model_id branch ends in a `continue`, so a separate `if` for
// model_substitution would never fire — it has to be read off that one branch.

const SUBSTITUTION = {
	requested: 'gemma-4-26B-A4B-it-qat-UD-Q4_K_XL',
	served: 'Qwen2.5-Coder-32B-Instruct-Q4_K_M',
	reason: 'eval_window'
};

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

async function collect(body: ReadableStream<Uint8Array>) {
	const updates = [];
	const stream = await createOpenAITextStream(body, false);
	for await (const update of stream) {
		updates.push(update);
		if (update.done) break;
	}
	return updates;
}

describe('model substitution over the SSE stream', () => {
	it('surfaces both the served model and the reason from one event', async () => {
		const updates = await collect(
			sseStream(
				JSON.stringify({
					selected_model_id: SUBSTITUTION.served,
					model_substitution: SUBSTITUTION
				}),
				JSON.stringify({ choices: [{ delta: { content: 'hi' } }] })
			)
		);

		const announcement = updates.find((u) => u.selectedModelId);
		expect(announcement?.selectedModelId).toBe(SUBSTITUTION.served);
		expect(announcement?.modelSubstitution).toEqual(SUBSTITUTION);
	});

	it('still yields the answer content after the announcement', async () => {
		const updates = await collect(
			sseStream(
				JSON.stringify({
					selected_model_id: SUBSTITUTION.served,
					model_substitution: SUBSTITUTION
				}),
				JSON.stringify({ choices: [{ delta: { content: 'hi' } }] })
			)
		);

		expect(updates.map((u) => u.value).join('')).toBe('hi');
	});

	it('leaves an arena pick without a substitution reason', async () => {
		// An arena pick sets selected_model_id and nothing else. It must not
		// acquire a reason it does not have — that is what keeps the two apart.
		const updates = await collect(
			sseStream(JSON.stringify({ selected_model_id: SUBSTITUTION.served }))
		);

		const announcement = updates.find((u) => u.selectedModelId);
		expect(announcement?.selectedModelId).toBe(SUBSTITUTION.served);
		expect(announcement?.modelSubstitution).toBeUndefined();
	});

	it('carries the substitution through the large-delta chunker', async () => {
		// splitLargeDeltas=true routes updates through a second generator that
		// passes non-content updates along; the announcement must survive it.
		const body = sseStream(
			JSON.stringify({
				selected_model_id: SUBSTITUTION.served,
				model_substitution: SUBSTITUTION
			}),
			JSON.stringify({ choices: [{ delta: { content: 'a longer answer here' } }] })
		);

		const updates = [];
		const stream = await createOpenAITextStream(body, true);
		for await (const update of stream) {
			updates.push(update);
			if (update.done) break;
		}

		const announcement = updates.find((u) => u.selectedModelId);
		expect(announcement?.modelSubstitution).toEqual(SUBSTITUTION);
		expect(updates.map((u) => u.value).join('')).toBe('a longer answer here');
	});
});
