import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// client R2 (T-C02) — structural guard on the generic mod route, in the style of
// the T-C01 `mod-nav-routing.test.ts` source-string guards. It locks AC2's
// "reactive on the param, not a one-time onMount" contract into the source so a
// later edit cannot silently regress the re-fetch-on-view-entry behaviour. Kept
// separate from the render test so it stands even if the component-import
// environment differs.

const src = readFileSync(
	resolve(process.cwd(), 'src/routes/(app)/mods/[id]/+page.svelte'),
	'utf-8'
);

describe('client R2 AC2: the load is keyed reactively on the route param, not onMount', () => {
	it('derives modId from $page.params.id and triggers the load reactively off it', () => {
		// SvelteKit reuses this component instance across [id] changes; keying the
		// load on the reactive param lets navigation re-run it per view-entry.
		//
		// Runes form since the Svelte 5 conversion (self.chat#31). The GUARD is
		// unchanged -- modId must still derive from the route param, and the load
		// must still be driven reactively off it rather than once at mount. Only
		// the syntax that expresses it moved from `$:` to $derived/$effect.
		expect(src).toMatch(/modId\s*=\s*\$derived\(\s*\$page\.params\.id\s*\)/);
		expect(src).toMatch(/\$effect\(\s*\(\)\s*=>\s*\{[^}]*enterMod\(modId\)/);
	});

	it('does not drive the manifest fetch from a one-time onMount', () => {
		// An onMount fetch would fire once for the reused instance and miss later
		// [id] changes — guard against reintroducing it. Checks for actual USAGE
		// (an import from 'svelte' or a call), not the bare word — the file's own
		// comments legitimately mention "onMount" by name to explain why it is
		// deliberately not used, and a substring match would false-positive on that.
		expect(src).not.toMatch(/import\s*\{[^}]*\bonMount\b[^}]*\}\s*from\s*['"]svelte['"]/);
		expect(src).not.toMatch(/\bonMount\s*\(/);
	});

	it('loads through the loadModBundleDeduped seam (T-C03 dedup, wrapping loadModBundle)', () => {
		// The fetch+import lives in a single named function; T-C03 wrapped the raw
		// loadModBundle seam with an in-flight Map keyed by mod id and exported the
		// wrapper as loadModBundleDeduped — the route now imports that wrapper.
		expect(src).toMatch(/import\s*\{\s*loadModBundleDeduped\s*\}\s*from\s*'\$lib\/mods\/loader'/);
	});
});
