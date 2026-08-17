import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Tokenization Studio Shell R4 — T-206 / T-207 of
// context/plans/build-site-tokenization-shell.md.
//
// The gate is source-asserted rather than rendered, for the same reason the
// other guards in this directory are: what R4 requires is mostly the ABSENCE of
// a path (no nav entry, no reachable route) and a set of NON-implications
// between permissions. A render test shows one state; reading the source shows
// there is no state in which the thing appears.

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const layoutSrc = read('src/routes/(app)/studio/+layout.svelte');
const indexSrc = read('src/routes/(app)/studio/+page.svelte');
const sidebarSrc = read('src/lib/components/layout/Sidebar.svelte');

describe('R4 — studio.tokenization gates the surface', () => {
	it('the route guard refuses, rather than only hiding (R4-AC1, R4-AC3)', () => {
		// Both routes: the check is a prefix match on '/tokenization', so the
		// gallery and the session beneath it are covered by one branch.
		expect(layoutSrc).toMatch(/pathname\.includes\('\/tokenization'\)/);
		expect(layoutSrc).toMatch(/!\$user\?\.permissions\?\.studio\?\.tokenization/);
		// and it redirects away rather than rendering nothing
		const guard = layoutSrc.slice(
			layoutSrc.indexOf("includes('/tokenization')"),
			layoutSrc.indexOf('loaded = true')
		);
		expect(guard).toContain('goto(');
	});

	it('admins are exempt, exactly as for every other section (R4-AC3)', () => {
		// The whole guard chain sits inside `if ($user?.role !== 'admin') { ... }`.
		// A tokenization check ANYWHERE outside it locks admins out of this one
		// section while every other section still exempts them.
		//
		// Checking ORDER is not enough, and that is not hypothetical: the first
		// version of this test asserted only that a tokenization check appeared
		// after the admin wrapper, and a mutation adding a SECOND guard outside the
		// wrapper passed it cleanly. So this bounds the admin block and requires
		// every occurrence to fall inside it.
		const adminStart = layoutSrc.indexOf("if ($user?.role !== 'admin') {");
		expect(adminStart, 'admin exemption wrapper not found').toBeGreaterThan(-1);

		// Walk braces from the wrapper to find where the exemption block ends.
		let depth = 0;
		let adminEnd = -1;
		for (let i = layoutSrc.indexOf('{', adminStart); i < layoutSrc.length; i++) {
			if (layoutSrc[i] === '{') depth++;
			else if (layoutSrc[i] === '}') {
				depth--;
				if (depth === 0) {
					adminEnd = i;
					break;
				}
			}
		}
		expect(adminEnd).toBeGreaterThan(adminStart);

		const occurrences = [...layoutSrc.matchAll(/includes\('\/tokenization'\)/g)].map(
			(m) => m.index as number
		);
		expect(occurrences.length, 'expected exactly one tokenization route guard').toBe(1);
		for (const at of occurrences) {
			expect(
				at > adminStart && at < adminEnd,
				'a tokenization route guard sits outside the admin exemption, which would ' +
					'lock admins out of this section while exempting them everywhere else'
			).toBe(true);
		}
	});

	it('the nav entry is absent without the permission (R4-AC2)', () => {
		expect(layoutSrc).toMatch(
			/\{#if \$user\?\.role === 'admin' \|\| \$user\?\.permissions\?\.studio\?\.tokenization\}/
		);
	});

	it('a tokenization-only artist can actually reach the section', () => {
		// A permission granting a page with no route to it is half a feature. The
		// sidebar must surface Studio, and the Studio index must land them.
		expect(sidebarSrc).toContain('$user?.permissions?.studio?.tokenization');
		expect(indexSrc).toContain("goto(resolve('/(app)/studio/tokenization'))");
	});
});

describe('R4-AC5/AC6 — the three permissions imply nothing about each other', () => {
	// Decision 11's boundary is who may CHANGE THE RULES, not who may consume
	// capacity under them. Queueing tokenization jobs rides on
	// studio.tokenization deliberately; defining job windows and running the
	// existing training courses do not.
	const permissionsOf = (src: string) =>
		[...src.matchAll(/permissions\?\.studio\?\.(\w+)/g)].map((m) => m[1]);

	it('the tokenization gate reads only its own key', () => {
		// Extract the guard branch and assert it consults tokenization and nothing
		// else -- an `||` with training here would silently make one imply the other.
		const start = layoutSrc.indexOf("includes('/tokenization')");
		const branch = layoutSrc.slice(start, layoutSrc.indexOf('}', layoutSrc.indexOf('goto(', start)));
		expect(permissionsOf(branch)).toEqual(['tokenization']);
	});

	it('no other section gate reads the tokenization key', () => {
		// The converse direction: holding tokenization must not open training,
		// evaluations, tools or anything else.
		for (const section of ['models', 'knowledge', 'prompts', 'training', 'evaluations', 'tools', 'voices']) {
			const marker = `includes('/${section}')`;
			const at = layoutSrc.indexOf(marker);
			if (at === -1) continue;
			const branch = layoutSrc.slice(at, at + 260);
			expect(branch, `the ${section} gate must not consult tokenization`).not.toContain(
				'studio?.tokenization'
			);
		}
	});

	it('tokenization is not conflated with the training-course permission', () => {
		// studio.training gates creating and queueing the existing training
		// courses. It is a different grant at a different scale.
		expect(layoutSrc).toContain('studio?.training');
		expect(layoutSrc).toContain('studio?.tokenization');
		expect(layoutSrc).not.toMatch(/studio\?\.training\s*\|\|\s*\$user\?\.permissions\?\.studio\?\.tokenization/);
		expect(layoutSrc).not.toMatch(/studio\?\.tokenization\s*\|\|\s*\$user\?\.permissions\?\.studio\?\.training/);
	});
});
