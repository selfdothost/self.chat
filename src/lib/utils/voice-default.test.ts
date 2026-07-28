import { describe, it, expect } from 'vitest';
import { orphanVoiceValue } from './voice-default';

describe('orphanVoiceValue (cavekit-audio-admin-surface R1 AC5)', () => {
	it('returns nothing when the stored default is in the offered set', () => {
		expect(orphanVoiceValue('af_heart', ['af_heart', 'am_puck'], true)).toBe('');
	});

	it('surfaces a hand-entered value that no offered voice matches', () => {
		expect(orphanVoiceValue('typo-voice', ['af_heart', 'am_puck'], true)).toBe('typo-voice');
	});

	it('surfaces a voice that has since left the catalog', () => {
		expect(orphanVoiceValue('af_retired', ['af_heart'], true)).toBe('af_retired');
	});

	it('surfaces the stored default when the offered set is legitimately empty', () => {
		// A hosted-provider deployment curates nothing: the aggregation behind
		// /voices/selectable covers self-hosted TTS connections only. An empty
		// list must never read as license to blank out the stored default.
		expect(orphanVoiceValue('alloy', [], true)).toBe('alloy');
	});

	it('treats the empty stored value as the explicit Default choice, not an orphan', () => {
		expect(orphanVoiceValue('', [], true)).toBe('');
		expect(orphanVoiceValue('', ['af_heart'], true)).toBe('');
	});

	it('stays silent until the offered set has actually loaded', () => {
		// Otherwise a perfectly valid default is flagged as missing for as long
		// as the fetch is in flight.
		expect(orphanVoiceValue('af_heart', [], false)).toBe('');
		expect(orphanVoiceValue('af_heart', ['af_heart'], false)).toBe('');
	});

	it('tolerates offered entries with no value', () => {
		// speechSynthesis voices are read for .voiceURI; a catalog entry can
		// carry a null field. Neither should ever match a stored voice.
		expect(orphanVoiceValue('af_heart', [undefined, null], true)).toBe('af_heart');
	});
});
