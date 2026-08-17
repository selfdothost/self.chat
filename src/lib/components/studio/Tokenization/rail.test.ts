import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, flushSync, unmount } from 'svelte';
import { get } from 'svelte/store';
import { showControls } from '$lib/stores';
import { CONTROLS_RAIL_MEDIA_QUERY, controlsRailIsPinned } from './rail';
import RailEntryOrderChat from '../../../../test-mocks/RailEntryOrderChat.svelte';

// Tokenization Studio Shell R5 — T-208.
//
// R5 is about the DEFAULT OPEN STATE ON ENTRY. ChatControls already implements
// both presentations and already switches on `largeScreen`; nothing here builds
// a panel. What can go wrong is therefore not "the rail looks wrong" but four
// quieter things, and these guards are aimed at those:
//
//   * the default leaks into ordinary chat (R5-AC4);
//   * the entry value becomes reactive and revokes the artist's own choice on a
//     re-render or a resize (R5-AC3, R5-AC6);
//   * someone expresses it as an `$effect` that writes the `showControls` it
//     reads (R5-AC5) — the loop ChatControls:191-217 documents, and the shape
//     that has already killed a whole route in this repo (#33);
//   * the entry value is set at a point where ChatControls' close-on-no-chatId
//     effect undoes it again, which produces no error at all — just a rail that
//     is never open.
//
// Component tests cannot mount the real components in this checkout
// (@tailwindcss/postcss is absent from the shared node_modules, so anything
// reaching @xyflow fails to preprocess), so the wiring is guarded at source
// level, in the style of the sibling suites. The two things that CAN be
// executed — the viewport rule itself and the mount-order assumption the design
// rests on — are executed rather than grepped.

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const chatSrc = read('src/lib/components/chat/Chat.svelte');
const chatControlsSrc = read('src/lib/components/chat/ChatControls.svelte');
const sessionSrc = read('src/routes/(app)/studio/tokenization/session/+page.svelte');
const chatRouteSrc = read('src/routes/(app)/+page.svelte');

/**
 * Every `$effect(...)` / `$effect.pre(...)` body in a source file, by balancing
 * parentheses from the call. Textual, so it sees what is written inside the
 * block and not what a helper called from it goes on to do — which is the level
 * R5-AC5 is written at ("an `$effect` that writes the same `showControls` store
 * it reads").
 */
const effectBlocks = (src: string): string[] => {
	const blocks: string[] = [];
	for (const match of src.matchAll(/\$effect(?:\.pre)?\s*\(/g)) {
		let depth = 0;
		let i = (match.index ?? 0) + match[0].length - 1;
		for (; i < src.length; i++) {
			if (src[i] === '(') depth++;
			else if (src[i] === ')' && --depth === 0) break;
		}
		blocks.push(src.slice(match.index ?? 0, i + 1));
	}
	return blocks;
};

describe('R5 — the viewport rule is executable, and it is chat’s own', () => {
	it('pins the rail on a wide viewport and not on a narrow one', () => {
		// R5-AC1 / R5-AC2. Below the breakpoint ChatControls renders a Drawer
		// ACROSS the conversation; auto-opening that would bury the thing the
		// artist came to look at, so narrow must answer false.
		expect(controlsRailIsPinned(() => true)).toBe(true);
		expect(controlsRailIsPinned(() => false)).toBe(false);
	});

	it('asks exactly the question ChatControls answers', () => {
		const asked: string[] = [];
		controlsRailIsPinned((query) => {
			asked.push(query);
			return true;
		});
		expect(asked).toEqual([CONTROLS_RAIL_MEDIA_QUERY]);
	});

	it('does not drift from the breakpoint ChatControls actually switches on', () => {
		// The mirror is deliberate (see rail.ts) but it is only safe while it
		// matches. ChatControls reads this query twice: the `initialSize` snapshot
		// and the onMount media listener. A rail default computed at 1024px while
		// the component switched at, say, 768px would open `showControls` on a
		// viewport that presents a Drawer — precisely the R5-AC2 failure.
		const occurrences = chatControlsSrc.split(CONTROLS_RAIL_MEDIA_QUERY).length - 1;
		expect(
			occurrences,
			`ChatControls must switch presentations on ${CONTROLS_RAIL_MEDIA_QUERY}`
		).toBe(2);
	});
});

describe('R5-AC1/AC2 — the session decides, Chat only applies', () => {
	it('computes the entry value from the viewport rule rather than asserting it', () => {
		expect(sessionSrc).toContain("from '$lib/components/studio/Tokenization/rail'");
		expect(sessionSrc).toMatch(/controlsOpenOnEntry\s*=\s*controlsRailIsPinned\(\)/);
		// A hard-coded `true` would satisfy AC1 and break AC2 silently.
		expect(sessionSrc).not.toMatch(/controlsOpenOnEntry\s*=\s*true/);
		expect(sessionSrc).toMatch(/<Chat[^>]*\{controlsOpenOnEntry\}/s);
	});

	it('never decides the viewport question inside Chat', () => {
		// Chat is handed the answer. If it grew its own media query it would own a
		// breakpoint that ChatControls already owns, and the two would drift.
		expect(chatSrc).not.toContain('matchMedia');
		expect(chatSrc).not.toContain(CONTROLS_RAIL_MEDIA_QUERY);
	});
});

describe('R5-AC3/AC6 — the artist’s choice is not revoked', () => {
	it('reads the viewport once at entry, not reactively', () => {
		// The whole of AC3 and AC6 in one property. `$derived` here would
		// re-evaluate on every viewport change and re-open a rail the artist had
		// just closed; `$state` would invite something to write it later.
		expect(sessionSrc).toMatch(/const controlsOpenOnEntry = /);
		expect(sessionSrc).not.toMatch(/controlsOpenOnEntry = \$(state|derived)/);
	});

	it('leaves nothing on this surface that could write the rail open again', () => {
		// The session page owns the decision but must not own the store: no code
		// here touches `showControls`, and there are no effects at all, so nothing
		// on this surface can re-render a manual close away. Comments are stripped
		// first — the prose above the `const` names both, and a guard that a
		// comment can trip is a guard that gets weakened to shut it up.
		const code = sessionSrc
			.split('\n')
			.filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
			.join('\n');
		expect(code).not.toContain('showControls');
		expect(code).not.toContain('$effect');
	});
});

describe('R5-AC5 — the self-writing effect is not re-armed', () => {
	it('no $effect writes the showControls it reads', () => {
		// Stated as read-AND-write rather than a ban on either. ChatControls
		// legitimately has one effect that READS `$showControls` (the pane
		// catch-up) and one that WRITES it (close on no chatId); it is the
		// combination that will not settle, and that this repo has already killed
		// a route with (#33).
		for (const [name, src] of [
			['ChatControls.svelte', chatControlsSrc],
			['Chat.svelte', chatSrc],
			['the session page', sessionSrc]
		] as [string, string][]) {
			for (const block of effectBlocks(src)) {
				const reads = block.includes('$showControls');
				const writes = block.includes('showControls.set(');
				expect(
					reads && writes,
					`${name} has an $effect that writes the showControls store it reads:\n${block.slice(0, 400)}`
				).toBe(false);
			}
		}
	});

	it('sets the entry state from a lifecycle path, not a reactive one', () => {
		// Where the value is applied is load-bearing, not stylistic. `initNewChat`
		// is reached from onMount; the `?call=true` entry beside it has always
		// opened the rail from exactly there.
		expect(chatSrc).toMatch(/await showControls\.set\(controlsOpenOnEntry\);/);
	});
});

describe('R5-AC4 — ordinary chat is untouched', () => {
	it('defaults to the literal the entry line carried before the prop existed', () => {
		expect(chatSrc).toMatch(/controlsOpenOnEntry\?\s*:\s*boolean;/);
		expect(chatSrc).toMatch(/controlsOpenOnEntry = false/);
	});

	it('the chat route asks for nothing', () => {
		expect(chatRouteSrc).not.toContain('controlsOpenOnEntry');
	});

	it('ChatControls was not modified for this', () => {
		// T-208's whole point is that both presentations already exist. If the rail
		// component had to learn a new prop to satisfy R5, the default-on-entry
		// framing was wrong.
		expect(chatControlsSrc).not.toContain('controlsOpenOnEntry');
		expect(chatControlsSrc.toLowerCase()).not.toContain('tokenization');
	});

	it('Chat uses the prop only to set the rail state on entry', () => {
		// An occurrence CENSUS, extending the one session.test.ts runs over
		// `modelFilter`. Unlike that predicate this prop is MEANT to be read — so
		// the census does not ban reading it, it bans reading it anywhere other
		// than the two points at which a session begins. That is what stops an
		// entry default quietly becoming a persistent "this is a studio surface"
		// mode flag inside Chat, which is the R2-AC4 line.
		const codeLines = chatSrc
			.split('\n')
			.filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'));

		const uses = codeLines.filter((l) => l.includes('controlsOpenOnEntry'));
		const allowed = [
			/^\s*controlsOpenOnEntry\?\s*:\s*boolean;$/, // the Props declaration
			/^\s*controlsOpenOnEntry = false,?$/, // destructuring
			/^\s*await showControls\.set\(controlsOpenOnEntry\);$/, // entry: new session
			/^\s*if \(controlsOpenOnEntry\) \{$/ // entry: resumed session
		];

		for (const line of uses) {
			expect(
				allowed.some((re) => re.test(line)),
				`Chat.svelte uses controlsOpenOnEntry outside a session-entry point:\n  ${line.trim()}`
			).toBe(true);
		}
		expect(uses.length, 'expected declaration, destructuring and the two entry points').toBe(4);
	});
});

describe('R5 — the entry default survives the controls component', () => {
	// The failure mode with no error message. ChatControls closes the rail
	// whenever it sees no chatId, and a new session has none until its first
	// message — so an entry default applied from the entering route's script, or
	// from anywhere else that runs before that effect, is silently undone and the
	// rail simply never opens.
	//
	// Chat wins that race because a CHILD's effects flush before a PARENT's
	// onMount, and `initNewChat` is reached from Chat's onMount. That ordering is
	// a Svelte guarantee this design leans on, so it is pinned here rather than
	// assumed: these fixtures reproduce the two components' shapes (the real ones
	// cannot be mounted in this checkout).
	beforeEach(() => {
		showControls.set(false);
	});

	const mountChat = (controlsOpenOnEntry: boolean) => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const app = mount(RailEntryOrderChat, { target, props: { controlsOpenOnEntry } });
		flushSync();
		const state = get(showControls);
		unmount(app);
		target.remove();
		return state;
	};

	it('opens on entry despite the close-on-no-chatId effect', () => {
		expect(mountChat(true)).toBe(true);
	});

	it('and stays closed when the surface did not ask for it', () => {
		expect(mountChat(false)).toBe(false);
	});
});
