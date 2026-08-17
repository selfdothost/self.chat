import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	SAMPLING_PARAMETERS,
	effectiveSamplingParams,
	formatSamplingValue,
	truncatingSamplersInEffect,
	truncationNotice
} from './sampling';

// Tokenization Studio Shell R3-AC5 — T-210.
//
// "Displayed, not merely settable." The thing that can silently break is not
// whether a panel renders -- it is whether the numbers on it are the numbers the
// request carries. A panel that shows a plausible-but-wrong sampler is strictly
// worse than no panel, because it licenses exactly the false conclusion the
// criterion exists to prevent (the Phase 1 spike: 2 of 5 candidates returned,
// because top_p had truncated the set before anyone looked).
//
// So the merge semantics are tested directly against Chat.svelte's request body,
// and the source of that body is read here rather than assumed.

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const chatSrc = read('src/lib/components/chat/Chat.svelte');
const panelSrc = read('src/lib/components/studio/Tokenization/SamplingPanel.svelte');
const sessionSrc = read('src/routes/(app)/studio/tokenization/session/+page.svelte');
const advancedSrc = read('src/lib/components/chat/Settings/Advanced/AdvancedParams.svelte');

describe('R3-AC5 — the displayed values are the values sent', () => {
	it('merges account then session, exactly as the request body does', () => {
		const rows = effectiveSamplingParams({ temperature: 0.2, top_p: 0.5 }, { top_p: 0.9 });
		const by = Object.fromEntries(rows.map((r) => [r.key, r]));

		expect(by.top_p.value).toBe(0.9);
		expect(by.top_p.source).toBe('session');
		expect(by.temperature.value).toBe(0.2);
		expect(by.temperature.source).toBe('account');
	});

	it('reports an unset parameter as the model default, never as a guess', () => {
		const rows = effectiveSamplingParams({}, {});
		expect(rows.every((r) => r.value === null && r.source === 'model')).toBe(true);
		// AdvancedParams offers 0.8 / 0.9 / 40 as the value it SEEDS a control with
		// on first click. Those are UI seeds, not the server's defaults, and
		// printing one for an unset parameter would be this panel inventing a fact.
		expect(formatSamplingValue(null)).toBe('default');
		expect(rows.map((r) => formatSamplingValue(r.value))).not.toContain('0.9');
	});

	it('an explicit session null SHADOWS the account value, and says so', () => {
		// The trap. The rail writes `null` to mean "back to default", and because
		// the session bag is spread OVER the account bag, that null wins -- the
		// saved 0.5 is NOT in effect. Rendering 0.5 here would be a lie about the
		// sampler that produced the text.
		const rows = effectiveSamplingParams({ top_p: 0.5 }, { top_p: null });
		const top_p = rows.find((r) => r.key === 'top_p');

		expect(top_p?.value).toBe(null);
		expect(top_p?.source).toBe('model');
		expect(top_p?.shadows).toBe(0.5);
	});

	it('keeps a zero, which is a real setting and not an absence', () => {
		const rows = effectiveSamplingParams({}, { seed: 0, min_p: 0 });
		expect(rows.find((r) => r.key === 'seed')?.value).toBe(0);
		expect(rows.find((r) => r.key === 'seed')?.source).toBe('session');
		expect(formatSamplingValue(0)).toBe('0');
	});

	it('tolerates absent bags rather than throwing on a fresh session', () => {
		expect(effectiveSamplingParams(undefined, undefined)).toHaveLength(
			SAMPLING_PARAMETERS.length
		);
		expect(effectiveSamplingParams(null, null).every((r) => r.value === null)).toBe(true);
	});
});

describe('R3-AC5 — every sampler that can truncate is covered', () => {
	it('lists each of AdvancedParams sampling fields', () => {
		// A curated highlight reel recreates the misreading this display prevents:
		// one active truncating sampler left off the list is one unexplained short
		// candidate set. So the list is checked against the form that sets them.
		for (const key of [
			'temperature',
			'top_k',
			'top_p',
			'min_p',
			'tfs_z',
			'mirostat',
			'mirostat_tau',
			'mirostat_eta',
			'frequency_penalty',
			'repeat_last_n',
			'seed'
		]) {
			expect(
				SAMPLING_PARAMETERS.some((p) => p.key === key),
				`${key} is settable in AdvancedParams but is not displayed`
			).toBe(true);
			expect(advancedSrc, `${key} is claimed here but AdvancedParams does not set it`).toContain(
				`params.${key}`
			);
		}
	});

	it('marks the candidate-set truncating samplers and only those', () => {
		const truncating = SAMPLING_PARAMETERS.filter((p) => p.truncating).map((p) => p.key);
		expect(truncating.sort()).toEqual(['min_p', 'mirostat', 'tfs_z', 'top_k', 'top_p']);
	});

	it('names the truncating sampler in effect, with the requested depth', () => {
		const rows = effectiveSamplingParams({}, { temperature: 0.8, top_p: 0.9 });
		expect(truncatingSamplersInEffect(rows).map((r) => r.key)).toEqual(['top_p']);

		const notice = truncationNotice(rows, 5);
		expect(notice).toContain('Top P 0.9');
		expect(notice).toContain('5');
		// Temperature reshapes the distribution; it does not delete candidates, so
		// blaming it for a short list would send the artist after the wrong dial.
		expect(notice).not.toContain('Temperature');
	});

	it('says nothing when nothing truncates', () => {
		expect(truncationNotice(effectiveSamplingParams({}, { temperature: 0.8 }), 5)).toBe(null);
		// 0 is OFF for these, not "truncate to nothing".
		expect(truncationNotice(effectiveSamplingParams({}, { top_k: 0, mirostat: 0 }), 5)).toBe(null);
	});

	it('still warns when no alternatives are streamed, without naming a count', () => {
		// The default is top_logprobs 0 (alternatives fetched on click in Phase 3).
		// Truncation still applies to what that click can return.
		const notice = truncationNotice(effectiveSamplingParams({}, { min_p: 0.05 }), 0);
		expect(notice).toContain('Min P 0.05');
		expect(notice).not.toContain('fewer than 0');
	});
});

describe('R3-AC5 — the panel shows the sampler and reflects the rail', () => {
	it('the session binds Chat params out and hands them to the panel', () => {
		expect(sessionSrc).toMatch(/bind:params=\{chatParams\}/);
		expect(sessionSrc).toMatch(/<SamplingPanel[^>]*sessionParams=\{chatParams\}/);
	});

	it('top_logprobs is shown and settable from the same session value', () => {
		expect(sessionSrc).toMatch(/<SamplingPanel[^>]*bind:topLogprobs/);
		expect(panelSrc).toMatch(/bind:value=\{topLogprobs\}/);
		expect(panelSrc).toMatch(/topLogprobs = \$bindable/);
		// Still sourced from the one declaration of the default (R3-AC4).
		expect(sessionSrc).toContain('DEFAULT_TOP_LOGPROBS');
	});

	it('renders the values themselves, not only a disclosure', () => {
		// Settable-and-hidden is the state R3-AC5 rules out, so the values must not
		// live behind the expand toggle.
		const collapsedRegion = panelSrc.slice(
			panelSrc.indexOf('data-sampling-values'),
			panelSrc.indexOf('{#if expanded}')
		);
		expect(collapsedRegion).toContain('formatSamplingValue(row.value)');
		expect(collapsedRegion).toContain('{topLogprobs}');
	});

	it('resolves both bags — the account store and the rail-fed prop', () => {
		// Both halves matter and each can be lost independently. Drop the store and
		// a saved temperature vanishes from the display while still being sent;
		// drop the prop and the panel stops reflecting the rail at all, which is
		// the half R3-AC5 names.
		expect(panelSrc).toMatch(
			/effectiveSamplingParams\(\s*\$settings\?\.params[^,]*,\s*sessionParams\s*\)/
		);
		expect(
			panelSrc,
			'sessionParams must be a PROP — a local of the same name silently strands the rail'
		).toMatch(/let \{[\s\S]*?sessionParams = \{\}[\s\S]*?\}: Props = \$props\(\);/);
	});

	it('never writes a sampling value — the rail stays the only editor', () => {
		// A second editor for the same values is a second source of truth, and the
		// one that loses is whichever the artist was not looking at.
		expect(panelSrc).not.toMatch(/settings\.set/);
		expect(panelSrc).not.toMatch(/bind:value=\{sessionParams/);
		expect(panelSrc).not.toMatch(/sessionParams\.\w+\s*=/);
		// Non-bindable on purpose: writes here could not reach the rail anyway, so
		// a bindable would only invite one to be attempted.
		expect(panelSrc).not.toMatch(/sessionParams = \$bindable/);
	});
});

describe('R3-AC5 — the merge mirrors the request body it claims to show', () => {
	it('Chat still builds params as account-then-session', () => {
		// If this ever changes shape, effectiveSamplingParams() is displaying a
		// different request from the one being sent, and every number on the panel
		// becomes unattributable.
		const body = chatSrc.slice(chatSrc.indexOf('params: {', chatSrc.indexOf('generateOpenAIChatCompletion')));
		expect(body).toMatch(/params: \{\s*\.\.\.\$settings\?\.params,\s*\.\.\.params,/);
	});
});
