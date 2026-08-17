import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Studio Rename R6 — the completeness guard.
//
// Phase 0 of the Tokenization Studio programme renamed Workspace to Studio
// across routes, the component tree, navigation and every locale. Decision
// record: selfai/gitlab-profile
// context/treasuremaps/2026-08-11-tokenization-studio.md, Decision 1.
//
// R1 deliberately adds NO redirects, so there is no legitimate remaining
// occurrence of the old name inside the renamed trees and this guard allows no
// exemptions. It exists because a rename erodes: the next contributor to copy a
// file, resurrect an old import, or paste a `/workspace/...` path would
// otherwise reintroduce a dead route that fails only at runtime, and only for
// whoever clicks it.
//
// Scoped to the two renamed DIRECTORIES rather than a repo-wide count. A global
// occurrence count drifts with unrelated work — `src/lib/stores/workspace.ts`,
// `workspaceModels` in the admin model settings, and the `/workspace/...`
// CONTAINER FILESYSTEM PATHS in KnowledgeBase.svelte and nodeTemplate.ts are all
// legitimately named and out of this rename's scope. Guarding the directories
// keeps the assertion precise about what actually had to change.

const root = process.cwd();

const GUARDED_DIRS = ['src/routes/(app)/studio', 'src/lib/components/studio'];

// Container filesystem paths that legitimately contain the string. These are
// paths INSIDE the running container, not app routes; renaming them would break
// curator pipeline output resolution and knowledge-base upload paths at runtime.
const ALLOWED_SUBSTRINGS = ['/workspace/ui-data', '/workspace/curator'];

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...walk(full));
		} else {
			out.push(full);
		}
	}
	return out;
}

describe('Workspace → Studio rename is complete', () => {
	for (const relDir of GUARDED_DIRS) {
		it(`${relDir} contains no 'workspace' identifier`, () => {
			const files = walk(resolve(root, relDir));
			expect(files.length).toBeGreaterThan(0);

			const offenders: string[] = [];
			for (const file of files) {
				// This guard is itself inside a guarded directory, and it cannot state
				// the rule without naming the term it forbids. Excluding its own path is
				// the ONLY exemption, and it is structural rather than a carve-out for
				// an offending occurrence: nothing else in these trees may name it.
				if (file.endsWith('studio-rename-complete.test.ts')) continue;
				const src = readFileSync(file, 'utf-8');
				src.split('\n').forEach((line, i) => {
					if (!/workspace/i.test(line)) return;
					if (ALLOWED_SUBSTRINGS.some((allowed) => line.includes(allowed))) return;
					offenders.push(`${file.replace(root + '/', '')}:${i + 1}: ${line.trim()}`);
				});
			}

			expect(
				offenders,
				`The Workspace → Studio rename (Phase 0) has eroded. These lines are inside the ` +
					`renamed trees and still say "workspace":\n\n${offenders.join('\n')}\n\n` +
					`This is NOT a stale test — R1 adds no redirects, so a /workspace/... path is a ` +
					`dead link and a $lib/components/workspace/... import does not resolve. Rename the ` +
					`occurrence rather than deleting this guard. Decision record: selfai/gitlab-profile ` +
					`context/treasuremaps/2026-08-11-tokenization-studio.md, Decision 1.`
			).toEqual([]);
		});
	}

	it('the old directories no longer exist', () => {
		for (const dead of ['src/routes/(app)/workspace', 'src/lib/components/workspace']) {
			expect(() => statSync(resolve(root, dead)), `${dead} should have been moved, not copied`).toThrow();
		}
	});
});
