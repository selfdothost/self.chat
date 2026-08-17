import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// client R1 — structural guards that cannot be expressed as a render assertion:
// that mod views resolve through ONE generic id-parameterized route with no
// per-mod `src/routes/` file (AC3), that the nav is additive to core (AC4), and
// that the nav applies no gating of its own (AC2). These lock the contract into
// the source tree so a later edit cannot silently reintroduce a per-mod route or
// a client-side permission check.

const root = process.cwd();
const routesDir = resolve(root, 'src/routes');
const modNavSrc = readFileSync(
	resolve(root, 'src/lib/components/layout/Sidebar/ModNav.svelte'),
	'utf-8'
);
const sidebarSrc = readFileSync(
	resolve(root, 'src/lib/components/layout/Sidebar.svelte'),
	'utf-8'
);

// Strip comments so the source guard below matches real CODE only — ModNav.svelte's
// own comment legitimately explains that it does NOT do role gating, which contains
// the literal word "role" without being an offending role check.
function codeOnly(s: string): string {
	return s
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const modNavCode = codeOnly(modNavSrc);

describe('client R1 AC3: one generic id-parameterized route, no per-mod route file', () => {
	it('ships exactly one generic mods route at (app)/mods/[id]/+page.svelte', () => {
		expect(existsSync(resolve(routesDir, '(app)/mods/[id]/+page.svelte'))).toBe(true);
	});

	it('has no per-mod file under src/routes/(app)/mods — only the [id] param dir', () => {
		const modsRouteDir = resolve(routesDir, '(app)/mods');
		const entries = readdirSync(modsRouteDir);
		// The ONLY thing under the mods route is the parameterized [id] segment.
		// Any concretely-named directory here would be a per-mod route requiring a
		// rebuild — exactly what Phase 2 forbids.
		expect(entries).toEqual(['[id]']);
	});

	it('has no src/routes file whose path is a specific mod id (adding a mod needs no route change)', () => {
		// Walk the whole route tree; the only dynamic mods segment permitted is the
		// literal `[id]` param. No directory named after a concrete mod (e.g.
		// `reference`) may live directly under a `mods` route.
		const offenders: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir, { withFileTypes: true })) {
				if (!name.isDirectory()) continue;
				const full = resolve(dir, name.name);
				if (name.name === 'mods') {
					for (const child of readdirSync(full)) {
						if (child !== '[id]') offenders.push(`${full}/${child}`);
					}
				}
				walk(full);
			}
		};
		walk(routesDir);
		expect(offenders).toEqual([]);
	});

	it('ModNav links through the generic parameterized route id, not a per-mod path', () => {
		// Uses SvelteKit's typed route resolution against the shared route id,
		// substituting only the id param — never a string-built per-mod path.
		expect(modNavSrc).toContain("resolve('/(app)/mods/[id]', { id: mod.id })");
		// No hand-built `/mods/<literal>` path and no interpolated mod-id path.
		expect(modNavSrc).not.toMatch(/href=["'`]\/mods\//);
	});
});

describe('client R1 AC4: registry nav is additive to core; core items unchanged', () => {
	it('still renders the core hardcoded nav items (New Chat, Studio)', () => {
		expect(sidebarSrc).toContain('sidebar-new-chat-button');
		expect(sidebarSrc).toContain("$i18n.t('Studio')");
	});

	it('renders <ModNav/> as an added block, not a rewrite of the core items', () => {
		expect(sidebarSrc).toContain('<ModNav />');
		expect(sidebarSrc).toContain("import ModNav from './Sidebar/ModNav.svelte'");
	});

	it('populates the nav from the registry endpoint on boot', () => {
		expect(sidebarSrc).toContain("import { getEnabledMods } from '$lib/apis/mods'");
		expect(sidebarSrc).toContain('await initMods()');
		expect(sidebarSrc).toContain('enabledMods.set(mods ?? [])');
	});
});

describe('client R1 AC2: the nav adds no gating of its own', () => {
	it('filters only on add_to_nav — no permission/role/user check in the nav', () => {
		expect(modNavSrc).toContain('mod.add_to_nav === true');
		// No client-side gating: the server already scope-filtered the response.
		// Checked against comment-stripped code so a comment merely EXPLAINING the
		// absence of role/permission gating doesn't trip its own guard.
		expect(modNavCode).not.toContain('permissions');
		expect(modNavCode).not.toContain('$user');
		expect(modNavCode).not.toMatch(/\brole\b/);
	});
});
