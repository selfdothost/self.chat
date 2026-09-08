/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures build raw
   history nodes, which are free-form JSON by design */
import { describe, expect, it } from 'vitest';

import {
	chainMessages,
	contextBar,
	contextStatus,
	estimateTokens,
	formatTokens
} from './context-status';

/** Build a linear history: u1 -> a1 -> u2 -> a2 ... ids "u1","a1",... */
function linearHistory(count: number, extra: (id: string, idx: number) => object = () => ({})) {
	const messages: Record<string, any> = {};
	let prev: string | null = null;
	let currentId: string | null = null;
	for (let i = 1; i <= count; i++) {
		for (const role of ['user', 'assistant']) {
			const id = `${role[0]}${i}`;
			messages[id] = {
				id,
				parentId: prev,
				role,
				content: `${role} message ${i}`,
				...extra(id, i)
			};
			prev = id;
			currentId = id;
		}
	}
	return { messages, currentId };
}

const MODELS = [{ id: 'big-model', context_length: 32_768 }];

describe('chainMessages', () => {
	it('walks the active branch root-first from currentId', () => {
		const history = linearHistory(2);
		const chain = chainMessages(history);
		expect(chain.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
	});

	it('ignores orphaned branches (edit siblings) not on the chain', () => {
		const history = linearHistory(2);
		// An orphaned alternative a2' whose parent is u2 but is not the tip.
		history.messages['a2alt'] = {
			id: 'a2alt',
			parentId: 'u2',
			role: 'assistant',
			content: 'not on the active branch'
		};
		const chain = chainMessages(history);
		expect(chain.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
	});

	it('handles a cycle without looping forever', () => {
		const messages: Record<string, any> = {
			a: { id: 'a', parentId: 'b', role: 'user', content: 'x' },
			b: { id: 'b', parentId: 'a', role: 'assistant', content: 'y' }
		};
		const chain = chainMessages({ messages, currentId: 'a' });
		expect(chain.length).toBe(2);
	});

	it('returns empty for a fresh chat', () => {
		expect(chainMessages({ messages: {}, currentId: null })).toEqual([]);
	});
});

describe('contextStatus', () => {
	it('uses the LAST measured footprint as context in use', () => {
		const history = linearHistory(2, (id) => {
			if (id === 'a1')
				return { usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } };
			if (id === 'a2')
				return { usage: { prompt_tokens: 400, completion_tokens: 80, total_tokens: 480 } };
			return {};
		});
		const status = contextStatus({ history, modelId: 'big-model', models: MODELS });

		// The a1 trailer describes a strictly smaller prefix; a2 wins.
		expect(status.contextInUse).toBe(480);
		expect(status.provenance).toBe('measured');
		expect(status.percent).toBeCloseTo(480 / 32768, 5);
	});

	it('adds the draft on top of a measured footprint', () => {
		const history = linearHistory(1, () => ({
			usage: { prompt_tokens: 100, completion_tokens: 20 }
		}));
		const status = contextStatus({
			history,
			modelId: 'big-model',
			models: MODELS,
			promptDraft: 'a'.repeat(40) // 10 estimated tokens
		});
		expect(status.contextInUse).toBe(130);
	});

	it('sums completion_tokens over all assistant turns', () => {
		const history = linearHistory(2, (id) => {
			if (id === 'a1') return { usage: { prompt_tokens: 100, completion_tokens: 50 } };
			if (id === 'a2') return { usage: { prompt_tokens: 400, completion_tokens: 80 } };
			return {};
		});
		const status = contextStatus({ history, modelId: 'big-model', models: MODELS });
		expect(status.totalReceived).toBe(130);
		expect(status.turns.map((t) => t.completionTokens)).toEqual([50, 80]);
	});

	it('falls back to a chars/4 estimate, marked estimated, when no trailer exists', () => {
		// Each message is "user message 1" = 14 chars -> 4 tokens (ceil 3.5).
		const history = linearHistory(1);
		const status = contextStatus({
			history,
			modelId: 'big-model',
			models: MODELS,
			promptDraft: 'x'.repeat(8) // 2 tokens
		});
		expect(status.provenance).toBe('estimated');
		expect(status.contextInUse).toBe(
			estimateTokens('user message 1') + estimateTokens('assistant message 1') + 2
		);
	});

	it('hides percent when the model publishes no context_length', () => {
		const history = linearHistory(1, () => ({
			usage: { prompt_tokens: 10, completion_tokens: 5 }
		}));
		const status = contextStatus({
			history,
			modelId: 'mystery',
			models: [{ id: 'mystery' }] // no context_length: omitted-when-unknown
		});
		expect(status.contextLength).toBeNull();
		expect(status.percent).toBeNull();
	});

	it('reports unknown for an empty fresh chat', () => {
		const status = contextStatus({
			history: { messages: {}, currentId: null },
			modelId: 'big-model',
			models: MODELS
		});
		expect(status.provenance).toBe('unknown');
		expect(status.contextInUse).toBe(0);
	});
});

describe('formatting', () => {
	it('formatTokens compacts', () => {
		expect(formatTokens(943)).toBe('943');
		expect(formatTokens(18_943)).toBe('18.9k');
		expect(formatTokens(3_600_000)).toBe('3.6M');
	});

	it('estimateTokens divides by four, ceiling', () => {
		expect(estimateTokens('')).toBe(0);
		expect(estimateTokens('abcd')).toBe(1);
		expect(estimateTokens('abcde')).toBe(2);
	});

	it('contextBar draws ten blocks and clamps', () => {
		expect(contextBar(0.59)).toBe('▓▓▓▓▓▓░░░░');
		expect(contextBar(0)).toBe('░░░░░░░░░░');
		expect(contextBar(1)).toBe('▓▓▓▓▓▓▓▓▓▓');
		expect(contextBar(1.5)).toBe('▓▓▓▓▓▓▓▓▓▓');
	});
});
