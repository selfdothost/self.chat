import type { ModelConfig } from '$lib/apis';

/**
 * Merge a raw model object (from the store / API) into the editor's base info
 * template and normalise fields that downstream Svelte components require to
 * be specific types.
 *
 * The critical case (self.chat#55): a model that was saved without a system
 * prompt has `params.system` absent or `null` (the submit handler deletes the
 * key when it is blank).  When `model` is spread on top of `info`, the key
 * from `model.params` wins and `info.params.system` becomes `null` /
 * `undefined`.  `Textarea.svelte` declares `value = $bindable('')` — a string
 * default — and Svelte 5's runtime prop-type validator throws
 * `props_invalid_value` the moment it receives `null`.
 *
 * Normalisation is done here (in the init path) rather than at the call site
 * so that every consumer of the returned `info` object is consistent.
 */
export function mergeModelIntoEditorInfo(
	baseInfo: ModelConfig,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	model: Record<string, any>
): ModelConfig {
	const merged: ModelConfig = {
		...baseInfo,
		// Deep-clone via JSON round-trip to avoid aliasing store references.
		...JSON.parse(JSON.stringify(model))
	};

	// Guarantee params is a plain object (it may be absent if the model was
	// created before the params key was introduced).
	if (!merged.params || typeof merged.params !== 'object') {
		merged.params = {};
	}

	// `system` must be a string — Textarea.svelte requires it.
	merged.params.system = merged.params.system ?? '';

	return merged;
}
