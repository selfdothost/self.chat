import { describe, it, expect } from 'vitest';
import { errorDetailToMessage } from './index';

// self.ai#35: the GPU-window lease checkpoint refuses local generation during a
// training or curator window with a STRUCTURED FastAPI detail --
//   {"detail": "GPU dedicated to the active training window ...",
//    "gpu_locked_by": "training"}
// -- so a caller can tell "GPU policy" from "llamolotl is down". The chat call
// site rendered that with `${err?.detail}`, which stringifies an object as
// "[object Object]", so the one error the server made readable was the one the
// user could not read. Measured live 2026-08-04 against a real training window.

const GPU_REFUSAL = {
	detail: 'GPU dedicated to the active training window — local inference temporarily unavailable',
	gpu_locked_by: 'training'
};

describe('errorDetailToMessage', () => {
	it('surfaces the human sentence from a structured GPU-window refusal', () => {
		expect(errorDetailToMessage(GPU_REFUSAL, 'Network Problem')).toBe(
			'GPU dedicated to the active training window — local inference temporarily unavailable'
		);
	});

	it('surfaces the sentence from the fail-closed unknown-window refusal', () => {
		expect(
			errorDetailToMessage(
				{
					detail: 'GPU window status unknown — local inference temporarily unavailable',
					gpu_status_unknown: true
				},
				'Network Problem'
			)
		).toBe('GPU window status unknown — local inference temporarily unavailable');
	});

	it('passes a plain string detail through unchanged', () => {
		expect(errorDetailToMessage('Model not found', 'Network Problem')).toBe('Model not found');
	});

	it('falls back when there is no detail at all', () => {
		expect(errorDetailToMessage(undefined, 'Network Problem')).toBe('Network Problem');
		expect(errorDetailToMessage(null, 'Network Problem')).toBe('Network Problem');
	});

	it('reads a `message` key when the object has no inner `detail`', () => {
		expect(errorDetailToMessage({ message: 'upstream refused' }, 'Network Problem')).toBe(
			'upstream refused'
		);
	});

	it('never returns "[object Object]" for an object it cannot read', () => {
		const opaque = { gpu_locked_by: 'training' };
		const out = errorDetailToMessage(opaque, 'Network Problem');
		expect(out).not.toBe('[object Object]');
		expect(out).toBe('{"gpu_locked_by":"training"}');
	});

	it('falls back rather than throwing on a circular object', () => {
		const circular: Record<string, unknown> = { gpu_locked_by: 'training' };
		circular.self = circular;
		expect(errorDetailToMessage(circular, 'Network Problem')).toBe('Network Problem');
	});
});
