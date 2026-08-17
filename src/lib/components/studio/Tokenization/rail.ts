// Tokenization Studio Shell R5 — T-208 of
// context/plans/build-site-tokenization-shell.md.
//
// Where "pinned on wide viewports" is DECIDED. It lives here, on the surface
// that wants the rail pinned, because ChatControls already implements both
// presentations and Chat must never learn why a caller wants one of them.
// Chat is handed a boolean; this module is the only place that knows what the
// boolean means.

/**
 * The viewport at which `ChatControls` stops presenting a Drawer *over* the
 * conversation and starts presenting a pinned rail beside it — its
 * `largeScreen`, set from this exact query twice: once in the `initialSize`
 * snapshot and again in the `onMount` media listener.
 *
 * A deliberate MIRROR rather than an import, and named duct tape. ChatControls
 * hard-codes the literal, and its own tests cannot run in this checkout
 * (`@tailwindcss/postcss` is absent from the shared node_modules), so editing a
 * chat component purely to export a constant would be an unverifiable change
 * for no behavioural gain. `rail.test.ts` reads ChatControls.svelte and fails
 * if the two ever drift, which is the property that actually matters.
 */
export const CONTROLS_RAIL_MEDIA_QUERY = '(min-width: 1024px)';

/**
 * Whether this viewport can present the controls as a pinned rail at all.
 *
 * Below the breakpoint ChatControls renders a `Drawer` across the conversation.
 * Opening that unasked would bury the very thing the artist came to look at, so
 * R5-AC2 requires the narrow presentation to stay collapsed on entry — hence a
 * viewport question rather than an unconditional `true`.
 *
 * Answered ONCE, at entry, and deliberately not reactive. R5-AC3 and R5-AC6: a
 * value that tracked the viewport would re-open a rail the artist had just
 * closed the instant they resized a window, and expressing it as an `$effect`
 * that wrote `showControls` while reading it is exactly the loop
 * `ChatControls.svelte:191-217` documents and R5-AC5 forbids re-arming.
 *
 * The matcher is a parameter so the decision itself is testable — component
 * tests cannot mount in this checkout, so a rule that could only be exercised
 * through a mounted component could not be tested at all.
 */
export const controlsRailIsPinned = (
	matches: (query: string) => boolean = (query) => window.matchMedia(query).matches
): boolean => matches(CONTROLS_RAIL_MEDIA_QUERY);
