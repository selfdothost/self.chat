// Tokenization Studio Shell R1-AC3 — T-203 of
// context/plans/build-site-tokenization-shell.md.
//
// Which models a tokenization session can actually use, as a pure function
// rather than a condition inlined in the template.
//
// It lives here for two reasons. It is the rule, and a rule stated once is a
// rule that cannot drift between the gallery and the in-session model picker
// (R2-AC3 needs the same answer). And it is testable without mounting a
// component — which matters concretely in this repo, where component tests
// cannot currently load locally at all.

/** The subset of a model this rule reads. Kept minimal on purpose: widening it
 *  would invite the rule to depend on fields the picker has no business
 *  knowing about. */
export type SelectableModel = {
	id: string;
	owned_by?: string;
	arena?: boolean;
};

/** self.llamolotl-backed models are the only ones that can serve a tokenization
 *  session: the whole surface depends on `logprobs`/`top_logprobs`, which is a
 *  property of what llamolotl serves, not of the OpenAI-compatible shape every
 *  connection presents.
 *
 *  `owned_by` is a real discriminator, not an inference —
 *  `stores/models.ts` declares `LlamolotlModel { owned_by: 'llamolotl' }`, and
 *  the same file establishes the precedent of excluding arena models by exactly
 *  this test. */
export const isTokenizationSelectable = (model: SelectableModel): boolean =>
	model?.owned_by === 'llamolotl';

/** Why a model cannot be picked, for display next to it.
 *
 *  The kit permits hiding unusable models OR showing them as unavailable. This
 *  surface shows them, because a silently short gallery is indistinguishable
 *  from a failed load: an artist who cannot find their model has no way to tell
 *  whether it is unsupported here or whether the list simply did not arrive.
 *  Returns null when the model IS selectable, so a caller cannot render a
 *  reason and a working link at the same time. */
export const unavailableReason = (model: SelectableModel): string | null => {
	if (isTokenizationSelectable(model)) return null;
	if (model?.arena) return 'Arena models cannot be tokenized';
	return 'Not served by llamolotl';
};
