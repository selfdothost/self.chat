import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// self.chat#51 + self.chat#52. Both defects are control flow inside Chat.svelte
// and MessageInput.svelte — a missing short-circuit and a missing write-through.
// Neither is reachable from a unit test without mounting a 2200-line component
// that owns a socket, a router and a dozen stores, so this is a static guard on
// the source, the same shape as chat-seed-independence.test.ts next door. The
// decisions themselves (the tri-state) are unit-tested in
// src/lib/utils/model-capabilities.test.ts.

const chatSrc = readFileSync(
	resolve(process.cwd(), 'src/lib/components/chat/Chat.svelte'),
	'utf-8'
);

const messageInputSrc = readFileSync(
	resolve(process.cwd(), 'src/lib/components/chat/MessageInput.svelte'),
	'utf-8'
);

describe('self.chat#51: the vision guard fires and stops the send', () => {
	it('no longer defaults an unknown capability to vision-capable', () => {
		// The expression that made the guard dead code for the 97-of-101 models
		// whose `capabilities` is JSON null.
		expect(chatSrc).not.toContain('capabilities?.vision ?? true');
		expect(messageInputSrc).not.toContain('capabilities?.vision ?? true');
	});

	it('routes both components through the shared tri-state predicate', () => {
		expect(chatSrc).toContain("from '$lib/utils/model-capabilities'");
		expect(messageInputSrc).toContain("from '$lib/utils/model-capabilities'");
	});

	it('short-circuits the send for a model that refuses images', () => {
		const guardIdx = chatSrc.indexOf('if (hasImages && blocksImageInput(model))');
		expect(guardIdx).toBeGreaterThan(-1);

		// The guard block runs up to the next statement in the map callback.
		const guardEnd = chatSrc.indexOf('let userContext', guardIdx);
		expect(guardEnd).toBeGreaterThan(guardIdx);
		const guard = chatSrc.slice(guardIdx, guardEnd);

		// Without this the toast is purely advisory and the image goes out anyway.
		expect(guard).toContain('return;');
	});

	it('marks the already-created assistant message failed instead of leaving it blank', () => {
		// The placeholder response message is created and saved BEFORE the
		// Promise.all, so a bare `return` would refuse the send and still leave a
		// blank never-finishing bubble — self.chat#52's symptom by another route.
		const guardIdx = chatSrc.indexOf('if (hasImages && blocksImageInput(model))');
		const guard = chatSrc.slice(guardIdx, chatSrc.indexOf('let userContext', guardIdx));

		expect(guard).toContain('responseMessage.error');
		expect(guard).toContain('responseMessage.done = true');
		expect(guard).toContain('saveChatHandler(_chatId)');
	});

	it('reads the response message before the guard, not after it', () => {
		// The lookup used to sit below the guard; the early return needs it above.
		const lookupIdx = chatSrc.indexOf('let responseMessageId =\n\t\t\t\t\t\tresponseMessageIds[');
		const guardIdx = chatSrc.indexOf('if (hasImages && blocksImageInput(model))');
		expect(lookupIdx).toBeGreaterThan(-1);
		expect(lookupIdx).toBeLessThan(guardIdx);
	});

	it('checks every composer path that can attach an image', () => {
		// File drop/picker, the RichTextInput paste, the plain textarea paste, and
		// screen capture. Only the first ever checked, and it checked a predicate
		// that could not be false.
		const checks = messageInputSrc.match(/canAttachImage\(\)/g) ?? [];
		expect(checks.length).toBe(4);
	});

	it('compares model ids to model ids when deciding what the composer accepts', () => {
		// The old filter fed a model OBJECT mixed with id strings into
		// `m.id === model`, so under an @-mention nothing ever matched. Comment
		// lines are stripped first — the note explaining the old shape quotes it.
		const code = messageInputSrc
			.split('\n')
			.filter((line) => !line.trim().startsWith('//'))
			.join('\n');
		expect(code).not.toContain('atSelectedModel ? [atSelectedModel] : selectedModels');
		expect(code).toContain(
			'selectedModelIds.filter((id) => !blocksImageInput($models.find((m) => m.id === id)))'
		);
		expect(code).toContain('selectedModelIds.length !== visionCapableModels.length');
	});
});

describe('self.chat#52: a failed turn is persisted', () => {
	it('writes the chat through from the completion-request catch', () => {
		const requestIdx = chatSrc.indexOf('const res = await generateOpenAIChatCompletion(');
		expect(requestIdx).toBeGreaterThan(-1);

		const catchIdx = chatSrc.indexOf(').catch(', requestIdx);
		expect(catchIdx).toBeGreaterThan(-1);
		const catchEnd = chatSrc.indexOf('});', catchIdx);
		expect(catchEnd).toBeGreaterThan(catchIdx);
		const catchBlock = chatSrc.slice(catchIdx, catchEnd);

		// The in-memory annotation that was already there...
		expect(catchBlock).toContain('responseMessage.error');
		expect(catchBlock).toContain('responseMessage.done = true');
		// ...and the write-through that was not, which is why the failure vanished
		// on reload and the bubble read as still-generating forever.
		expect(catchBlock).toContain('saveChatHandler(_chatId)');
	});

	it('awaits the catch handler so the send does not race the save', () => {
		const requestIdx = chatSrc.indexOf('const res = await generateOpenAIChatCompletion(');
		const catchBlock = chatSrc.slice(
			chatSrc.indexOf(').catch(', requestIdx),
			chatSrc.indexOf('});', chatSrc.indexOf(').catch(', requestIdx))
		);
		expect(catchBlock).toContain('async (error)');
		expect(catchBlock).toContain('await saveChatHandler');
	});

	it('writes the chat through from a terminal socket error too', () => {
		// A mid-stream error is forwarded by the API as the `chat:completion`
		// payload it arrived as, carrying `error` and NOT `done` — and the only
		// save on that path hangs off `if (done)`.
		const start = chatSrc.indexOf('const handleOpenAIError = async (');
		expect(start).toBeGreaterThan(-1);
		const end = chatSrc.indexOf('const stopResponse', start);
		expect(end).toBeGreaterThan(start);
		const body = chatSrc.slice(start, end);

		expect(body).toContain('responseMessage.done = true');
		expect(body).toContain('saveChatHandler(_chatId)');
	});

	it('gives handleOpenAIError the chat id its save has to be scoped to', () => {
		// saveChatHandler is a no-op unless the id matches the chat on screen, so
		// the event's chat id has to be threaded in rather than assumed.
		expect(chatSrc).toContain('const handleOpenAIError = async (error, responseMessage, _chatId)');
		expect(chatSrc).toContain('await handleOpenAIError(error, message, chatId)');
	});
});
