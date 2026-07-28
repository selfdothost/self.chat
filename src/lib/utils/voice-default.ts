// cavekit-audio-admin-surface R1 AC5 — "a stored default that is absent from the
// offered set is surfaced to the admin rather than silently discarded".
//
// A `<select>` bound to a value no option carries renders BLANK: Svelte's select
// binding falls through to `selectedIndex = -1` when nothing matches. The stored
// string does survive in JS (the binding only writes back on mount when the bound
// value is `undefined`, and the audio config's VOICE is always a string), so an
// untouched save still round trips it — but the admin is shown an empty control
// for a default that is very much configured. Surfacing means rendering the
// stored value as an extra, flagged option so it is both visible and, by
// construction, still the select's value.
//
// Extracted from the component so the decision itself is unit-testable.

/**
 * The stored voice, when it should be rendered as an extra "not in the offered
 * set" option; otherwise the empty string, meaning no such option is needed.
 *
 * @param storedVoice   The configured default (audio config `VOICE`). `''` is the
 *                      explicit unset/Default choice, which every branch already
 *                      offers as a real option — never an orphan.
 * @param offeredValues The option values the control currently offers.
 * @param offeredLoaded Whether `offeredValues` reflects a completed load. An
 *                      EMPTY offered set is a legitimate outcome — the voice
 *                      aggregation covers self-hosted TTS connections only, so a
 *                      deployment on a hosted provider curates nothing — which is
 *                      indistinguishable from "not fetched yet" without this
 *                      flag. Passing `false` suppresses the option so a valid
 *                      voice is not briefly mislabelled mid-load.
 */
export const orphanVoiceValue = (
	storedVoice: string,
	offeredValues: (string | undefined | null)[],
	offeredLoaded: boolean
): string => {
	if (!offeredLoaded) {
		return '';
	}

	if (storedVoice === '') {
		return '';
	}

	return offeredValues.includes(storedVoice) ? '' : storedVoice;
};
