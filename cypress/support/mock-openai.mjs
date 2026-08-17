#!/usr/bin/env node
/**
 * A minimal OpenAI-compatible upstream for the e2e job.
 *
 * WHY THIS EXISTS, and why stubbing HTTP could not replace it:
 *
 * chat.cy.ts's chat tests were skipped on the theory that the SSE stub in
 * support/e2e.ts had the wrong "stream shape". That diagnosis was wrong. The
 * client calls `generateOpenAIChatCompletion`, which does `res.json()` and uses
 * ONLY `res.task_id` -- there is no stream reader on that path at all. The
 * assistant's reply arrives over SOCKET.IO (`chatCompletionEventHandler`), from
 * self.ai's API, which is the thing actually talking to an upstream model. So an
 * `cy.intercept` on `POST /api/chat/completions` can never produce a reply, no
 * matter what body it returns: it removes the very request that would have made
 * the API emit the socket events the UI renders.
 *
 * The fix is to give the API a real upstream to talk to. This server is that
 * upstream. It means the chat specs exercise the genuine path --
 * browser -> self.ai API -> upstream -> Socket.IO -> DOM -- which is the path
 * that has actually broken in production more than once, rather than a
 * simulation of it.
 *
 * Deliberately dependency-free (node:http only): the e2e job's image already has
 * Node, and adding a package for this would mean an npm install in the critical
 * path of a blocking gate.
 *
 * Model ids match `stubModel` / `stubModelAlt` in support/e2e.ts on purpose. The
 * specs pick models from a stubbed `/api/models` list, so the ids the UI offers
 * have to be ids this upstream will actually serve -- otherwise the selector
 * works and the send fails.
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_OPENAI_PORT ?? 8899);

// Must match support/e2e.ts.
const MODEL_IDS = ['cypress-stub-model', 'cypress-stub-model-alt'];

// Must match the assertion in chat.cy.ts.
export const REPLY = 'Stubbed reply.';

const json = (res, code, body) => {
	const payload = JSON.stringify(body);
	res.writeHead(code, {
		'content-type': 'application/json',
		'content-length': Buffer.byteLength(payload)
	});
	res.end(payload);
};

const readBody = (req) =>
	new Promise((resolve) => {
		let raw = '';
		req.on('data', (c) => (raw += c));
		req.on('end', () => {
			try {
				resolve(raw ? JSON.parse(raw) : {});
			} catch {
				resolve({});
			}
		});
	});

const chunk = (model, delta, finish) =>
	`data: ${JSON.stringify({
		id: 'mock-upstream-completion',
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [{ index: 0, delta, finish_reason: finish }]
	})}\n\n`;

const server = createServer(async (req, res) => {
	const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
	const path = url.pathname.replace(/^\/v1/, '');

	if (path === '/models' && req.method === 'GET') {
		return json(res, 200, {
			object: 'list',
			data: MODEL_IDS.map((id) => ({
				id,
				object: 'model',
				created: 0,
				owned_by: 'cypress-mock'
			}))
		});
	}

	if (path === '/chat/completions' && req.method === 'POST') {
		const body = await readBody(req);
		const model = body.model ?? MODEL_IDS[0];

		if (!body.stream) {
			return json(res, 200, {
				id: 'mock-upstream-completion',
				object: 'chat.completion',
				created: Math.floor(Date.now() / 1000),
				model,
				choices: [
					{
						index: 0,
						message: { role: 'assistant', content: REPLY },
						finish_reason: 'stop'
					}
				],
				usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
			});
		}

		res.writeHead(200, {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive'
		});
		// Sent as separate writes rather than one concatenated body: the API reads
		// this incrementally, and delivering it as a single chunk would not
		// exercise the incremental path the real thing uses.
		res.write(chunk(model, { role: 'assistant', content: '' }, null));
		res.write(chunk(model, { content: REPLY }, null));
		res.write(chunk(model, {}, 'stop'));
		res.write('data: [DONE]\n\n');
		return res.end();
	}

	// Anything else is a request this mock was not built for. Answer 404 loudly
	// rather than 200-with-empty, so an unexpected call shows up as itself in
	// the log instead of as a confusing downstream parse failure.
	json(res, 404, { error: { message: `mock-openai: unhandled ${req.method} ${url.pathname}` } });
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`mock-openai listening on http://127.0.0.1:${PORT}/v1 serving ${MODEL_IDS.join(', ')}`);
});
