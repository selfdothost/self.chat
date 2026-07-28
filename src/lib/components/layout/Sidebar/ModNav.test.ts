import { render } from '@testing-library/svelte';
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';

import ModNav from './ModNav.svelte';
import { enabledMods } from '$lib/stores';
import type { ModRegistryEntry } from '$lib/apis/mods';

// client R1 — the registry-driven mod nav. These tests drive the component from
// the `enabledMods` store exactly as the boot fetch populates it, and assert the
// nav renders precisely what the (already scope-filtered) response contains.

const modLinks = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('a[data-mod-id]')) as HTMLAnchorElement[];

beforeEach(() => {
	// Reset shared module-level store between cases.
	enabledMods.set([]);
});

describe('client R1 AC1: one nav entry per add_to_nav mod, using label + icon', () => {
	it('renders exactly one entry per mod with add_to_nav true, with its label', () => {
		const mods: ModRegistryEntry[] = [
			{ id: 'reference', name: 'Reference', scopes: ['mods.reference.use'], view: 'status', label: 'Reference Status', icon: '🛰️', add_to_nav: true },
			{ id: 'weather', name: 'Weather', scopes: ['mods.weather.use'], view: 'panel', label: 'Weather Panel', icon: '/static/mods/weather/icon.svg', add_to_nav: true }
		];
		enabledMods.set(mods);

		const { container, getByText } = render(ModNav);

		const links = modLinks(container);
		expect(links).toHaveLength(2);
		// Labels come from the nav shape (not the mod name).
		expect(getByText('Reference Status')).toBeInTheDocument();
		expect(getByText('Weather Panel')).toBeInTheDocument();
	});

	it('renders a text/emoji icon as a glyph and a URL/path icon as an <img>', () => {
		enabledMods.set([
			{ id: 'reference', name: 'Reference', scopes: [], label: 'Reference Status', icon: '🛰️', add_to_nav: true },
			{ id: 'weather', name: 'Weather', scopes: [], label: 'Weather Panel', icon: '/static/mods/weather/icon.svg', add_to_nav: true }
		]);

		const { container } = render(ModNav);

		// The emoji icon renders inline (no <img>); the path icon renders as an image.
		const emojiLink = container.querySelector('a[data-mod-id="reference"]') as HTMLAnchorElement;
		const imageLink = container.querySelector('a[data-mod-id="weather"]') as HTMLAnchorElement;
		expect(emojiLink.querySelector('img')).toBeNull();
		expect(emojiLink.textContent).toContain('🛰️');
		const img = imageLink.querySelector('img') as HTMLImageElement;
		expect(img).not.toBeNull();
		expect(img.getAttribute('src')).toBe('/static/mods/weather/icon.svg');
	});
});

describe('client R1 AC2: omitted / non-add_to_nav mods produce no entry; no client gating', () => {
	it('renders no entry for a mod with add_to_nav false or unset', () => {
		enabledMods.set([
			{ id: 'shown', name: 'Shown', scopes: [], label: 'Shown', icon: '🟢', add_to_nav: true },
			{ id: 'optout', name: 'Opt Out', scopes: [], label: 'Opt Out', icon: '🔕', add_to_nav: false },
			// A mod with no frontend block at all (only id/name/scopes) — never in nav.
			{ id: 'backendonly', name: 'Backend Only', scopes: ['mods.backendonly.use'] }
		]);

		const { container, queryByText } = render(ModNav);

		expect(modLinks(container)).toHaveLength(1);
		expect(container.querySelector('a[data-mod-id="shown"]')).not.toBeNull();
		expect(queryByText('Opt Out')).toBeNull();
		expect(queryByText('Backend Only')).toBeNull();
	});

	it('renders exactly the store contents — a mod the response omits simply is not present', () => {
		// The server already filtered by scope; the client holds only what it got.
		enabledMods.set([
			{ id: 'visible', name: 'Visible', scopes: [], label: 'Visible', icon: '👁️', add_to_nav: true }
		]);

		const { container, queryByText } = render(ModNav);

		expect(modLinks(container)).toHaveLength(1);
		// A mod the caller lacks scope for was never in the array → no entry, and the
		// component did no permission check to arrive there.
		expect(queryByText('Secret Admin Mod')).toBeNull();
	});
});

describe('client R1 AC3: every entry resolves to one generic id-parameterized route', () => {
	it('links every mod to the same generic route id, parameterized only by mod id', () => {
		enabledMods.set([
			{ id: 'alpha', name: 'Alpha', scopes: [], label: 'Alpha', icon: 'A', add_to_nav: true },
			{ id: 'beta', name: 'Beta', scopes: [], label: 'Beta', icon: 'B', add_to_nav: true }
		]);

		const { container } = render(ModNav);
		const links = modLinks(container);

		// Both entries carry distinct mod ids...
		expect(links.map((l) => l.getAttribute('data-mod-id')).sort()).toEqual(['alpha', 'beta']);
		// ...yet both hrefs resolve through the SAME generic route id (the test mock
		// for $app/paths returns the route id verbatim), proving there is one shared
		// parameterized route, not a per-mod path.
		for (const link of links) {
			expect(link.getAttribute('href')).toBe('/(app)/mods/[id]');
		}
	});
});

describe('client R1 AC5: zero mods → no entries, shell unaffected', () => {
	it('renders nothing when the registry is empty', () => {
		enabledMods.set([]);
		const { container } = render(ModNav);
		expect(modLinks(container)).toHaveLength(0);
		expect(get(enabledMods)).toEqual([]);
	});
});
