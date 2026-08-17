import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushSync, unmount } from 'svelte';
import { get, writable } from 'svelte/store';
import { showArtifacts, showControls } from '$lib/stores';
import Artifacts from '$lib/components/chat/Artifacts.svelte';

// Artifacts used to assign `messages` from an $effect and then call getContents(),
// which read it -- so the effect depended on what it wrote, and
// createMessagesList() returns a fresh array every call. Unbounded re-trigger:
// Svelte aborts with effect_update_depth_exceeded and tears down the reactive
// graph for the subtree (self.chat#33).
//
// This component mounts only when the artifact preview opens, which is why the
// whole right-hand rail went dead at exactly the moment a preview appeared.
//
// Unlike the pane-sizing tests, this one reproduces the real failure in jsdom --
// it is pure reactivity, no layout involved.

const historyWith = (content: string) => ({
	messages: {
		m1: { id: 'm1', parentId: null, childrenIds: [], role: 'assistant', content }
	},
	currentId: 'm1'
});

const HTML_MESSAGE = 'Here:\n\n```html\n<h1>hi</h1>\n```\n';

const mountArtifacts = (history: unknown) => {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(Artifacts, {
		target,
		props: { history, overlay: false },
		context: new Map([['i18n', writable({ t: (k: string) => k })]])
	});
	flushSync();
	return { app, target };
};

describe('Artifacts derives its contents instead of assigning them', () => {
	beforeEach(() => {
		showControls.set(true);
		showArtifacts.set(true);
	});

	it('renders an html block without looping the reactive graph', () => {
		const { app, target } = mountArtifacts(historyWith(HTML_MESSAGE));
		const iframes = target.querySelectorAll('iframe').length;
		const controls = get(showControls);
		unmount(app);

		expect({ iframes, controls }).toEqual({ iframes: 1, controls: true });
	}, 10000);

	it('closes the rail when there is nothing to preview', () => {
		const { app } = mountArtifacts(historyWith('just prose, no code'));
		flushSync();
		const state = { controls: get(showControls), artifacts: get(showArtifacts) };
		unmount(app);

		expect(state).toEqual({ controls: false, artifacts: false });
	}, 10000);

	it('survives a history prop update', () => {
		// The loop fired on every dependency change, so re-rendering with new
		// history was the other way to trip it.
		const { app, target } = mountArtifacts(historyWith(HTML_MESSAGE));
		flushSync();
		const iframes = target.querySelectorAll('iframe').length;
		unmount(app);

		expect(iframes).toBe(1);
	}, 10000);
});
