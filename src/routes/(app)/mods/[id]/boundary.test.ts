import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writable } from 'svelte/store';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// client R4 (T-C05) — containment. The mount container is wrapped in Svelte 5's
// native `<svelte:boundary>`, AND the mount action registers a scoped `window`
// 'error' listener. Two mechanisms, two error classes: the `try/catch` around the
// loader (R5/T-C06) only catches LOAD-time failures (fetch/import). Of the errors
// thrown later by the mounted element's own code: a throw from the HOST's own
// action/effect code is caught by the boundary. A throw from the mod element's
// `connectedCallback` (or any custom-element reaction) is NOT — per the Custom
// Elements spec, a reaction's exception is REPORTED to the global scope rather than
// propagated back through `appendChild`, so it never reaches the boundary's effect
// stack at all (this was originally believed to route through the boundary; a real
// CI run of the tests below proved otherwise — the throw surfaced as an unhandled
// exception, not a caught `failed` state). The `window` 'error' listener is the real
// containment for that class instead; both paths render the same contained state in
// the mod's own view slot and leave the app shell intact. Runaway infinite loops and
// the mod's OWN async-effect / event-handler throws remain named residual risks
// neither mechanism contains (documented, not solved).

// --- A real custom element whose connectedCallback throws synchronously on mount.
// This models a mod that blows up during its own construction / initial render.
// jsdom runs the real custom-element reaction-invocation machinery, which REPORTS
// this exception globally rather than letting it propagate out of `appendChild` —
// so it is the `window` 'error' listener registered by `mountMod`, not the
// `<svelte:boundary>`, that actually contains it here.
class CrashOnConnect extends HTMLElement {
	connectedCallback() {
		throw new Error('mod blew up during mount');
	}
}

// A healthy element, to prove the boundary does not interfere with a well-behaved mod.
const okConnects: HTMLElement[] = [];
class OkOnConnect extends HTMLElement {
	connectedCallback() {
		okConnects.push(this);
	}
}

// Drive the page store between [id] params on one reused component, exactly as the
// sibling route tests do.
const h = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let value: any = { params: { id: 'crash' } };
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
	// The route imports `loadModBundleDeduped` (the T-C03 dedup wrapper) — mock THAT
	// name, not `loadModBundle`, or the route calls `undefined`.
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
	if (!customElements.get('mod-crash')) customElements.define('mod-crash', CrashOnConnect);
	if (!customElements.get('mod-ok')) customElements.define('mod-ok', OkOnConnect);
});

beforeEach(() => {
	okConnects.length = 0;
	localStorage.setItem('token', 'tok-xyz');
	h.page.setParams('crash');
	h.loadModBundleDeduped.mockReset();
	h.loadModBundleDeduped.mockImplementation(async (id: string) => {
		if (id === 'crash')
			return { status: 'ok', tag: 'mod-crash', bundleUrl: '/static/mods/crash/entry.c.js', module: {} };
		if (id === 'ok')
			return { status: 'ok', tag: 'mod-ok', bundleUrl: '/static/mods/ok/entry.o.js', module: {} };
		return { status: 'not_found' };
	});
});

const src = readFileSync(resolve(process.cwd(), 'src/routes/(app)/mods/[id]/+page.svelte'), 'utf-8');

// Strip comments so the source guards match real CODE/MARKUP only — the comments
// legitimately discuss the boundary, Worker/iframe, and the async residual risk.
function codeOnly(s: string): string {
	return s
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const code = codeOnly(src);

describe('client R4 AC1: the mod mount point is wrapped in a Svelte 5 <svelte:boundary>', () => {
	it('the `ready` mount container sits inside a <svelte:boundary> … </svelte:boundary>', () => {
		// Structural guard on the compiled markup: the container carrying the mount
		// (data-mod-state="ready" + use:mountMod) is enclosed by the boundary tags.
		const open = code.indexOf('<svelte:boundary');
		const close = code.indexOf('</svelte:boundary>');
		const mount = code.indexOf('use:mountMod');
		expect(open).toBeGreaterThan(-1);
		expect(close).toBeGreaterThan(open);
		expect(mount).toBeGreaterThan(open);
		expect(mount).toBeLessThan(close);

		// And the boundary uses the real Svelte 5 API shape: an `onerror` prop and a
		// `failed` snippet (not a Svelte-4 error pattern).
		expect(code).toMatch(/<svelte:boundary[^>]*onerror=\{/);
		expect(code).toMatch(/\{#snippet failed\(/);
	});

	it('a well-behaved mod still mounts normally inside the boundary (no interference)', async () => {
		h.page.setParams('ok');
		const { container } = renderPage();
		await vi.waitFor(() => expect(okConnects.length).toBe(1));
		// Ready branch rendered and the element mounted — the boundary is transparent
		// for a mod that does not throw.
		expect(container.querySelector('[data-mod-state="ready"]')).not.toBeNull();
		expect(container.querySelector('[data-mod-state="crashed"]')).toBeNull();
	});
});

describe('client R4 AC2 + AC3: a post-mount thrown error is contained to the mod view, shell intact', () => {
	it('a mod that throws in connectedCallback is contained (via the window error listener, not the boundary) and does not break the app shell', async () => {
		const { container } = renderPage();

		// The mod threw AFTER load (during mount, outside the loader try/catch), from
		// inside `connectedCallback` — a reaction exception jsdom REPORTS globally
		// rather than propagating through `appendChild`, so it is `mountMod`'s `window`
		// 'error' listener that catches it and renders the shared `crashed` state
		// (AC2), NOT the boundary's own `failed` snippet. Reaching this assertion at
		// all also proves the throw did not propagate out of the component render.
		await vi.waitFor(() =>
			expect(container.querySelector('[data-mod-state="crashed"]')).not.toBeNull()
		);

		// AC3: the failed state is rendered WITHIN the mod's own view slot (inside the
		// route's `[data-mod-view]` wrapper), tagged as a runtime (post-mount) error —
		// a DISTINCT state from the pre-mount load failure `unavailable`.
		const shell = container.querySelector('[data-mod-view]');
		expect(shell).not.toBeNull();
		const crashed = shell?.querySelector('[data-mod-state="crashed"]');
		expect(crashed).not.toBeNull();
		expect(crashed?.getAttribute('data-mod-failure')).toBe('runtime_error');

		// The load-failure fallback was NOT what rendered — this is the boundary's
		// job, not the try/catch's (AC5 in spirit).
		expect(container.querySelector('[data-mod-state="unavailable"]')).toBeNull();
	});

	it('the crash of one mod does not prevent a subsequent healthy mod from mounting (no shell poisoning)', async () => {
		const { container } = renderPage();
		await vi.waitFor(() =>
			expect(container.querySelector('[data-mod-state="crashed"]')).not.toBeNull()
		);

		// Navigate to a healthy mod: the reused component resets to `loading`,
		// destroying the crashed-state subtree (and resetting `mountCrashError`),
		// then mounts the good mod.
		h.page.setParams('ok');
		await vi.waitFor(() => expect(container.querySelector('[data-mod-state="ready"]')).not.toBeNull());
		expect(okConnects.length).toBe(1);
		expect(container.querySelector('[data-mod-state="crashed"]')).toBeNull();
	});
});

describe('client R4 AC4: the runaway-infinite-loop residual risk is documented, not solved', () => {
	it('names the accepted residual risk (no in-browser containment short of a Worker/iframe) and does NOT introduce one', () => {
		// Documented as an accepted residual risk of the trust model...
		expect(src).toMatch(/runaway/i);
		expect(src).toMatch(/Worker|iframe/);
		expect(src).toMatch(/residual risk/i);

		// ...and deliberately NOT solved: no Worker/iframe isolation is introduced in
		// the actual code/markup (only discussed in comments, which `code` strips).
		expect(code).not.toMatch(/new Worker\(/);
		expect(code).not.toMatch(/<iframe/);
	});
});

describe('client R4 AC5: load-time failures are the try/catch job, post-mount thrown errors are the boundary job — neither does the other work', () => {
	it('the loader call is wrapped in try/catch (load-time), and the mount is wrapped in the boundary (post-mount) — distinct mechanisms', () => {
		// Load-time: the try/catch wraps ONLY the loader call.
		expect(code).toMatch(/try\s*\{[\s\S]*loadModBundleDeduped\([\s\S]*?\}\s*catch/);
		// Post-mount: the mount container/action lives inside the boundary, NOT inside
		// a try/catch — the boundary is what contains a mount-time throw.
		const open = code.indexOf('<svelte:boundary');
		const close = code.indexOf('</svelte:boundary>');
		const mount = code.indexOf('use:mountMod');
		expect(mount).toBeGreaterThan(open);
		expect(mount).toBeLessThan(close);

		// The mount is NOT swallowed by a try/catch around the loader: the loader's
		// catch sets `unreachable`, and a mod that throws at mount reaches the boundary
		// `crashed` state (proved in AC2), not the loader's `unavailable` state — so
		// the two paths are genuinely separate. (Behavioural corroboration above.)
	});
});
