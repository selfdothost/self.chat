// Tokenization Studio Shell R6 — T-209 of
// context/plans/build-site-tokenization-shell.md.
//
// Which saved prompts the tokenization composer may offer, as a pure function.
//
// It lives here rather than inline in the picker for the same two reasons
// `selectable.ts` does: it is the rule, stated once; and it is testable without
// mounting a component, which matters concretely in this repo because component
// tests cannot currently load locally at all.
//
// Nothing here touches Prompts storage, the Prompts API, or its access control
// (R6-AC4). The list this filters is whatever `GET /api/v1/prompts/` already
// returned for this user — the server has done the access-control filtering
// before we see it, and we only ever narrow that list further.

/** The subset of a saved prompt this rule reads. Deliberately minimal: the
 *  picker has no business knowing about ownership, timestamps or
 *  `access_control`, and widening this type would invite it to start caring. */
export type PresetPrompt = {
	command: string;
	title: string;
	content: string;
};

/**
 * A `{{...}}` slot in prompt text.
 *
 * Non-global on purpose. A `/g` regex carries `lastIndex` between `.test()`
 * calls, so a shared global constant would return alternating answers for the
 * same input — the classic way this exact kind of predicate goes wrong.
 */
const VARIABLE_SLOT = /\{\{[^{}]*\}\}/;

/** Does this prompt body contain a variable slot of any kind? */
export const usesVariables = (content: string | null | undefined): boolean =>
	VARIABLE_SLOT.test(content ?? '');

/**
 * THE VARIABLES DECISION (R6-AC3): variables are **NOT supported** in the
 * tokenization composer, and prompts that use them are excluded from the picker
 * rather than inserted as a template the artist cannot fill.
 *
 * Two separate reasons, one per class of variable, and either alone is
 * sufficient:
 *
 * 1. The *auto-substituted* ones — `{{CURRENT_TIME}}`, `{{CURRENT_DATE}}`,
 *    `{{USER_NAME}}`, `{{CLIPBOARD}}` and friends — resolve to different text
 *    on every insertion. That destroys the entire premise of this surface.
 *    Decision 8 of the treasuremap is that an artist tells two characters apart
 *    by holding the prompt FIXED and varying the model; a prompt whose text
 *    changes between runs is not fixed, so any difference in the resulting
 *    token stream is no longer attributable to the model. A comparison surface
 *    that silently varies its own input is worse than one that declines.
 *
 * 2. The *user-filled* ones — `{{topic}}` and the like — are filled in normal
 *    chat by tab-navigating the highlighted slots inside the chat input
 *    (`findWordIndices`, driven from MessageInput's keydown handling after a
 *    `/command` insertion). This picker does not drive that machinery, so
 *    offering such a prompt would hand the artist a template with no way to
 *    fill it — and a sent-unfilled prompt tokenizes the literal braces, which
 *    is a silently wrong measurement rather than a visible failure.
 *
 * One uniform rule covers both: if the body contains a `{{...}}` slot, the
 * prompt is not offered. Excluding is what the kit asks for when variables are
 * unsupported, and it means the picker never shows a prompt it cannot honour.
 *
 * Empty-bodied prompts are dropped too — selecting one would insert nothing,
 * which is indistinguishable from a broken picker.
 *
 * Ordering is by title, matching `MessageInput/Commands/Prompts.svelte`, so the
 * two places a prompt can be chosen agree on what "the third one" means.
 */
export const offerablePrompts = (
	prompts: readonly (Partial<PresetPrompt> | null | undefined)[] | null | undefined
): PresetPrompt[] =>
	(prompts ?? [])
		.filter(
			(p): p is PresetPrompt =>
				typeof p?.content === 'string' &&
				p.content.trim() !== '' &&
				!usesVariables(p.content) &&
				typeof p?.command === 'string'
		)
		.map((p) => ({ command: p.command, title: p.title ?? p.command, content: p.content }))
		.sort((a, b) => a.title.localeCompare(b.title));
