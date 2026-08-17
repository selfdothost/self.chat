// Tokenization Studio Shell R3 — T-205 of
// context/plans/build-site-tokenization-shell.md.
//
// The session's request defaults, declared ONCE. R3-AC4 requires the
// `top_logprobs` default to live in one place rather than being repeated at
// call sites, because it is the single number that decides how expensive every
// reply is.

/**
 * How many alternative tokens the STREAM asks for per position.
 *
 * Zero, and that is a measurement rather than a guess. The Phase 1 spike ran
 * against a live llamolotl (gemma-4-26B, 2026-08-11):
 *
 *   top_logprobs=10  ->  968 bytes/token   (~945 KiB per 1000 tokens)
 *   top_logprobs=0   ->  ~110 KiB per 1000 tokens
 *
 * Alternatives are 92% of the payload. At 0 the reply still carries a chosen
 * token and its probability — enough for the confidence heatmap the token view
 * renders — and Phase 3 fetches the alternatives for ONE position on click,
 * which is the only moment an artist actually looks at them. Streaming all ten
 * everywhere would pay ~9x the bandwidth for data that is almost never read.
 *
 * Raising this is a legitimate per-session choice, which is why it is a default
 * and not a constant folded into the request builder.
 */
export const DEFAULT_TOP_LOGPROBS = 0;

/**
 * The request fields a tokenization session always sends.
 *
 * `logprobs: true` is what makes the surface possible at all: llamolotl maps it
 * onto llama.cpp's native `n_probs`, so the reply carries per-token
 * distributions instead of only text.
 *
 * Built as a function rather than a frozen object so the caller's chosen
 * `topLogprobs` flows through the same single definition — there is no second
 * place where these field names are written.
 */
export const tokenizationRequestExtras = (
	topLogprobs: number = DEFAULT_TOP_LOGPROBS
): Record<string, unknown> => ({
	logprobs: true,
	top_logprobs: topLogprobs
});
