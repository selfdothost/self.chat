import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import Folder from './Folder.svelte';
import CollapseHarness from './Folder.collapse.test.harness.svelte';

// jsdom shims for the bits-ui Tooltip layer used by the add affordance.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
	// Svelte's slide transition uses the Web Animations API, absent in jsdom.
	// Fire onfinish immediately so the outro completes and the node is removed.
	if (!Element.prototype.animate) {
		Element.prototype.animate = () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const anim: any = {
				cancel() {},
				play() {},
				pause() {},
				reverse() {},
				finished: Promise.resolve(),
				_onfinish: null,
				set onfinish(fn: (() => void) | null) {
					this._onfinish = fn;
					if (fn) fn();
				},
				get onfinish() {
					return this._onfinish;
				}
			};
			return anim as unknown as Animation;
		};
	}
});

describe('Folder (section header)', () => {
	// SO/R1 AC1: the section header renders its given name — the Sidebar passes
	// "Folders" (previously "Chats") to this same component.
	it('renders the section header name', () => {
		render(Folder, { props: { name: 'Folders', collapsible: true } });
		expect(screen.queryByText('Folders')).not.toBeNull();
	});

	// SO/R1 AC2: the add affordance still triggers its action (createFolder in the
	// Sidebar) — clicking the "+" invokes the onAdd callback, unchanged.
	it('invokes onAdd when the add affordance is used', async () => {
		const onAdd = vi.fn();
		render(Folder, {
			props: { name: 'Folders', collapsible: true, onAdd, onAddLabel: 'New Folder' }
		});

		const buttons = screen.getAllByRole('button');
		// The header toggle is the first button; the add ("+") affordance is the second.
		const addButton = buttons[buttons.length - 1];
		await fireEvent.pointerUp(addButton);

		expect(onAdd).toHaveBeenCalledTimes(1);
	});
});

describe('Folder collapse behavior (SO/R2)', () => {
	// SO/R2 AC1: collapsing the header hides the folder tree (the collapsible
	// content). Pinned chats + flat list are siblings OUTSIDE this component, so
	// this toggle cannot affect them (asserted structurally + via Cypress).
	it('hides its content (the folder tree) when collapsed and shows it when expanded', async () => {
		render(CollapseHarness);
		// Open by default -> tree visible.
		expect(screen.queryByTestId('folder-tree')).not.toBeNull();

		// Collapse via the header toggle.
		const header = screen.getByText('Folders');
		await fireEvent.pointerUp(header);
		await waitFor(() => expect(screen.queryByTestId('folder-tree')).toBeNull());

		// Expand again.
		await fireEvent.pointerUp(header);
		await waitFor(() => expect(screen.queryByTestId('folder-tree')).not.toBeNull());
	});

	// SO/R2 AC4: the collapse state is emitted via `change` -- the Sidebar persists
	// e.detail to localStorage('showFolders'), identical to the Pinned section.
	it('emits its collapse state on toggle (the value the Sidebar persists)', async () => {
		const onChange = vi.fn();
		render(CollapseHarness, { props: { onChange } });

		const header = screen.getByText('Folders');
		await fireEvent.pointerUp(header);

		await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
	});
});
