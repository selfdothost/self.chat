import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writable } from 'svelte/store';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// client R6 (T-C07) — teardown on navigation away. Navigating away from a mounted
// mod tears it down via the STANDARD Web Components path: real DOM removal fires
// `disconnectedCallback`, and Svelte destroys the inner component on the next tick.
// This needs NO bespoke plumbing — it is browser + Svelte platform behaviour. These
// tests PROVE the removal actually happens (rather than trusting the platform), and
// pin the code shape that keeps it a genuine removal (each view-entry passes through
// `loading`, so it is NOT a same-tick detach+reattach, which Svelte would optimise
// into no teardown). Non-Svelte side effects a mod opens (raw WebSockets,
// setInterval/setTimeout, ResizeObserver) remain the MOD AUTHOR's responsibility to
// clean up in `onDestroy` — this mechanism neither enforces nor automates that.

// A recorder custom element logging BOTH connect and disconnect, with the element
// instance, so we can prove real DOM removal fired `disconnectedCallback`.
type LifecycleEvent = { tag: string; type: 'connect' | 'disconnect'; el: HTMLElement };
const events: LifecycleEvent[] = [];

function makeLifecycleRecorder(tag: string) {
	return class extends HTMLElement {
		connectedCallback() {
			events.push({ tag, type: 'connect', el: this });
		}
		disconnectedCallback() {
			events.push({ tag, type: 'disconnect', el: this });
		}
	};
}

const h = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let value: any = { params: { id: 'alpha' } };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const subs = new Set<(v: any) => void>();
	const page = {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		subscribe(fn: (v: any) => void) {
			fn(value);
			subs.add(fn);
			return () => subs.delete(fn);
		},
		setParams(id: string) {
			value = { params: { id } };
			subs.forEach((fn) => fn(value));
		}
	};
	const loadModBundleDeduped = vi.fn();
	return { page, loadModBundleDeduped };
});

vi.mock('$app/stores', () => ({ page: h.page }));
vi.mock('$lib/mods/loader', () => ({ loadModBundleDeduped: h.loadModBundleDeduped }));

import Page from './+page.svelte';

// The header row reads getContext('i18n') for its "New Chat" tooltip label --
// render() must supply it or the first $i18n.t() call throws.
const i18nStore = writable({ t: (k: string) => k });
const renderPage = () => render(Page, { context: new Map([['i18n', i18nStore]]) });

beforeAll(() => {
	if (!customElements.get('mod-alpha')) customElements.define('mod-alpha', makeLifecycleRecorder('mod-alpha'));
	if (!customElements.get('mod-beta')) customElements.define('mod-beta', makeLifecycleRecorder('mod-beta'));
});

beforeEach(() => {
	events.length = 0;
	localStorage.setItem('token', 'tok-xyz');
	h.page.setParams('alpha');
	h.loadModBundleDeduped.mockReset();
	h.loadModBundleDeduped.mockImplementation(async (id: string) => {
		if (id === 'alpha')
			return { status: 'ok', tag: 'mod-alpha', bundleUrl: '/static/mods/alpha/entry.a.js', module: {} };
		if (id === 'beta')
			return { status: 'ok', tag: 'mod-beta', bundleUrl: '/static/mods/beta/entry.b.js', module: {} };
		return { status: 'not_found' };
	});
});

const src = readFileSync(resolve(process.cwd(), 'src/routes/(app)/mods/[id]/+page.svelte'), 'utf-8');

function codeOnly(s: string): string {
	return s
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const code = codeOnly(src);

const connectsOf = (tag: string) => events.filter((e) => e.tag === tag && e.type === 'connect');
const disconnectsOf = (tag: string) => events.filter((e) => e.tag === tag && e.type === 'disconnect');

describe('client R6 AC1: navigating away removes the custom element from the DOM, firing disconnectedCallback', () => {
	it('mounts alpha, then on navigation to beta genuinely removes alpha from the DOM (disconnectedCallback fires)', async () => {
		renderPage();
		await vi.waitFor(() => expect(connectsOf('mod-alpha').length).toBe(1));
		const alphaEl = connectsOf('mod-alpha')[0].el;
		expect(alphaEl.isConnected).toBe(true);

		// Navigate away to a different mod. `enterMod` resets to `loading` first, so
		// the `{#if viewState === 'ready'}` branch (alpha's boundary + container + element)
		// is destroyed and alpha is removed from the DOM.
		h.page.setParams('beta');
		await vi.waitFor(() => expect(connectsOf('mod-beta').length).toBe(1));

		// Real DOM removal fired disconnectedCallback on alpha's element...
		expect(disconnectsOf('mod-alpha').length).toBe(1);
		expect(disconnectsOf('mod-alpha')[0].el).toBe(alphaEl);
		// ...and it is genuinely gone from the document (not just detached-and-kept).
		expect(alphaEl.isConnected).toBe(false);
		expect(document.querySelector('mod-alpha')).toBeNull();
	});
});

describe('client R6 AC2: after teardown, re-navigating mounts a FRESH instance (per-instance context, R3)', () => {
	it('alpha → beta → alpha yields two DISTINCT alpha element instances', async () => {
		renderPage();
		await vi.waitFor(() => expect(connectsOf('mod-alpha').length).toBe(1));

		h.page.setParams('beta');
		await vi.waitFor(() => expect(connectsOf('mod-beta').length).toBe(1));

		h.page.setParams('alpha');
		await vi.waitFor(() => expect(connectsOf('mod-alpha').length).toBe(2));

		// The first alpha was torn down; the second is a brand-new element instance —
		// not a resurrected/cached one.
		const [first, second] = connectsOf('mod-alpha').map((e) => e.el);
		expect(first).not.toBe(second);
		// The first alpha disconnected before the second connected.
		expect(disconnectsOf('mod-alpha').length).toBe(1);
		expect(disconnectsOf('mod-alpha')[0].el).toBe(first);
	});
});

describe('client R6 AC3: non-Svelte side effects are the mod author’s responsibility; this mechanism neither enforces nor automates that', () => {
	it('documents the boundary of what teardown covers, and adds NO bespoke teardown code for the mod', () => {
		// The contract is stated honestly in the source.
		expect(src).toMatch(/onDestroy/);
		expect(src).toMatch(/WebSocket|setInterval|setTimeout|ResizeObserver/);
		expect(src).toMatch(/mod author/i);

		// Teardown is the native path — the route does NOT hand-roll cleanup of the
		// mod's effects (no manual interval/observer/socket teardown of the mod's own
		// resources), and the `mountMod` action carries no `destroy` that reaches into
		// the element. (The only `replaceChildren` is the defensive pre-mount clear.)
		expect(code).not.toMatch(/clearInterval/);
		expect(code).not.toMatch(/clearTimeout/);
		expect(code).not.toMatch(/\.disconnect\(\)/); // e.g. a ResizeObserver the host would wrongly own
	});
});

describe('client R6 AC4: real navigation genuinely removes the element (not a same-tick detach+reattach)', () => {
	it('every view-entry resets to `loading` before mounting, so nav-away is a genuine destroy, not a transient reattach', () => {
		// The load-bearing code shape for AC4: `enterMod` sets the view state to
		// 'loading' synchronously (before any await) on EVERY entry. So an A → B
		// navigation tears A's `ready` branch down immediately and only later (after
		// the async load) mounts B — never a same-tick detach+reattach (which Svelte
		// deliberately optimises into NO teardown). This is a source guard so a later
		// edit can't silently turn the mount into a reused-node reattach.
		//
		// The variable is `viewState` since the Svelte 5 conversion (self.chat#31):
		// the $state rune cannot coexist with a variable named `state`, which is why
		// the codemod refused this file. The guard is the same one.
		expect(code).toMatch(/viewState\s*=\s*'loading'/);
		// The mount lives in the `ready` branch of an `{#if}`, which Svelte destroys
		// and recreates across `state` changes — the mechanism that yields a real
		// removal rather than a moved-in-place node.
		expect(code).toMatch(/\{#if viewState === 'loading'\}/);
		expect(code).toMatch(/use:mountMod/);
	});

	it('behaviourally, nav-away produces a real disconnect (a same-tick reattach would produce none)', async () => {
		renderPage();
		await vi.waitFor(() => expect(connectsOf('mod-alpha').length).toBe(1));

		h.page.setParams('beta');
		await vi.waitFor(() => expect(connectsOf('mod-beta').length).toBe(1));

		// A genuine removal fired exactly one disconnect for alpha. If the navigation
		// were a same-tick detach+reattach of the SAME node, Svelte would fire no
		// teardown at all — this asserts we are NOT in that optimised-away case.
		expect(disconnectsOf('mod-alpha').length).toBe(1);
	});
});
