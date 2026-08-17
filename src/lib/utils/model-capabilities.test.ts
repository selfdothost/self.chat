import { describe, it, expect } from 'vitest';
import { visionSupport, blocksImageInput } from './model-capabilities';

// self.chat#51. Every case below is drawn from the measured distribution of
// `meta->'capabilities'` in the live `self_ai` model table:
//
//   null                                              97 rows
//   {"vision": true}                                   1 row  (Qwen2.5-VL-7B-Instruct-Q4_K_M)
//   {"usage": false, "vision": false, "citations": true}   1 row
//   {"usage": false, "vision": true,  "citations": true}   1 row
//   {"vision": true, "citations": true}                1 row
//
// The old expression was `capabilities?.vision ?? true`, which maps the 97-row
// null case to "vision capable". The `capabilities: null` assertions below are
// the ones that pin the policy; the `vision: false` assertions are the ones
// that would have failed outright against it.

const model = (capabilities: unknown) => ({ info: { meta: { capabilities } } });

describe('visionSupport: three states, not two', () => {
	it('reports an explicit vision:true as supported', () => {
		expect(visionSupport(model({ vision: true }))).toBe('supported');
		expect(visionSupport(model({ usage: false, vision: true, citations: true }))).toBe(
			'supported'
		);
		expect(visionSupport(model({ vision: true, citations: true }))).toBe('supported');
	});

	it('reports an explicit vision:false as unsupported', () => {
		expect(visionSupport(model({ vision: false }))).toBe('unsupported');
		expect(visionSupport(model({ usage: false, vision: false, citations: true }))).toBe(
			'unsupported'
		);
	});

	it('reports a null capabilities object as unknown, not capable', () => {
		// The 97-row case. `?? true` called this "supported"; it is a model that
		// has simply never been annotated.
		expect(visionSupport(model(null))).toBe('unknown');
	});

	it('reports a missing capabilities object as unknown', () => {
		expect(visionSupport(model(undefined))).toBe('unknown');
		expect(visionSupport({ info: { meta: {} } })).toBe('unknown');
		expect(visionSupport({ info: {} })).toBe('unknown');
		expect(visionSupport({})).toBe('unknown');
	});

	it('reports capabilities that say nothing about vision as unknown', () => {
		expect(visionSupport(model({ usage: false, citations: true }))).toBe('unknown');
	});

	it('reports a missing model as unknown rather than throwing', () => {
		// $models.find() misses whenever the picker holds an id the catalog no
		// longer serves. That must not become a hard refusal, nor a crash.
		expect(visionSupport(undefined)).toBe('unknown');
		expect(visionSupport(null)).toBe('unknown');
	});

	it('does not treat a truthy non-boolean as an explicit claim', () => {
		// Only a literal boolean is a claim. A stray string is bad data, and bad
		// data is not evidence in either direction.
		expect(visionSupport(model({ vision: 'true' }))).toBe('unknown');
		expect(visionSupport(model({ vision: 1 }))).toBe('unknown');
		expect(visionSupport(model({ vision: 0 }))).toBe('unknown');
		expect(visionSupport(model({ vision: null }))).toBe('unknown');
	});
});

describe('blocksImageInput: refuse on an explicit false and nothing else', () => {
	it('blocks a model that declares vision:false', () => {
		expect(blocksImageInput(model({ vision: false }))).toBe(true);
	});

	it('does not block a model that declares vision:true', () => {
		expect(blocksImageInput(model({ vision: true }))).toBe(false);
	});

	it('does not block an unannotated model', () => {
		// Deliberate policy, not an oversight: a cloud/proxied model that is
		// genuinely vision-capable also carries `capabilities: null` today, and
		// blanket-blocking those would be a louder bug than the one being fixed.
		// selfshipyard/selfai/self.ai#139 populates an explicit boolean for
		// llamolotl-backed models; when it lands, those move to `unsupported` and
		// start being refused here with no further change.
		expect(blocksImageInput(model(null))).toBe(false);
		expect(blocksImageInput(model(undefined))).toBe(false);
		expect(blocksImageInput(undefined)).toBe(false);
	});
});
