// Tokenization Studio Shell R3-AC5 — T-210 of
// context/plans/build-site-tokenization-shell.md.
//
// WHICH SAMPLER PRODUCED THIS TEXT. Phase 3 renders a probability distribution
// over tokens, and a distribution is only meaningful when it is attributable to
// the sampler that produced it. The Phase 1 spike is the concrete warning: at
// `temp 0.8 / top_p 0.9`, post-sampling probabilities returned 2 of 5 requested
// candidates, because `top_p` had already truncated the set before the
// alternatives were reported. An artist who cannot see the sampler in effect
// reads that as "the model was certain" -- a false conclusion about a character,
// drawn from a true number.
//
// So this module answers one question, purely, so it can be tested without
// mounting anything: given the account-wide params and the params the controls
// rail is holding for this session, what does the request actually carry, where
// did each value come from, and which of them can truncate the candidate set?

/** Where a value in effect came from. `model` means nothing was set on either
 *  side, so the serving model applies its own default and this surface does not
 *  know what that is -- stated as such rather than guessed. */
export type SamplingSource = 'session' | 'account' | 'model';

export type SamplingRow = {
	key: string;
	label: string;
	/** null = unset on both sides; the model's own default applies. */
	value: number | null;
	source: SamplingSource;
	/** True when this sampler can REMOVE candidates from the distribution, which
	 *  is the difference between "the model preferred one token" and "the sampler
	 *  deleted the alternatives before anyone looked". */
	truncating: boolean;
	/** An account-wide value suppressed by an explicit session `null`. The rail
	 *  writes `null` to mean "back to default", and because the session bag is
	 *  spread OVER the account bag that null wins -- so the account value is not
	 *  in effect, and saying so is the only honest rendering. */
	shadows?: number;
};

/** A params bag as the app passes it around: sparse, loosely keyed, `null`
 *  meaning "not set" (AdvancedParams.svelte writes null to clear a value). */
export type ParamsBag = Record<string, unknown> | null | undefined;

/** The sampler-relevant subset of AdvancedParams.svelte's ~20 fields, in the
 *  order that surface presents them.
 *
 *  Everything that shapes or restricts the token distribution is here, and
 *  nothing that does not (`num_ctx`, `use_mmap`, `num_thread`, ...). The list is
 *  deliberately complete rather than a curated highlight reel: omitting one
 *  active truncating sampler recreates exactly the misreading this display
 *  exists to prevent. */
export const SAMPLING_PARAMETERS: { key: string; label: string; truncating: boolean }[] = [
	{ key: 'temperature', label: 'Temperature', truncating: false },
	{ key: 'top_k', label: 'Top K', truncating: true },
	{ key: 'top_p', label: 'Top P', truncating: true },
	{ key: 'min_p', label: 'Min P', truncating: true },
	{ key: 'tfs_z', label: 'Tail Free Sampling', truncating: true },
	// Mirostat REPLACES top-k/top-p with its own feedback-controlled truncation,
	// so an active mirostat is as much an explanation for a short candidate list
	// as top_p is.
	{ key: 'mirostat', label: 'Mirostat', truncating: true },
	{ key: 'mirostat_tau', label: 'Mirostat Tau', truncating: false },
	{ key: 'mirostat_eta', label: 'Mirostat Eta', truncating: false },
	{ key: 'frequency_penalty', label: 'Frequency Penalty', truncating: false },
	{ key: 'repeat_last_n', label: 'Repeat Last N', truncating: false },
	{ key: 'seed', label: 'Seed', truncating: false }
];

const isSet = (v: unknown): v is number => v !== null && v !== undefined && v !== '';

/**
 * The sampling parameters actually in effect for a session.
 *
 * The merge mirrors the request body exactly (`Chat.svelte`: `params: {
 * ...$settings?.params, ...params }`) -- including the case that trips people
 * up, where the session bag holds an explicit `null` and therefore erases an
 * account-wide value rather than deferring to it. Anything else here would be a
 * second, divergent model of the request, which is the failure this display is
 * supposed to catch rather than commit.
 */
export const effectiveSamplingParams = (
	accountParams: ParamsBag,
	sessionParams: ParamsBag
): SamplingRow[] => {
	const account = accountParams ?? {};
	const session = sessionParams ?? {};

	return SAMPLING_PARAMETERS.map(({ key, label, truncating }) => {
		const inSession = isSet(session[key]);
		const inAccount = isSet(account[key]);
		const sessionCleared = key in session && !inSession;

		let value: number | null = null;
		if (inSession) value = session[key] as number;
		else if (inAccount && !sessionCleared) value = account[key] as number;

		const source: SamplingSource = inSession ? 'session' : value === null ? 'model' : 'account';

		const row: SamplingRow = { key, label, value, source, truncating };
		if (value === null && inAccount) row.shadows = account[key] as number;
		return row;
	});
};

/** The rows an artist must see to interpret a distribution: a sampler that is
 *  both ACTIVE and capable of removing candidates.
 *
 *  `mirostat: 0` is off, not active -- a zero here is a disabled sampler, unlike
 *  `top_k: 0` which llama.cpp also reads as disabled. Both are excluded for the
 *  same reason: a sampler that removes nothing explains nothing. */
export const truncatingSamplersInEffect = (rows: SamplingRow[]): SamplingRow[] =>
	rows.filter((r) => r.truncating && r.value !== null && r.value !== 0);

/** How a value reads in the panel. `null` is rendered as the word, never as a
 *  number this surface invented. */
export const formatSamplingValue = (value: number | null): string =>
	value === null ? 'default' : String(value);

/**
 * The one-line warning shown when the requested alternatives cannot all arrive.
 *
 * Returns null when nothing is truncating, so the caller cannot render a warning
 * and a clean sampler at the same time.
 */
export const truncationNotice = (rows: SamplingRow[], topLogprobs: number): string | null => {
	const active = truncatingSamplersInEffect(rows);
	if (active.length === 0) return null;

	const named = active.map((r) => `${r.label} ${formatSamplingValue(r.value)}`).join(', ');
	return topLogprobs > 0
		? `${named} truncates the candidate set — fewer than ${topLogprobs} alternatives may be returned per token.`
		: `${named} truncates the candidate set — alternatives fetched for a token may be fewer than the model considered.`;
};
