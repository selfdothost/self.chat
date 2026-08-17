import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { mount, flushSync, unmount } from 'svelte';
import { get, writable } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chatId, mobile, showArtifacts, showControls } from '$lib/stores';
import ContentRenderer from '$lib/components/chat/Messages/ContentRenderer.svelte';

// The HTML/SVG artifact preview — a model's ```html block rendering as a live
// page in the right-hand rail — died from three separate things, each of which
// keeps compiling and so survived eslint, svelte-check and the build:
//
//   1. ChatControls bound paneforge v1's `ref` (the pane's HTMLElement) where
//      the imperative API is a component export reached via bind:this, so
//      pane.resize() threw on a div and the rail never left defaultSize={0}.
//   2. Chat.svelte's loadChat trigger became an $effect, which runs after
//      onMount, so the new-chat subscriber armed and initNewChat() wiped the
//      chatId of the chat being loaded — and ContentRenderer gates on it.
//   3. paneforge notifies onCollapse once at registration for a collapsible
//      pane laid out at collapsedSize, which defaultSize={0} guarantees. That
//      notification cleared showControls, tearing down an auto-open that had
//      already happened — ContentRenderer sits earlier in Chat.svelte's markup
//      than ChatControls, so it opens the rail before the pane exists.

beforeAll(() => {
	if (!globalThis.ResizeObserver) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver;
	}
});

const chatControlsSrc = readFileSync(
	resolve(process.cwd(), 'src/lib/components/chat/ChatControls.svelte'),
	'utf-8'
);

const chatSrc = readFileSync(
	resolve(process.cwd(), 'src/lib/components/chat/Chat.svelte'),
	'utf-8'
);

describe('artifact preview: an html block opens the rail', () => {
	beforeEach(() => {
		showArtifacts.set(false);
		showControls.set(false);
		mobile.set(false);
		chatId.set('abc-123');
	});

	const renderContent = async (content: string) => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const app = mount(ContentRenderer, {
			target,
			props: {
				id: 'm1',
				content,
				history: { messages: {}, currentId: null },
				sources: [],
				save: false,
				floatingButtons: false,
				model: null
			},
			context: new Map([['i18n', writable({ t: (k: string) => k })]])
		});
		flushSync();
		await new Promise((r) => setTimeout(r, 200));
		flushSync();
		const state = { artifacts: get(showArtifacts), controls: get(showControls) };
		unmount(app);
		return state;
	};

	it('flips showArtifacts and showControls for a fenced html block', async () => {
		expect(await renderContent('Here you go:\n\n```html\n<h1>hi</h1>\n```\n')).toEqual({
			artifacts: true,
			controls: true
		});
	});

	it('leaves the rail alone for a language with no preview', async () => {
		expect(await renderContent('```python\nprint(1)\n```\n')).toEqual({
			artifacts: false,
			controls: false
		});
	});

	it('does not open the rail when no chat is loaded', async () => {
		// This is the gate regression 2 tripped: initNewChat() cleared chatId
		// mid-load, so the auto-open silently declined for every existing chat.
		chatId.set('');
		expect(await renderContent('```html\n<h1>hi</h1>\n```\n')).toEqual({
			artifacts: false,
			controls: false
		});
	});
});

describe('artifact preview: the rail can actually open', () => {
	it('binds the paneforge Pane by component instance, not by DOM ref', () => {
		const paneIdx = chatControlsSrc.indexOf('<Pane\n');
		expect(paneIdx).toBeGreaterThan(-1);
		const paneTag = chatControlsSrc.slice(paneIdx, chatControlsSrc.indexOf('>', paneIdx));
		expect(paneTag).toContain('bind:this={pane}');
		expect(paneTag).not.toContain('bind:ref={pane}');
	});

	it('still drives the pane through the imperative API it just bound', () => {
		// If these calls ever disappear the guard above is measuring nothing.
		expect(chatControlsSrc).toContain('pane.isExpanded()');
		expect(chatControlsSrc).toContain('pane.resize(');
		expect(chatSrc).toContain('controlPane.collapse()');
	});

	it('never resizes the pane to zero, which is itself a collapse', () => {
		const openPane = chatControlsSrc.slice(
			chatControlsSrc.indexOf('export const openPane'),
			chatControlsSrc.indexOf('const handleMediaQuery')
		);
		expect(openPane).toContain('if (size > 0)');
	});

	it('ignores paneforge’s registration onCollapse', () => {
		expect(chatControlsSrc).toContain('let registrationCollapseHandled = false;');
		const onCollapse = chatControlsSrc.slice(chatControlsSrc.indexOf('onCollapse={'));
		expect(onCollapse.slice(0, 200)).toContain('if (!registrationCollapseHandled)');
	});

	it('never calls pane.resize() from a resize notification', () => {
		// self.chat#33: a callback that writes what it reads makes Svelte abort and
		// tear down the reactive graph (effect_update_depth_exceeded), leaving a DOM
		// that paints but does not respond. Both of these called pane.resize() from
		// inside a resize notification; they were inert only while bind:ref left
		// `pane` as a <div> and every resize() threw. paneforge enforces minSize
		// itself now, via the prop.
		//
		// jsdom has no layout, so the loop itself cannot be reproduced here -- this
		// guards the invariant that prevents it, not the behaviour.
		expect(chatControlsSrc).toContain('{minSize}');

		// Comments in these blocks mention pane.resize() by name, so strip them.
		const code = (from: string, to: string) =>
			chatControlsSrc
				.slice(chatControlsSrc.indexOf(from), chatControlsSrc.indexOf(to))
				.split('\n')
				.filter((l) => !l.trim().startsWith('//'))
				.join('\n');

		expect(code('onResize={', 'onCollapse={')).not.toContain('pane.resize(');
		expect(code('new ResizeObserver', 'resizeObserver.observe')).not.toContain('pane.resize(');
	});

	it('sizes an already-open rail declaratively, not with a catch-up resize', () => {
		// Opening the rail after the fact means an imperative resize() whose
		// correctness depends on the mount path. defaultSize is read once, by
		// paneforge's first layout. See chat-controls-rail.test.ts for the
		// behavioural check that the pane is never briefly 0.
		expect(chatControlsSrc).toContain('const initialSize = (() => {');
		expect(chatControlsSrc).toContain('defaultSize={initialSize}');

		const onResize = chatControlsSrc.slice(chatControlsSrc.indexOf('onResize={'));
		expect(onResize.slice(0, 900)).not.toContain('openPane();');
	});
});

describe('artifact preview: loading a chat does not re-init it', () => {
	it('gates the new-chat subscriber on chatIdProp, not just the chatId store', () => {
		expect(chatSrc).toContain('if (!chatIdProp && !$chatId) {');
	});

	it('keeps initNewChat as the only caller of that subscriber', () => {
		const subscriberIdx = chatSrc.indexOf('chatIdUnsubscriber = chatId.subscribe');
		expect(subscriberIdx).toBeGreaterThan(-1);
		expect(chatSrc.slice(subscriberIdx, subscriberIdx + 200)).toContain('await initNewChat();');
	});
});
