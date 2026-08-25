import { describe, it, expect } from 'vitest';
import { mergeModelIntoEditorInfo } from './model-editor-init';
import type { ModelConfig } from '$lib/apis';

// Regression tests for self.chat#55.
//
// Reopening the Studio Model Editor on an already-loaded model crashed the
// page blank with Svelte 5's `props_invalid_value` error.  The crash originated
// in Textarea.svelte which declares `value = $bindable('')` (a string default).
// When ModelEditor.svelte spreads a loaded model onto its `info` state, and that
// model has no system prompt (the submit handler deletes the key when blank),
// `info.params.system` ends up `null` / `undefined`.  Svelte 5's runtime
// prop-type validator then rejects the non-string value at mount.
//
// The fix lives in mergeModelIntoEditorInfo — the init helper that owns the
// merge-and-normalise step — and the tests below pin the exact failure shapes
// that were observed in production (loaded model with status "loaded",
// base_model_id set, no system prompt stored).

const BASE_INFO: ModelConfig = {
	id: '',
	name: '',
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	base_model_id: null as any,
	meta: {
		profile_image_url: '/static/favicon.png',
		description: '',
		suggestion_prompts: null,
		tags: []
	},
	params: { system: '' }
};

describe('mergeModelIntoEditorInfo — params.system normalisation', () => {
	it('preserves a non-empty system prompt from the model', () => {
		const model = {
			id: 'qwestrel',
			name: 'Qwestrel',
			params: { system: 'You are a coding assistant.' },
			meta: {}
		};
		const result = mergeModelIntoEditorInfo(BASE_INFO, model);
		expect(result.params.system).toBe('You are a coding assistant.');
	});

	it('defaults params.system to "" when the model has no system key (saved without a prompt)', () => {
		// This is the primary repro: a model saved without a system prompt has
		// the `system` key deleted by the submit handler, so it is absent on load.
		const model = { id: 'qwestrel', name: 'Qwestrel', params: {}, meta: {} };
		const result = mergeModelIntoEditorInfo(BASE_INFO, model);
		expect(typeof result.params.system).toBe('string');
		expect(result.params.system).toBe('');
	});

	it('defaults params.system to "" when the model stores it as null', () => {
		// Some serialisation paths emit `null` rather than omitting the key.
		const model = { id: 'qwestrel', name: 'Qwestrel', params: { system: null }, meta: {} };
		const result = mergeModelIntoEditorInfo(BASE_INFO, model);
		expect(typeof result.params.system).toBe('string');
		expect(result.params.system).toBe('');
	});

	it('defaults params.system to "" when the model has no params key at all', () => {
		// Older model records or edge cases with a completely absent params bag.
		const model = { id: 'qwestrel', name: 'Qwestrel', meta: {} };
		const result = mergeModelIntoEditorInfo(BASE_INFO, model);
		expect(typeof result.params.system).toBe('string');
		expect(result.params.system).toBe('');
	});

	it('merges other model fields onto the base info', () => {
		const model = {
			id: 'Qwen3-Coder-Next-UD-Q3_K_XL',
			name: 'Qwestrel',
			base_model_id: 'Qwen3-Coder-Next-UD-Q3_K_XL',
			params: { temperature: 0.7 },
			meta: { description: 'A coding model', tags: [{ name: 'code' }] },
			access_control: null
		};
		const result = mergeModelIntoEditorInfo(BASE_INFO, model);
		expect(result.id).toBe('Qwen3-Coder-Next-UD-Q3_K_XL');
		expect(result.name).toBe('Qwestrel');
		expect(result.meta.description).toBe('A coding model');
		// system must still be a string even though only temperature was set
		expect(typeof result.params.system).toBe('string');
		expect(result.params.system).toBe('');
		expect(result.params.temperature).toBe(0.7);
	});
});
