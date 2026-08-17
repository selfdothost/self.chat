// self.chat#51 — the vision guard never fired because `capabilities?.vision ?? true`
// collapses three distinct states into two.
//
// Measured against the live `self_ai` database: 97 of 101 `model` rows carry
// `meta->'capabilities'` = JSON `null`, NOT `{"vision": false}`. So
// `null?.vision` is `undefined`, `?? true` turns every text-only model into an
// advertised vision model, and every guard built on that expression is dead
// code.
//
// The fix is a tri-state, not a flipped default. Flipping the bare default to
// `false` would block image sends to cloud/proxied models that are genuinely
// vision-capable but were never annotated — a different, louder bug. So:
//
//   supported   — an explicit `vision: true`. Send images.
//   unsupported — an explicit `vision: false`. Hard-block; this is the only
//                 state we refuse on.
//   unknown     — no `capabilities` object, or one that says nothing about
//                 vision. Permit the send and let the backend answer; we do not
//                 have sufficient data to refuse.
//
// selfshipyard/selfai/self.ai#139 lands the server-side derivation of
// `capabilities.vision` from llamolotl's `architecture.input_modalities`. When
// it does, llamolotl-backed models move from `unknown` to an explicit boolean
// and this function starts refusing them without any change here — which is
// exactly the point of respecting the tri-state rather than guessing.

export type VisionSupport = 'supported' | 'unsupported' | 'unknown';

/** The subset of a model entry this module reads. */
export interface ModelWithCapabilities {
	info?: {
		meta?: {
			capabilities?: {
				vision?: unknown;
			} | null;
		} | null;
	} | null;
}

/**
 * What the model claims about image input.
 *
 * Anything that is not literally `true` or `false` — a missing model, a missing
 * `capabilities` object, a `null` one, a non-boolean `vision` value — is
 * `'unknown'`. Absence of a claim is not a claim.
 */
export const visionSupport = (model: ModelWithCapabilities | null | undefined): VisionSupport => {
	const vision = model?.info?.meta?.capabilities?.vision;

	if (vision === true) {
		return 'supported';
	}
	if (vision === false) {
		return 'unsupported';
	}
	return 'unknown';
};

/**
 * Whether image input to this model must be refused outright.
 *
 * True only for an explicit `vision: false`. Callers use this as the block
 * condition so that `unknown` keeps working the way it does today.
 */
export const blocksImageInput = (model: ModelWithCapabilities | null | undefined): boolean =>
	visionSupport(model) === 'unsupported';
