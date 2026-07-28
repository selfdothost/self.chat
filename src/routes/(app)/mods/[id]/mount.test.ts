import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writable } from 'svelte/store';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

import { WEBUI_API_BASE_URL } from '$lib/constants';
import { user } from '$lib/stores';

// client R3 (T-C04) — the mount contract. Once the loader (R2/T-C02) reports a
// served bundle, THIS route must instantiate the mod's custom element and hand it
// auth/context BY INSTANCE PROPERTY assignment (never HTML attributes), set BEFORE
// the element is inserted into the DOM, per-instance (no shared `window` object).
//
// We prove this against REAL custom elements defined in the test: each records, at
// `connectedCallback` time (which fires ON insertion), the property values already
// present on it. If the host set them BEFORE insertion (R3 AC1/AC3), they are all
// visible at connect time. jsdom runs the custom-element lifecycle, so this is a
// faithful check of the pre-insertion-property-preservation contract.

type Connection = {
	el: HTMLElement;
	tag: string;
	authToken: unknown;
	apiBase: unknown;
	currentUser: unknown;
};
const connections: Connection[] = [];

// A recorder custom element. Each tag needs its OWN constructor (a class may back
// only one tag), so we mint one per tag.
function makeRecorder() {
	return class extends HTMLElement {
		connectedCallback() {
			connections.push({
				el: this,
				tag: this.tagName.toLowerCase(),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				authToken: (this as any).authToken,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				apiBase: (this as any).apiBase,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				currentUser: (this as any).currentUser
			});
		}
	};
}

// Drive the page store between [id] params on one reused component, exactly as the
// T-C02 page.test.ts does.
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

const SESSION_USER = {
	id: 'u-1',
	email: 'a@b.c',
	name: 'Ada',
	role: 'admin',
	profile_image_url: ''
};

beforeAll(() => {
	if (!customElements.get('mod-alpha')) customElements.define('mod-alpha', makeRecorder());
	if (!customElements.get('mod-beta')) customElements.define('mod-beta', makeRecorder());
});

beforeEach(() => {
	connections.length = 0;
	localStorage.setItem('token', 'tok-xyz');
	user.set({ ...SESSION_USER });
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

// Strip comments so the "must not appear" source guards match real CODE only —
// the comments legitimately discuss `customElements.define()` and the forbidden
// shared `window` object, and must not trip the guards.
function codeOnly(s: string): string {
	return s
		.replace(/<!--[\s\S]*?-->/g, '') // html comments
		.replace(/\/\*[\s\S]*?\*\//g, '') // block comments
		.replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments (keep the char before `//`)
}
const code = codeOnly(src);

describe('client R3 AC1 + AC3: auth/apiBase/currentUser are set as instance PROPERTIES, before insertion', () => {
	it('the mounted custom element already carries the context properties at connectedCallback (i.e. set pre-insertion)', async () => {
		renderPage();
		await vi.waitFor(() => expect(connections.length).toBe(1));

		// connectedCallback fires ON insertion. All three context values are already
		// present → the host set them as PROPERTIES BEFORE appending (AC1), and the
		// element observes the pre-insertion values (AC3).
		const c = connections[0];
		expect(c.tag).toBe('mod-alpha');
		expect(c.authToken).toBe('tok-xyz');
		expect(c.apiBase).toBe(WEBUI_API_BASE_URL);
		expect(c.currentUser).toMatchObject({ id: 'u-1', name: 'Ada' });

		// And the values live on the element INSTANCE (properties), not a global.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((c.el as any).authToken).toBe('tok-xyz');
	});

	it('the host obtains the element via document.createElement of the resolved tag (not by reaching into a Svelte tree)', () => {
		expect(code).toMatch(/document\.createElement\(/);
	});
});

describe('client R3 AC2: no auth token / apiBase / user is passed as an HTML attribute; the token never serializes into the DOM', () => {
	it('sets no context attributes and never writes the token as a string attribute', async () => {
		renderPage();
		await vi.waitFor(() => expect(connections.length).toBe(1));
		const el = connections[0].el;

		const attrs = el.getAttributeNames();
		expect(attrs).not.toContain('authtoken');
		expect(attrs).not.toContain('apibase');
		expect(attrs).not.toContain('currentuser');

		// The token must not appear anywhere in the serialized DOM.
		expect(el.outerHTML).not.toContain('tok-xyz');
		expect(document.body.innerHTML).not.toContain('tok-xyz');
	});
});

describe('client R3 AC4: context is per-instance — no shared window object; the same mod mounted twice gets independent instances', () => {
	it('mounting alpha, then beta, then alpha again yields three distinct element instances each assigned its own context', async () => {
		renderPage();
		await vi.waitFor(() => expect(connections.length).toBe(1));

		h.page.setParams('beta');
		await vi.waitFor(() => expect(connections.length).toBe(2));

		h.page.setParams('alpha');
		await vi.waitFor(() => expect(connections.length).toBe(3));

		expect(connections.map((c) => c.tag)).toEqual(['mod-alpha', 'mod-beta', 'mod-alpha']);

		// The two alpha mounts are DIFFERENT element instances — no state is shared
		// across the two mountings of the same mod.
		expect(connections[0].el).not.toBe(connections[2].el);

		// Every instance got its context assigned directly on the element.
		for (const c of connections) {
			expect(c.authToken).toBe('tok-xyz');
			expect(c.apiBase).toBe(WEBUI_API_BASE_URL);
		}
	});

	it('does not route auth/context through any window-level object (source guard)', () => {
		// A shared `window` context object is explicitly forbidden by the kit — it is
		// not instance-scoped and breaks multi-instance/teardown. Narrowed to
		// ASSIGNMENT onto `window` (the shape a shared context object would need:
		// `window.foo = ...`), not the bare word — R4's real containment fix
		// legitimately uses `window.addEventListener`/`removeEventListener` (a scoped
		// method call, not a stashed shared object) for the one error class a
		// `connectedCallback` reaction reports there instead of throwing synchronously.
		expect(code).not.toMatch(/window\.\w+\s*=/);
	});
});

describe('client R3 AC5: the mod bundle self-registers its tag; the host never calls customElements.define', () => {
	it('the route never calls customElements.define — it only createElement()s the already-registered tag', () => {
		expect(code).not.toMatch(/customElements\.define/);
		expect(code).toMatch(/document\.createElement\(/);
	});
});
