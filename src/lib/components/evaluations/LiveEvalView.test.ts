import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';

const detailsMock = vi.fn();
const eventsMock = vi.fn();

vi.mock('$lib/apis/evaluations/codetests', () => ({
	getCodeTestDetails: (...args: unknown[]) => detailsMock(...args),
	getCodeTests: vi.fn(async () => [])
}));

vi.mock('$lib/apis/evaluations/jobs', () => ({
	getEvalJobEvents: (...args: unknown[]) => eventsMock(...args),
	streamEvalJobLive: () => () => {},
	getEvalJobs: vi.fn(async () => [])
}));

vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import LiveEvalView from './LiveEvalView.svelte';
import type { EvalJob } from '$lib/apis/evaluations/jobs';

const job: EvalJob = {
	id: 'job-1',
	user_id: 'u1',
	eval_type: 'code-eval',
	benchmark: 'humaneval',
	model_id: 'test-model',
	status: 'completed',
	scheduled_for: null,
	error_message: null,
	meta: { code_eval_job_id: 'a95514d0' },
	created_at: 1,
	updated_at: 2,
	user: null
};

const details = [
	{
		task_id: 'HumanEval/0',
		prompt: 'def foo():',
		entry_point: 'foo',
		canonical_solution: '    return 1',
		reference_test: 'assert foo() == 1',
		samples: [
			{
				completion_id: 0,
				generation: 'def foo():\n    return 1',
				completion: '\n    return 1',
				passed: true,
				result: 'passed'
			}
		]
	},
	{
		// Real prod shape: humaneval + humanevalplus both number from
		// HumanEval/0 and the details payload concatenates them, so every
		// task_id arrives exactly twice. The keyed each rendered ZERO rows
		// with duplicate keys — this entry reproduces that.
		task_id: 'HumanEval/0',
		prompt: 'def foo():',
		entry_point: 'foo',
		canonical_solution: '    return 1',
		reference_test: 'assert foo() == 1\nassert foo.__doc__',
		samples: [
			{
				completion_id: 0,
				generation: 'def foo():\n    return 1',
				completion: '\n    return 1',
				passed: false,
				result: 'failed: AssertionError'
			}
		]
	},
	{
		task_id: 'HumanEval/1',
		prompt: 'def bar():',
		entry_point: 'bar',
		canonical_solution: '    return 2',
		reference_test: 'assert bar() == 2',
		samples: [
			{
				completion_id: 0,
				generation: 'def bar():\n    return 3',
				completion: '\n    return 3',
				passed: false,
				result: 'failed: AssertionError'
			}
		]
	}
];

beforeEach(() => {
	localStorage.setItem('token', 'test-token');
	detailsMock.mockReset();
	eventsMock.mockReset();
	detailsMock.mockResolvedValue(details);
	eventsMock.mockResolvedValue({ events: [], benchmarks: {} });
});

describe('LiveEvalView graded code-eval results', () => {
	it('renders per-task pass/fail rows from graded details', async () => {
		const { container } = render(LiveEvalView, {
			props: { job, onBack: () => {} },
			context: new Map([['i18n', readable({ t: (s: string) => s })]])
		} as never);

		await waitFor(() => {
			const rows = container.querySelectorAll('span.font-mono');
			const ids = Array.from(rows).map((r) => r.textContent?.trim());
			// Duplicate raw ids must be suffixed, and all three rows must
			// render — duplicate keys made the whole list render empty.
			expect(ids).toEqual(['HumanEval/0', 'HumanEval/0 (2)', 'HumanEval/1']);
		});

		expect(detailsMock).toHaveBeenCalledWith('test-token', 'a95514d0');
		expect(container.textContent).toContain('1 passed');
		expect(container.textContent).toContain('2 failed');
	});
});
