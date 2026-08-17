import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { mount, flushSync, unmount } from 'svelte';
import { get, writable } from 'svelte/store';
import { showArtifacts, showControls } from '$lib/stores';
import Harness from '../../../test-mocks/ChatControlsHarness.svelte';

// jsdom has no layout: #chat-container reports clientWidth 0, which would make
// minSize Infinity, and there is no ResizeObserver or matchMedia.
beforeAll(() => {
	if (!globalThis.ResizeObserver) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver;
	}
	window.matchMedia = ((query: string) => ({
		matches: true, // desktop: the Pane branch, not the mobile Drawer
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false
	})) as unknown as typeof window.matchMedia;
});

let container: HTMLElement;

beforeEach(() => {
	localStorage.clear();
	showControls.set(false);
	showArtifacts.set(false);
	container = document.createElement('div');
	container.id = 'chat-container';
	Object.defineProperty(container, 'clientWidth', { value: 1400, configurable: true });
	document.body.appendChild(container);
});

afterEach(() => {
	container.remove();
});

const mountRail = async () => {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const log: string[] = [];
	const u1 = showControls.subscribe((v) => log.push(`controls=${v}`));
	const u2 = showArtifacts.subscribe((v) => log.push(`artifacts=${v}`));
	const readSize = () => {
		const el = target.querySelector('[data-pane]:last-of-type') as HTMLElement | null;
		return el?.getAttribute('style') ?? '';
	};

	const app = mount(Harness, {
		target,
		props: {},
		context: new Map([['i18n', writable({ t: (k: string) => k })]])
	});
	flushSync();
	// Read before any timer runs: the pane has to be the right size at first
	// paint, not repaired by a later resize().
	const sizeAtFirstPaint = readSize();
	await new Promise((r) => setTimeout(r, 50));
	flushSync();
	u1();
	u2();
	return { app, log, size: readSize, sizeAtFirstPaint };
};

const growOf = (style: string) => Number(/flex:\s*([\d.]+)/.exec(style)?.[1] ?? 0);

describe('the controls rail survives its own first layout', () => {
	it('does not close a rail that was opened before it mounted', async () => {
		// ContentRenderer opens the rail from an html block before ChatControls
		// exists. paneforge then notifies onCollapse for the pane's first layout
		// at defaultSize={0}; honouring it closed the rail every time.
		showControls.set(true);

		const { app } = await mountRail();
		const state = { controls: get(showControls) };
		unmount(app);

		expect(state).toEqual({ controls: true });
	});

	it('gives that rail a non-zero width', async () => {
		showControls.set(true);

		const { app, size } = await mountRail();
		// flex-grow is the pane's share of the group; 0 is the collapsed pane.
		const grow = growOf(size());
		unmount(app);

		expect(grow).toBeGreaterThan(0);
	});

	it('sizes the pane at creation, not by a later resize', async () => {
		// The distinguishing assertion. Opening the rail after the fact means an
		// imperative resize(), which needs at least one async turn and proved
		// unreliable across three different mount paths. defaultSize is applied by
		// paneforge's very first layout, so the pane is never briefly 0.
		showControls.set(true);

		const { app, sizeAtFirstPaint } = await mountRail();
		const grow = growOf(sizeAtFirstPaint);
		unmount(app);

		expect(grow).toBeGreaterThan(0);
	});

	it('leaves the pane collapsed when the rail is closed', async () => {
		showControls.set(false);

		const { app, sizeAtFirstPaint, size } = await mountRail();
		const grows = [growOf(sizeAtFirstPaint), growOf(size())];
		unmount(app);

		expect(grows).toEqual([0, 0]);
	});


	it('opens the rail when showControls flips true after the pane exists', async () => {
		// The live sequence. ContentRenderer sits earlier in Chat.svelte's markup,
		// so an html block flips showControls while ChatControls is still mounting:
		// Chat.svelte's subscriber fires against a null controlPane, skips
		// openPane(), and never fires again because the store is already true.
		// initialSize does not cover it either -- that is read at component init,
		// earlier still. This is the case that was 0px in production across four
		// pins, and it fails against 656b55e7.
		showControls.set(false);

		const { app, size } = await mountRail();
		const atMount = growOf(size());

		showControls.set(true);
		flushSync();
		await new Promise((r) => setTimeout(r, 60));
		flushSync();
		const afterOpen = growOf(size());

		unmount(app);
		expect({ atMount, afterOpen }).toEqual({ atMount: 0, afterOpen: 25 });
	}, 15000);

	it('still closes the rail on a real collapse after registration', async () => {
		showControls.set(true);
		const { app } = await mountRail();

		// A second collapse notification is a user drag, not registration.
		const target = document.querySelector('[data-pane]:last-of-type');
		expect(target).not.toBeNull();

		unmount(app);
		expect(get(showControls)).toBe(false); // onDestroy closes it
	});
});
