import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { visionSupport } from '$lib/utils/model-capabilities';

// self.chat#54 piece 1. The defect is a literal in ModelEditor.svelte's initial
// `$state`, and the thing it breaks happens on the server (self.ai's precedence
// rule), so there is nothing to observe from a mounted component: the editor
// renders an unchecked box either way. What distinguishes the two worlds is
// whether the created row carries a `vision` key at all.
//
// So: a static guard on the literal, plus a real assertion about the round-trip
// that literal goes through — same shape as
// src/lib/components/chat/vision-guard-error-persistence.test.ts next door.

const modelEditorSrc = readFileSync(
	resolve(process.cwd(), 'src/lib/components/studio/Models/ModelEditor.svelte'),
	'utf-8'
);

const capabilitiesSrc = readFileSync(
	resolve(process.cwd(), 'src/lib/components/studio/Models/Capabilities.svelte'),
	'utf-8'
);

/** The initial `capabilities` $state literal, comments stripped. */
const capabilityDefaults = () => {
	const start = modelEditorSrc.indexOf('let capabilities = $state({');
	expect(start).toBeGreaterThan(-1);
	const end = modelEditorSrc.indexOf('});', start);
	expect(end).toBeGreaterThan(start);
	return modelEditorSrc.slice(start, end);
};

describe('self.chat#54: a new model does not claim vision unless the admin says so', () => {
	it('does not stamp `vision: true` into a freshly created model', () => {
		// The form default that beat self.ai#139's derived value and turned
		// `gem8y` — an `input_modalities: ["text"]` base — into an advertised
		// vision model.
		expect(capabilityDefaults()).not.toContain('vision: true');
	});

	it('leaves vision undeclared rather than declaring it false', () => {
		// `false` is not a safer `true`: it is an explicit, authoritative refusal
		// that would hard-block images to cloud-backed models which expose no
		// `architecture` to derive from. Undeclared is the honest state.
		expect(capabilityDefaults()).toContain('vision: undefined');
		expect(capabilityDefaults()).not.toContain('vision: false');
	});

	it('keeps the vision key present so the checkbox still renders', () => {
		// Capabilities.svelte iterates the keys of the object it is handed, so
		// omitting `vision` entirely would remove the control and leave an admin
		// no way to declare vision for a cloud model.
		expect(capabilitiesSrc).toContain('{#each Object.keys(capabilities) as capability');
		expect(capabilityDefaults()).toContain('vision:');
	});

	it('an undeclared vision does not survive serialisation as a claim', () => {
		// This is the whole point of `undefined` over `false`: the key is dropped
		// on the way to the server, so the stored row carries no override and the
		// derived value wins.
		const submitted = JSON.parse(
			JSON.stringify({ vision: undefined, usage: undefined, citations: true })
		);

		expect('vision' in submitted).toBe(false);
		expect(visionSupport({ info: { meta: { capabilities: submitted } } })).toBe('unknown');
	});

	it('an admin who ticks the box still produces an authoritative claim', () => {
		// The un-regressed half: `numberone` legitimately carries vision: true,
		// and nothing here may take that away.
		const submitted = JSON.parse(
			JSON.stringify({ vision: true, usage: undefined, citations: true })
		);

		expect(visionSupport({ info: { meta: { capabilities: submitted } } })).toBe('supported');
	});

	it('an admin who unticks it still produces an authoritative refusal', () => {
		const submitted = JSON.parse(
			JSON.stringify({ vision: false, usage: undefined, citations: true })
		);

		expect(visionSupport({ info: { meta: { capabilities: submitted } } })).toBe('unsupported');
	});

	it('editing an existing model still adopts its stored capabilities', () => {
		// The default only applies where the row says nothing; a stored value has
		// to win the spread, or opening and saving a vision model would strip it.
		expect(modelEditorSrc).toContain(
			'capabilities = { ...capabilities, ...(model?.meta?.capabilities ?? {}) }'
		);
	});
});
