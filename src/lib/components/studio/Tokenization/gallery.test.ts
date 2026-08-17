import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Tokenization Studio Shell R1 — T-202 of
// context/plans/build-site-tokenization-shell.md.
//
// Source guards rather than render assertions, for the same reason
// mod-nav-routing.test.ts uses them: what R1 actually requires is the ABSENCE of
// things (no create, no edit, no delete) and the presence of one specific href.
// A render test proves a control is not on screen in one state; reading the
// source proves the component has no code path that could produce it at all.

const root = process.cwd();
const galleryPath = resolve(root, 'src/lib/components/studio/Tokenization/Gallery.svelte');
const gallerySrc = readFileSync(galleryPath, 'utf-8');
const modelsSrc = readFileSync(resolve(root, 'src/lib/components/studio/Models.svelte'), 'utf-8');

// Comments legitimately DISCUSS the affordances this picker omits, so strip them
// before asserting on code — otherwise the explanation of why there is no delete
// button would itself fail the no-delete assertion.
const code = gallerySrc
	.replace(/<!--[\s\S]*?-->/g, '')
	.split('\n')
	.filter((l) => !l.trim().startsWith('//'))
	.join('\n');

describe('Tokenization gallery — R1', () => {
	it('exists as its own component and route (R1-AC1)', () => {
		expect(existsSync(galleryPath)).toBe(true);
		expect(
			existsSync(resolve(root, 'src/routes/(app)/studio/tokenization/+page.svelte'))
		).toBe(true);
	});

	it('offers search over the model list (R1-AC1)', () => {
		expect(code).toMatch(/bind:value=\{searchValue\}/);
		expect(code).toMatch(/toLowerCase\(\)\.includes\(searchValue\.toLowerCase\(\)\)/);
	});

	it('routes a card into a tokenization session, not into chat (R1-AC2)', () => {
		expect(code).toContain('/(app)/studio/tokenization/session?models=');
		// The gallery it forks links to the chat root. That link must NOT survive
		// the fork — it is the single difference that makes this a separate
		// surface at all.
		expect(modelsSrc).toContain('/?models=');
		expect(code).not.toMatch(/resolve\(`\/\?models=/);
	});

	it('preselects the model by id, encoded (R1-AC2)', () => {
		expect(code).toMatch(/encodeURIComponent\(model\.id\)/);
	});

	it('is a picker, not a management surface (R1-AC4)', () => {
		// Every mutating affordance the forked gallery has, asserted absent by the
		// API it would have to call. Naming the imports rather than the button
		// markup means a rebuilt UI cannot reintroduce the capability quietly.
		for (const forbidden of [
			'createNewModel',
			'deleteModelById',
			'updateModelById',
			'toggleModelById',
			'ModelMenu',
			'ConfirmDialog'
		]) {
			expect(code, `${forbidden} belongs to Studio > Models, not to this picker`).not.toContain(
				forbidden
			);
		}
		// And the forked source really does have them, so the assertion above is
		// testing a removal rather than describing something that never existed.
		expect(modelsSrc).toContain('deleteModelById');
		expect(modelsSrc).toContain('createNewModel');
	});

	it('has no create affordance pointing at the model editor (R1-AC4)', () => {
		expect(code).not.toContain('/(app)/studio/models/create');
		expect(code).not.toContain('/(app)/studio/models/edit');
		expect(modelsSrc).toContain('/(app)/studio/models/create');
	});

	it('does not write the models store it reads', () => {
		// The repo has a history of $effects that write what they read; the filter
		// here is a $derived for that reason. Guard it, since converting it back to
		// an effect would look like a harmless refactor.
		expect(code).toMatch(/\$derived\(/);
		expect(code).not.toMatch(/\$effect\(/);
		expect(code).not.toMatch(/_models\.set\(/);
	});
});

// ── T-203 / R1-AC3: only llamolotl-backed models are selectable ─────────────
//
// The rule is a pure module (`selectable.ts`) rather than a condition inlined in
// the template, so it can be tested directly. That is not only tidiness: the
// component tests in this repo cannot load locally at all right now
// (@tailwindcss/postcss is missing from the shared node_modules), so a rule
// living only in markup would have shipped unverified.

describe('Tokenization selectability — R1-AC3', () => {
	it('admits llamolotl-backed models', async () => {
		const { isTokenizationSelectable } = await import('./selectable');
		expect(isTokenizationSelectable({ id: 'a', owned_by: 'llamolotl' })).toBe(true);
	});

	it('refuses every other connection type', async () => {
		const { isTokenizationSelectable } = await import('./selectable');
		for (const owned_by of ['openai', 'ollama', 'anthropic', 'arena']) {
			expect(isTokenizationSelectable({ id: 'm', owned_by }), owned_by).toBe(false);
		}
		// and a model that declares nothing at all
		expect(isTokenizationSelectable({ id: 'm' })).toBe(false);
	});

	it('gives a reason for every unusable model, and none for a usable one', async () => {
		const { unavailableReason } = await import('./selectable');
		// null for selectable is what makes it impossible to render a reason and a
		// working link at the same time.
		expect(unavailableReason({ id: 'a', owned_by: 'llamolotl' })).toBeNull();
		expect(unavailableReason({ id: 'b', owned_by: 'openai' })).toBeTruthy();
		expect(unavailableReason({ id: 'c', arena: true })).toMatch(/arena/i);
	});

	it('the gallery renders unusable models rather than hiding them (R1-AC3)', () => {
		// The kit permits hiding OR showing-as-unavailable. This surface shows
		// them: a silently short gallery is indistinguishable from a failed load.
		// So the search filter must NOT also filter by selectability.
		expect(code).toContain('isTokenizationSelectable');
		expect(code).toContain('unavailableReason');
		const filterBlock = code.slice(code.indexOf('$derived('), code.indexOf('</script>'));
		expect(
			filterBlock,
			'selectability must not be folded into the search filter, or unusable models vanish'
		).not.toContain('isTokenizationSelectable');
	});

	it('an unusable model carries no href at all (R1-AC3)', () => {
		// Never selectable, not merely styled as though it were not: the session
		// link is inside the `{#if isTokenizationSelectable(model)}` branch, and the
		// else branch is a plain div.
		const ifIndex = code.indexOf('{#if isTokenizationSelectable(model)}');
		const elseIndex = code.indexOf('{:else}', ifIndex);
		expect(ifIndex).toBeGreaterThan(-1);
		expect(elseIndex).toBeGreaterThan(ifIndex);
		const elseBranch = code.slice(elseIndex, code.indexOf('{/if}', elseIndex));
		expect(elseBranch).not.toContain('href');
		expect(elseBranch).not.toContain('tokenization/session');
	});
});
